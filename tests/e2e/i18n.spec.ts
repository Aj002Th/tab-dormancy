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
