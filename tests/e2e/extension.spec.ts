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
  await expect(dashboard.getByTestId('history-retention')).toContainText('最近 30 天');
  await expect(dashboard.getByTestId('history-retention')).toContainText('最多 5000 条');
  await expect(
    dashboard.getByText(
      '恢复到当前窗口时会尽量还原页面状态（如滚动位置、表单内容），无法还原时改为普通打开；重建原窗口时优先保证窗口和分组位置。',
    ),
  ).toBeVisible();
  const row = dashboard.locator('[data-testid^="history-row-"]').first();
  await row.locator('input[type="checkbox"]').check();
  await dashboard.getByTestId('history-restore').click();
  await expect
    .poll(async () => worker.evaluate(async () => (await chrome.tabs.query({})).map((tab) => tab.url)))
    .toEqual(expect.arrayContaining([expect.stringContaining('/a')]));
});

test('popup settings button has a comfortable target and accessible name', async ({ context, extensionId }) => {
  const popup = await context.newPage();
  await popup.goto(`chrome-extension://${extensionId}/popup.html`);

  const settings = popup.getByTestId('open-dashboard');
  await expect(settings).toHaveAttribute('aria-label', '打开控制台');
  await expect(settings).toHaveAttribute('title', '打开控制台');

  const box = await settings.boundingBox();
  expect(box).not.toBeNull();
  expect(box?.width).toBeGreaterThanOrEqual(36);
  expect(box?.height).toBeGreaterThanOrEqual(36);
});

test('tabs page shows strategy, readable status and expandable rows', async ({ context, extensionId }) => {
  const dashboard = await context.newPage();
  await dashboard.goto(`chrome-extension://${extensionId}/dashboard.html`);
  await seedUrlStrategy(dashboard);

  const keep = await context.newPage();
  await keep.goto('http://127.0.0.1:4173/keep');
  const a = await context.newPage();
  await a.goto('http://127.0.0.1:4173/a');
  const b = await context.newPage();
  await b.goto('http://127.0.0.1:4173/b');

  await dashboard.bringToFront();
  await dashboard.goto(`chrome-extension://${extensionId}/dashboard.html#/tabs`);

  await expect(dashboard.getByTestId('tabs-strategy')).toHaveText('E2E URL');

  const keepRow = dashboard.locator('.tab-row').filter({ hasText: 'Keep' });
  await expect(keepRow.locator('.tab-match')).toHaveText('保留');
  const aRow = dashboard.locator('.tab-row').filter({ hasText: 'Page A' });
  await expect(aRow.locator('.tab-match')).toHaveText('命中');

  await expect(dashboard.locator('[data-testid="tabs-window-filter"]')).toHaveCount(0);
  await expect(dashboard.locator('.tab-window')).toHaveCount(0);
  await expect(dashboard.locator('input[type="search"]')).toHaveAttribute('aria-label', '搜索标签页');

  const summary = aRow.locator('summary');
  expect(await summary.evaluate((element) => getComputedStyle(element, '::after').content)).not.toBe('none');
  await summary.click();
  await expect(aRow.locator('.tab-detail')).toBeVisible();
  await expect(aRow.locator('.tab-detail')).toContainText('规则判断');
});

