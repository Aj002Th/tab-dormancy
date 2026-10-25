import { expect, test } from './fixtures';
import { switchLanguage } from './i18n-helpers';

test('language switches after saving and survives reload', async ({ context, extensionId }) => {
  const page = await context.newPage();
  await page.goto(`chrome-extension://${extensionId}/dashboard.html#/settings`);
  await expect(page.getByRole('link', { name: '标签页', exact: true })).toBeVisible();

  await switchLanguage(page, 'en');
  await expect(page.locator('html')).toHaveAttribute('lang', 'en');
  await expect(page.getByRole('link', { name: 'Tabs', exact: true })).toBeVisible();

  await page.reload();
  await expect(page.getByRole('link', { name: 'Tabs', exact: true })).toBeVisible();
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
