import type { Page, Worker } from '@playwright/test';
import { defined } from '../helpers/assert-defined';
import { expect, test } from './fixtures';

async function seedUrlStrategy(page: Page): Promise<void> {
  await page.evaluate(async () => {
    const expression = {
      type: 'any',
      id: 'e2e-root',
      children: [
        { type: 'condition', id: 'e2e-a', fact: 'url', op: 'matchesGlob', value: '*://127.0.0.1:4173/a*' },
        { type: 'condition', id: 'e2e-b', fact: 'url', op: 'matchesGlob', value: '*://127.0.0.1:4173/b*' },
      ],
    };
    const strategy = {
      id: 'e2e',
      name: 'E2E URL',
      builtin: false,
      expression,
      createdAt: 0,
      updatedAt: 0,
      lastPreviewHash: null,
      lastPreviewAt: null,
    };
    const preview = await chrome.runtime.sendMessage({ type: 'strategy.preview', strategy });
    if (!preview.ok) throw new Error(preview.message);
    const saved = await chrome.runtime.sendMessage({
      type: 'strategy.save',
      strategy,
      previewSignature: preview.data.signature,
    });
    if (!saved.ok) throw new Error(saved.message);
    const activated = await chrome.runtime.sendMessage({ type: 'strategy.activate', id: saved.data.id });
    if (!activated.ok) throw new Error(activated.message);
  });
}

async function seedHistory(worker: Worker, id: string): Promise<void> {
  await worker.evaluate(async (recordId) => {
    const summary = {
      id: recordId,
      url: `https://seed.example.com/${recordId}`,
      title: `Seed ${recordId}`,
      domain: 'seed.example.com',
      closedAt: Date.now(),
      trigger: 'manual',
      status: 'closed',
      restoredAt: null,
    };
    const record = {
      ...summary,
      strategyId: 'preset:standard',
      strategyName: '标准',
      browserSessionId: 'e2e',
      windowId: 1,
      groupId: -1,
      groupTitle: '',
      groupColor: '',
      groupCollapsed: false,
      pinned: false,
      index: 0,
      sessionId: null,
      recovered: false,
    };
    await chrome.storage.local.set({ 'history:index': [summary], [`history:item:${recordId}`]: record });
  }, id);
}

test('idle/manual cleanup closes matching tabs and restores from history', async ({ context, extensionId }) => {
  const dashboard = await context.newPage();
  await dashboard.goto(`chrome-extension://${extensionId}/dashboard.html`);
  await seedUrlStrategy(dashboard);

  const keep = await context.newPage();
  await keep.goto('http://127.0.0.1:4173/keep');
  const a = await context.newPage();
  await a.goto('http://127.0.0.1:4173/a');
  const b = await context.newPage();
  await b.goto('http://127.0.0.1:4173/b');
  await keep.bringToFront();

  const popup = await context.newPage();
  await popup.goto(`chrome-extension://${extensionId}/popup.html`);
  await expect(popup.getByTestId('popup-preview-count')).toHaveText('2');
  await popup.getByTestId('cleanup-button').click();
  await popup.getByTestId('confirm-cleanup').click();
  await expect(popup.getByTestId('undo-button')).toBeVisible();

  const worker = defined(context.serviceWorkers()[0], 'service worker');
  const urls = await worker.evaluate(async () => (await chrome.tabs.query({})).map((tab) => tab.url));
  expect(urls.some((url) => url?.includes('/a'))).toBe(false);
  expect(urls.some((url) => url?.includes('/b'))).toBe(false);

  await dashboard.goto(`chrome-extension://${extensionId}/dashboard.html#/history`);
  await expect(dashboard.getByTestId('history-total')).toContainText('2');
  const row = dashboard.locator('[data-testid^="history-row-"]').first();
  await row.locator('input[type="checkbox"]').check();
  await dashboard.getByTestId('history-restore').click();
  await expect
    .poll(async () => worker.evaluate(async () => (await chrome.tabs.query({})).map((tab) => tab.url)))
    .toEqual(expect.arrayContaining([expect.stringContaining('/a')]));
});

