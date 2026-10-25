import { expect, test } from './fixtures';
import { switchLanguage } from './i18n-helpers';

test('language switches after saving and survives reload', async ({ context, extensionId }) => {
  const page = await context.newPage();
  await page.goto(`chrome-extension://${extensionId}/dashboard.html#/settings`);
  await expect(page).toHaveTitle('Tab Dormancy · 控制台');
  await expect(page.getByRole('link', { name: '标签页', exact: true })).toBeVisible();

  await switchLanguage(page, 'en');
  await expect(page.locator('html')).toHaveAttribute('lang', 'en');
  await expect(page.getByRole('link', { name: 'Tabs', exact: true })).toBeVisible();
  await expect(page).toHaveTitle('Tab Dormancy · Dashboard');

  await page.reload();
  await expect(page.getByRole('link', { name: 'Tabs', exact: true })).toBeVisible();
  await expect(page).toHaveTitle('Tab Dormancy · Dashboard');
});

test('discarding a language change keeps the previous language', async ({ context, extensionId }) => {
  const page = await context.newPage();
  await page.goto(`chrome-extension://${extensionId}/dashboard.html#/settings`);
  await page.getByTestId('settings-language').selectOption('en');
  await expect(page.getByRole('link', { name: '标签页', exact: true })).toBeVisible();
  await page.getByTestId('settings-discard').click();
  await expect(page.getByTestId('settings-language')).toHaveValue('system');
  await expect(page.locator('html')).toHaveAttribute('lang', 'zh-CN');
});

test('settings and diagnostics render in English', async ({ context, extensionId }) => {
  const page = await context.newPage();
  await page.goto(`chrome-extension://${extensionId}/dashboard.html#/settings`);
  await switchLanguage(page, 'en');

  await expect(page.getByRole('heading', { name: 'Settings', exact: true })).toBeVisible();
  await expect(page.getByText('Idle cleanup')).toBeVisible();
  await expect(page.getByRole('heading', { name: 'Closed history', exact: true })).toBeVisible();
  await expect(page.getByTestId('settings-save')).toHaveText('Save');
  await expect(page.getByTestId('settings-restore-defaults')).toHaveText('Restore defaults');

  await page.getByRole('link', { name: 'Diagnostics', exact: true }).click();
  await expect(page.getByRole('heading', { name: 'Diagnostics', exact: true })).toBeVisible();
  await expect(page.getByTestId('diagnostics-status')).toHaveText('All available');
  await expect(page.getByTestId('diagnostics-item-lastAccessed')).toContainText('Available');
});

test('tabs page renders in English', async ({ context, extensionId }) => {
  const page = await context.newPage();
  await page.goto(`chrome-extension://${extensionId}/dashboard.html#/settings`);
  await switchLanguage(page, 'en');
  await page.getByRole('link', { name: 'Tabs', exact: true }).click();
  await expect(page.getByRole('heading', { name: 'Tabs', exact: true })).toBeVisible();
  await expect(page.getByTestId('tabs-strategy')).toHaveText('Standard');
  await expect(page.getByText('Active strategy: Standard')).toBeVisible();
  await expect(page.getByPlaceholder('Search title, URL, or domain')).toBeVisible();
  await expect(page.getByRole('button', { name: 'Clean up' }).first()).toBeVisible();
});

test('closed history renders in English', async ({ context, extensionId }) => {
  const page = await context.newPage();
  await page.goto(`chrome-extension://${extensionId}/dashboard.html#/settings`);
  await switchLanguage(page, 'en');
  await page.getByRole('link', { name: 'Closed history', exact: true }).click();
  await expect(page.getByRole('heading', { name: 'Closed history', exact: true })).toBeVisible();
  await expect(page.getByText('No closed history.')).toBeVisible();
  await expect(page.getByPlaceholder('Search title, URL, or domain')).toBeVisible();
});

test('strategy names and editor render in English', async ({ context, extensionId }) => {
  const page = await context.newPage();
  await page.goto(`chrome-extension://${extensionId}/dashboard.html#/settings`);
  await switchLanguage(page, 'en');
  await page.getByRole('link', { name: 'Strategies', exact: true }).click();
  await expect(page.getByRole('heading', { name: 'Strategies', exact: true })).toBeVisible();
  await expect(page.getByText('Standard', { exact: true })).toBeVisible();
  await expect(page.getByText('Built-in', { exact: true }).first()).toBeVisible();
  await expect(page.getByTestId('new-strategy')).toHaveText('New strategy');
  await expect(page.getByTestId('rule-editor')).toContainText('Match all (AND)');
  await expect(page.getByLabel('Strategy name')).toHaveValue('Standard');
});

test('popup renders in the saved language', async ({ context, extensionId }) => {
  const dashboard = await context.newPage();
  await dashboard.goto(`chrome-extension://${extensionId}/dashboard.html#/settings`);
  await switchLanguage(dashboard, 'en');

  const popup = await context.newPage();
  await popup.goto(`chrome-extension://${extensionId}/popup.html`);
  await expect(popup.getByRole('button', { name: 'Open dashboard' })).toBeVisible();
  await expect(popup.getByText('Active strategy')).toBeVisible();
});

test('closed history row shows localized preset strategy name', async ({ context, extensionId }) => {
  const worker = context.serviceWorkers()[0];
  if (!worker) throw new Error('service worker missing');
  await worker.evaluate(async () => {
    const summary = {
      id: 'i18n-history',
      url: 'https://example.com/',
      title: 'Example',
      domain: 'example.com',
      closedAt: Date.now(),
      trigger: 'manual',
      status: 'closed',
      restoredAt: null,
    };
    const record = {
      ...summary,
      strategyId: 'preset:standard',
      strategyName: '标准',
      browserSessionId: 'i18n',
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
    await chrome.storage.local.set({ 'history:index': [summary], 'history:item:i18n-history': record });
  });

  const page = await context.newPage();
  await page.goto(`chrome-extension://${extensionId}/dashboard.html#/settings`);
  await switchLanguage(page, 'en');
  await page.getByRole('link', { name: 'Closed history', exact: true }).click();
  await expect(page.getByTestId('history-row-i18n-history')).toContainText('Standard');
});