test('tabs trace uses Chinese labels and aligned actual/expected columns', async ({ context, extensionId }) => {
  const dashboard = await context.newPage();
  await dashboard.goto(`chrome-extension://${extensionId}/dashboard.html#/tabs`);

  const keep = await context.newPage();
  await keep.goto('http://127.0.0.1:4173/keep');
  await dashboard.bringToFront();
  await dashboard.reload();

  const keepRow = dashboard.locator('.tab-row').filter({ hasText: 'Keep' });
  await keepRow.locator('summary').click();
  const trace = keepRow.locator('.trace');
  await expect(trace).toContainText('距最后访问');
  await expect(trace).not.toContainText('lastActiveMinutes');
  await expect(trace).toContainText('实际');
  await expect(trace).toContainText('期望');
  await expect(trace).toContainText('否');

  const actualLefts = await trace
    .locator('.trace-actual')
    .evaluateAll((nodes) => nodes.map((node) => Math.round(node.getBoundingClientRect().left)));
  const expectedLefts = await trace
    .locator('.trace-expected')
    .evaluateAll((nodes) => nodes.map((node) => Math.round(node.getBoundingClientRect().left)));
  expect(actualLefts.length).toBeGreaterThan(1);
  expect(new Set(actualLefts).size).toBe(1);
  expect(new Set(expectedLefts).size).toBe(1);
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

  const standardSummary = activeCard.locator('.strategy-card-summary');
  await expect(standardSummary.locator('.strategy-card-primary')).toHaveText('超过 3 天未访问');
  await expect(standardSummary.locator('.strategy-card-tag-label')).toHaveText('排除');
  await expect(standardSummary.locator('.strategy-tag')).toHaveText(['已固定', '播放中', '当前激活', '标签组中']);

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

test('strategies page scrolls to the active card when entering', async ({ context, extensionId }) => {
  const dashboard = await context.newPage();
  await dashboard.goto(`chrome-extension://${extensionId}/dashboard.html`);
  await seedUrlStrategy(dashboard);
  await dashboard.goto(`chrome-extension://${extensionId}/dashboard.html#/strategies`);

  const activeCard = dashboard.locator('.strategy-card.selected');
  await expect(activeCard).toContainText('E2E URL');
  await expect.poll(() => dashboard.evaluate(() => window.scrollY)).toBeGreaterThan(0);

  const editor = dashboard.locator('.editor-panel');
  const alignment = async (): Promise<number> => {
    const [cardBox, editorBox] = await Promise.all([activeCard.boundingBox(), editor.boundingBox()]);
    if (!cardBox || !editorBox) return Number.POSITIVE_INFINITY;
    return Math.abs(cardBox.y - editorBox.y);
  };
  await expect.poll(alignment).toBeLessThan(2);
});

test('editor aligns with the selected strategy card and scrolls it into view', async ({ context, extensionId }) => {
  const dashboard = await context.newPage();
  await dashboard.goto(`chrome-extension://${extensionId}/dashboard.html#/strategies`);

  const editor = dashboard.locator('.editor-panel');
  const alignment = async (testId: string): Promise<number> => {
    const [cardBox, editorBox] = await Promise.all([dashboard.getByTestId(testId).boundingBox(), editor.boundingBox()]);
    if (!cardBox || !editorBox) return Number.POSITIVE_INFINITY;
    return Math.abs(cardBox.y - editorBox.y);
  };

  await expect.poll(() => alignment('strategy-card-preset:standard')).toBeLessThan(2);

  const aggressiveCard = dashboard.getByTestId('strategy-card-preset:aggressive');
  await aggressiveCard.click();
  await expect(aggressiveCard).toHaveClass(/selected/);
  await expect.poll(() => alignment('strategy-card-preset:aggressive')).toBeLessThan(2);
  await expect.poll(() => dashboard.evaluate(() => window.scrollY)).toBeGreaterThan(0);
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
  await expect(draftCard.locator('.strategy-card-primary')).toHaveText('超过 3 天未访问');

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

test('settings shows a load error and can retry', async ({ context, extensionId }) => {
  const dashboard = await context.newPage();
  await dashboard.addInitScript(() => {
    const original = chrome.runtime.sendMessage;
    let failed = false;
    Object.defineProperty(chrome.runtime, 'sendMessage', {
      configurable: true,
      value: (message: { type?: string }, ...args: unknown[]) => {
        if (!failed && message?.type === 'state.get') {
          failed = true;
          return Promise.reject(new Error('模拟加载失败'));
        }
        return (original as (...rest: unknown[]) => unknown).apply(chrome.runtime, [message, ...args]);
      },
    });
  });

  await dashboard.goto(`chrome-extension://${extensionId}/dashboard.html#/settings`);
  await expect(dashboard.locator('.banner-error')).toHaveText('模拟加载失败');
  await expect(dashboard.getByText('正在加载设置…')).toHaveCount(0);

  await dashboard.getByTestId('settings-retry').click();
  await expect(dashboard.getByTestId('settings-idle')).toHaveValue('15');
  await expect(dashboard.locator('.banner-error')).toHaveCount(0);
});

test('settings save follows unsaved changes and clears stale notices', async ({ context, extensionId }) => {
  const dashboard = await context.newPage();
  await dashboard.goto(`chrome-extension://${extensionId}/dashboard.html#/settings`);

  const idle = dashboard.getByTestId('settings-idle');
  const save = dashboard.getByTestId('settings-save');
  await expect(idle).toHaveValue('15');
  await expect(save).toBeDisabled();

  await idle.fill('20');
  await expect(save).toBeEnabled();
  await save.click();
  await expect(dashboard.getByText('设置已保存')).toBeVisible();
  await expect(save).toBeDisabled();

  await idle.fill('21');
  await expect(dashboard.getByText('设置已保存')).toHaveCount(0);
  await expect(save).toBeEnabled();
});

test('settings number fields can be cleared and invalid values are rejected', async ({ context, extensionId }) => {
  const dashboard = await context.newPage();
  await dashboard.goto(`chrome-extension://${extensionId}/dashboard.html#/settings`);

  const idle = dashboard.getByTestId('settings-idle');
  const save = dashboard.getByTestId('settings-save');
  await expect(idle).toHaveValue('15');

  await idle.fill('');
  await expect(idle).toHaveValue('');
  await expect(save).toBeEnabled();
  await save.click();
  await expect(dashboard.locator('.banner-error')).toHaveText('空闲阈值需为 1–1440 分钟');

  await idle.fill('20');
  await expect(dashboard.locator('.banner-error')).toHaveCount(0);
  await save.click();
  await expect(dashboard.getByText('设置已保存')).toBeVisible();
  await expect(save).toBeDisabled();
});

test('settings disables saving while the update is in flight', async ({ context, extensionId }) => {
  const dashboard = await context.newPage();
  await dashboard.addInitScript(() => {
    const original = chrome.runtime.sendMessage;
    Object.defineProperty(chrome.runtime, 'sendMessage', {
      configurable: true,
      value: async (message: { type?: string }, ...args: unknown[]) => {
        if (message?.type === 'settings.update') {
          await new Promise((resolve) => setTimeout(resolve, 500));
        }
        return (original as (...rest: unknown[]) => unknown).apply(chrome.runtime, [message, ...args]);
      },
    });
  });

  await dashboard.goto(`chrome-extension://${extensionId}/dashboard.html#/settings`);
  const idle = dashboard.getByTestId('settings-idle');
  const save = dashboard.getByTestId('settings-save');
  await idle.fill('20');
  await save.click();
  await expect(save).toBeDisabled();
  await expect(save).toHaveText('保存中…');
  await expect(idle).toBeDisabled();
  await expect(dashboard.getByTestId('settings-retention')).toBeDisabled();
  await expect(dashboard.getByTestId('settings-lock-enabled')).toBeDisabled();
  await expect(dashboard.getByText('设置已保存')).toBeVisible();
  await expect(save).toHaveText('保存设置');
  await expect(save).toBeDisabled();
});

test('settings groups history retention and the history page shows the active policy', async ({
  context,
  extensionId,
}) => {
  const dashboard = await context.newPage();
  await dashboard.goto(`chrome-extension://${extensionId}/dashboard.html#/settings`);

  await expect(dashboard.getByRole('heading', { name: '空闲清理' })).toBeVisible();
  await expect(dashboard.getByRole('heading', { name: '锁屏清理' })).toBeVisible();
  await expect(dashboard.getByRole('heading', { name: '关闭历史', exact: true })).toBeVisible();
  await expect(dashboard.getByRole('heading', { name: '浏览器支持' })).toBeVisible();
  await expect(dashboard.getByTestId('settings-support-summary')).not.toContainText('最后访问时间 可用');

  const maxRecords = dashboard.getByTestId('settings-max-records');
  await expect(maxRecords).toHaveValue('5000');
  await dashboard.getByTestId('settings-retention').fill('7');
  await maxRecords.fill('120');
  await dashboard.getByTestId('settings-save').click();
  await expect(dashboard.getByText('设置已保存')).toBeVisible();

  await dashboard.goto(`chrome-extension://${extensionId}/dashboard.html#/history`);
  await expect(dashboard.getByTestId('history-retention')).toContainText('最近 7 天');
  await expect(dashboard.getByTestId('history-retention')).toContainText('最多 120 条');
});

test('settings restore defaults fills the form for review before saving', async ({ context, extensionId }) => {
  const dashboard = await context.newPage();
  dashboard.on('dialog', (dialog) => void dialog.accept());
  await dashboard.goto(`chrome-extension://${extensionId}/dashboard.html#/settings`);

  const idle = dashboard.getByTestId('settings-idle');
  const maxRecords = dashboard.getByTestId('settings-max-records');
  const save = dashboard.getByTestId('settings-save');
  const restore = dashboard.getByTestId('settings-restore-defaults');
  await expect(idle).toHaveValue('15');
  await expect(maxRecords).toHaveValue('5000');
  await expect(restore).toBeDisabled();

  await idle.fill('20');
  await save.click();
  await expect(dashboard.getByText('设置已保存')).toBeVisible();
  await expect(restore).toBeEnabled();

  await idle.fill('25');
  await restore.click();
  await expect(idle).toHaveValue('15');
  await expect(maxRecords).toHaveValue('5000');
  await expect(dashboard.getByTestId('settings-lock-enabled')).toBeChecked();
  await expect(dashboard.getByText('已恢复默认值，点击“保存设置”后生效。')).toBeVisible();
  await expect(save).toBeEnabled();

  await save.click();
  await expect(dashboard.getByText('设置已保存')).toBeVisible();
  await expect(save).toBeDisabled();
  await dashboard.reload();
  await expect(idle).toHaveValue('15');
  await expect(maxRecords).toHaveValue('5000');
});

test('settings clear history replaces stale banners', async ({ context, extensionId }) => {
  const worker = defined(context.serviceWorkers()[0], 'service worker');
  await seedHistory(worker, 'settings-clear');

  const dashboard = await context.newPage();
  dashboard.on('dialog', (dialog) => void dialog.accept());
  await dashboard.goto(`chrome-extension://${extensionId}/dashboard.html#/settings`);

  const idle = dashboard.getByTestId('settings-idle');
  await idle.fill('');
  await dashboard.getByTestId('settings-save').click();
  await expect(dashboard.locator('.banner-error')).toHaveText('空闲阈值需为 1–1440 分钟');

  await dashboard.getByTestId('settings-clear-history').click();
  await expect(dashboard.getByText('关闭历史已清空')).toBeVisible();
  await expect(dashboard.locator('.banner-error')).toHaveCount(0);

  await idle.fill('20');
  await expect(dashboard.getByText('关闭历史已清空')).toHaveCount(0);
});

test('history search, delete and clear work', async ({ context, extensionId }) => {
  const worker = defined(context.serviceWorkers()[0], 'service worker');
  await seedHistory(worker, 'seed-r1');

  const dashboard = await context.newPage();
  dashboard.on('dialog', (dialog) => void dialog.accept());
  await dashboard.goto(`chrome-extension://${extensionId}/dashboard.html#/history`);
  await expect(dashboard.getByTestId('history-total')).toContainText('1');
  await expect(dashboard.getByTestId('history-retention')).toContainText('最近 30 天');
  await expect(dashboard.getByTestId('history-retention')).toContainText('最多 5000 条');

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