test('custom strategy can be duplicated, previewed, saved and activated from the editor', async ({
  context,
  extensionId,
}) => {
  const dashboard = await context.newPage();
  await dashboard.goto(`chrome-extension://${extensionId}/dashboard.html#/strategies`);
  await expect(dashboard.getByTestId('new-strategy')).toBeVisible();

  await dashboard.getByTestId('strategy-duplicate-preset:standard').click();
  await expect(dashboard.getByTestId('rule-editor')).toBeVisible();
  // Wait for the duplicate's debounced preview to settle so an in-flight response
  // cannot later overwrite the edited draft's preview with a stale signature.
  await expect(dashboard.getByTestId('rule-preview-count')).toBeVisible();

  const numberInput = dashboard.getByTestId('rule-editor').locator('input[type="number"]').first();
  await numberInput.fill('2');
  // The edit clears the preview and re-debounces; wait for the preview that truly
  // reflects the edited expression before saving.
  await expect(dashboard.getByTestId('rule-preview-count')).toHaveCount(0);
  await expect(dashboard.getByTestId('rule-preview-count')).toBeVisible();

  await dashboard.getByTestId('save-strategy').click();
  await expect(dashboard.getByTestId('activate-strategy')).toBeEnabled();
  await dashboard.getByTestId('activate-strategy').click();
  await expect(dashboard.locator('.banner-error')).toHaveCount(0);
  await expect(dashboard.locator('.strategy-card').last()).toContainText('标准 副本');
});

test('active unchanged strategy disables save actions until content changes', async ({ context, extensionId }) => {
  const dashboard = await context.newPage();
  await dashboard.goto(`chrome-extension://${extensionId}/dashboard.html`);
  await seedUrlStrategy(dashboard);
  await dashboard.goto(`chrome-extension://${extensionId}/dashboard.html#/strategies`);

  const activeCard = dashboard.getByRole('button', { name: '选择策略 E2E URL' });
  await expect(activeCard).toHaveAttribute('aria-pressed', 'true');
  await expect(dashboard.getByTestId('rule-preview-count')).toBeVisible();

  const save = dashboard.getByTestId('save-strategy');
  const saveAndActivate = dashboard.getByTestId('activate-strategy');
  await expect(save).toBeDisabled();
  await expect(saveAndActivate).toBeDisabled();

  await dashboard.getByLabel('策略名称').fill('E2E URL 修改');
  await expect(save).toBeEnabled();
  await expect(saveAndActivate).toBeEnabled();
});

test('strategy editor clears stale preview errors after the expression becomes valid again', async ({
  context,
  extensionId,
}) => {
  const dashboard = await context.newPage();
  await dashboard.goto(`chrome-extension://${extensionId}/dashboard.html#/strategies`);
  await dashboard.getByTestId('strategy-duplicate-preset:standard').click();
  await expect(dashboard.getByTestId('rule-editor')).toBeVisible();

  const editor = dashboard.getByTestId('rule-editor');
  for (let index = 0; index < 9; index += 1) {
    await editor.locator('.group-card').last().getByRole('button', { name: '+ 子组' }).click();
  }

  await expect(dashboard.getByText('表达式深度不能超过 8')).toBeVisible();

  await editor.locator('.group-card').last().getByRole('button', { name: '删除组' }).click();
  await expect(dashboard.locator('.banner-error')).toHaveCount(0);
});

test('strategy cards reflect active state and open the editor on click', async ({ context, extensionId }) => {
  const dashboard = await context.newPage();
  await dashboard.goto(`chrome-extension://${extensionId}/dashboard.html#/strategies`);

  const activeCard = dashboard.getByTestId('strategy-card-preset:standard');
  const mildCard = dashboard.getByTestId('strategy-card-preset:mild');
  await expect(activeCard).toBeVisible();
  await expect(activeCard).toHaveClass(/selected/);
  const activeButton = activeCard.getByRole('button', { name: '启用中' });
  await expect(activeButton).toBeDisabled();
  await expect(activeButton).toHaveClass(/btn-active/);

  await mildCard.click();
  await expect(mildCard).toHaveClass(/selected/);
  await expect(activeCard).not.toHaveClass(/selected/);
  await expect(dashboard.getByTestId('rule-editor')).toBeVisible();
  await expect(mildCard).toContainText('7 天');
  await expect(dashboard.getByTestId('save-strategy')).toHaveCount(0);

  await expect(dashboard.getByRole('button', { name: '编辑' })).toHaveCount(0);
  await expect(dashboard.getByRole('button', { name: '关闭' })).toHaveCount(0);

  const oneOptionSelects = await dashboard
    .getByTestId('rule-editor')
    .locator('select')
    .evaluateAll(
      (selects) =>
        selects.filter((select) => select instanceof HTMLSelectElement && select.options.length === 1).length,
    );
  expect(oneOptionSelects).toBe(0);
});

