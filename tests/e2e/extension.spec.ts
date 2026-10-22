import type { Page, Worker } from '@playwright/test';
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

  const worker = context.serviceWorkers()[0]!;
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
});

test('history search, delete and clear work', async ({ context, extensionId }) => {
  const worker = context.serviceWorkers()[0]!;
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
