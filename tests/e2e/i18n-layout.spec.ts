import { expect, test } from './fixtures';

// English labels are longer than their Chinese counterparts. Compact controls in
// the page header must keep their intrinsic width instead of being squeezed by
// the description next to them.
test.use({ locale: 'en-US' });

async function lineCount(locator: import('@playwright/test').Locator): Promise<number> {
  return locator.evaluate((element) => {
    const range = document.createRange();
    range.selectNodeContents(element);
    const tops = new Set(
      [...range.getClientRects()]
        .filter((rect) => rect.width > 1 && rect.height > 1)
        .map((rect) => Math.round(rect.top)),
    );
    return tops.size;
  });
}

test('English header actions and totals stay on one line', async ({ context, extensionId }) => {
  const page = await context.newPage();

  for (const width of [1280, 1100, 980, 760]) {
    await page.setViewportSize({ width, height: 800 });

    await page.goto(`chrome-extension://${extensionId}/dashboard.html#/tabs`);
    const cleanup = page.getByTestId('dashboard-cleanup');
    await expect(cleanup).toHaveText('Clean up 0');
    expect(await lineCount(cleanup), `cleanup button at ${width}px`).toBe(1);

    await page.goto(`chrome-extension://${extensionId}/dashboard.html#/strategies`);
    const create = page.getByTestId('new-strategy');
    await expect(create).toHaveText('New strategy');
    expect(await lineCount(create), `new strategy button at ${width}px`).toBe(1);

    await page.goto(`chrome-extension://${extensionId}/dashboard.html#/history`);
    const total = page.getByTestId('history-total');
    await expect(total).toHaveText(/\d+ records?/);
    expect(await lineCount(total), `history total at ${width}px`).toBe(1);
  }
});