test('creating a strategy shows a live draft card that can be cancelled', async ({ context, extensionId }) => {
  const dashboard = await context.newPage();
  await dashboard.goto(`chrome-extension://${extensionId}/dashboard.html#/strategies`);

  await dashboard.getByTestId('new-strategy').click();

  const draftCard = dashboard.getByTestId('strategy-card-draft');
  await expect(draftCard).toBeVisible();
  await expect(draftCard).toHaveClass(/selected/);
  await expect(draftCard).toContainText('草稿');
  await expect(dashboard.locator('.strategy-card').last()).toHaveAttribute('data-testid', 'strategy-card-draft');
  await expect(draftCard.getByRole('button', { name: '取消' })).toHaveCount(0);

  await dashboard.getByLabel('策略名称').fill('临时策略');
  await expect(draftCard).toContainText('临时策略');
  await expect(draftCard).toContainText('距最后访问 大于 3 天');

  await dashboard.getByTestId('cancel-strategy').click();
  await expect(draftCard).toHaveCount(0);
  await expect(dashboard.getByTestId('strategy-card-preset:standard')).toHaveClass(/selected/);
});

test('strategy preview shows matching tab examples on hover', async ({ context, extensionId }) => {
  const dashboard = await context.newPage();
  await dashboard.goto(`chrome-extension://${extensionId}/dashboard.html#/strategies`);

  const previewA = await context.newPage();
  await previewA.goto('http://127.0.0.1:4173/preview-a');
  const previewB = await context.newPage();
  await previewB.goto('http://127.0.0.1:4173/preview-b');
  await dashboard.bringToFront();

  await dashboard.getByTestId('new-strategy').click();
  const condition = dashboard.getByTestId('rule-editor').locator('.condition-row').first();
  await condition.locator('select').nth(1).selectOption('gte');
  await condition.locator('input[type="number"]').fill('0');

  const previewCount = dashboard.getByTestId('rule-preview-count');
  await expect(previewCount).toContainText(/将关闭 [1-9]\d* 个标签/);
  await previewCount.hover();

  const sample = dashboard.getByTestId('rule-preview-sample');
  await expect(sample).toBeVisible();
  await expect(sample).toContainText('/preview-a');
  await expect(sample).toContainText('/preview-b');
  const sampleCount = await sample.locator('li').count();
  expect(sampleCount).toBeGreaterThan(0);
  expect(sampleCount).toBeLessThanOrEqual(5);
});

test('history search, delete and clear work', async ({ context, extensionId }) => {
  const worker = defined(context.serviceWorkers()[0], 'service worker');
  await seedHistory(worker, 'seed-r1');

  const dashboard = await context.newPage();
  dashboard.on('dialog', (dialog) => void dialog.accept());
  await dashboard.goto(`chrome-extension://${extensionId}/dashboard.html#/history`);
  await expect(dashboard.getByTestId('history-total')).toContainText('1');

  await dashboard.getByTestId('history-search').fill('seed');
  await expect(dashboard.getByTestId('history-row-seed-r1')).toBeVisible();
  await dashboard.getByTestId('history-search').fill('missing');
  await expect(dashboard.getByTestId('history-row-seed-r1')).toHaveCount(0);
  await dashboard.getByTestId('history-search').fill('seed');

  await dashboard.getByTestId('history-select-seed-r1').check();
  await dashboard.getByTestId('history-delete').click();
  await expect(dashboard.getByTestId('history-total')).toContainText('0');

  await seedHistory(worker, 'seed-r2');
  await dashboard.reload();
  await expect(dashboard.getByTestId('history-total')).toContainText('1');
  await dashboard.getByTestId('history-clear').click();
  await expect(dashboard.getByTestId('history-total')).toContainText('0');
});
