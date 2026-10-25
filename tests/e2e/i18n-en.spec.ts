import { expect, test } from './fixtures';

// The fixture launches a persistent context with the test's locale, so this file
// runs with an English browser while the rest of the suite keeps the zh-CN default.
test.use({ locale: 'en-US' });

test('system language follows an English browser', async ({ context, extensionId }) => {
  const page = await context.newPage();
  await page.goto(`chrome-extension://${extensionId}/dashboard.html#/tabs`);
  await expect(page.locator('html')).toHaveAttribute('lang', 'en');
  await expect(page.getByRole('link', { name: 'Tabs', exact: true })).toBeVisible();
});
