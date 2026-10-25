import { expect, test } from './fixtures';

type Rect = { top: number; bottom: number };

async function geometry(
  page: import('@playwright/test').Page,
): Promise<{ scrollY: number; viewport: number; card: Rect | null; editor: Rect | null }> {
  return page.evaluate(() => {
    const box = (selector: string) => {
      const element = document.querySelector(selector);
      if (!element) return null;
      const rect = element.getBoundingClientRect();
      return { top: rect.top, bottom: rect.bottom };
    };
    return {
      scrollY: window.scrollY,
      viewport: window.innerHeight,
      card: box('.strategy-card.selected'),
      editor: box('.editor-panel'),
    };
  });
}

async function expectFullyVisible(page: import('@playwright/test').Page): Promise<void> {
  await expect
    .poll(async () => {
      const { card, editor, viewport } = await geometry(page);
      return (
        card !== null &&
        editor !== null &&
        card.top >= 0 &&
        card.bottom <= viewport + 1 &&
        editor.top >= 0 &&
        editor.bottom <= viewport + 1
      );
    })
    .toBe(true);
}

test('sidebar stays pinned and the note sits at the bottom while the page scrolls', async ({
  context,
  extensionId,
}) => {
  const page = await context.newPage();
  await page.setViewportSize({ width: 900, height: 800 });
  await page.goto(`chrome-extension://${extensionId}/dashboard.html#/settings`);
  await page.locator('.settings-sections').waitFor();

  await page.evaluate(() => window.scrollTo(0, document.documentElement.scrollHeight));
  await expect.poll(() => page.evaluate(() => window.scrollY)).toBeGreaterThan(0);

  const sidebar = await page.locator('.sidebar').boundingBox();
  const note = await page.locator('.sidebar-note').boundingBox();
  expect(sidebar).not.toBeNull();
  expect(note).not.toBeNull();
  if (!sidebar || !note) return;

  expect(sidebar.y).toBeCloseTo(0, 1);
  expect(await page.locator('.nav-link').first().isVisible()).toBe(true);
  expect(note.y + note.height).toBeGreaterThan(sidebar.y + sidebar.height - 40);
});

test('entering strategies does not scroll when the card and editor already fit', async ({ context, extensionId }) => {
  const page = await context.newPage();
  // 1280x720 leaves only ~17px of slack below the editor on macOS. Linux font
  // metrics make the stack ~27px taller, which legitimately triggers a small
  // scroll to keep the 16px bottom gutter. Use a viewport with clear headroom
  // so the assertion covers "no scroll when it fits", not exact font metrics.
  await page.setViewportSize({ width: 1280, height: 900 });
  await page.goto(`chrome-extension://${extensionId}/dashboard.html#/strategies`);

  await expect(page.locator('.strategy-card.selected')).toBeVisible();
  await expectFullyVisible(page);

  expect(await page.evaluate(() => window.scrollY)).toBe(0);
});

test('entering strategies reveals the whole editor in a stacked layout', async ({ context, extensionId }) => {
  const page = await context.newPage();
  await page.setViewportSize({ width: 900, height: 800 });
  await page.goto(`chrome-extension://${extensionId}/dashboard.html#/strategies`);

  await expect(page.locator('.strategy-card.selected')).toBeVisible();
  await expectFullyVisible(page);
  expect(await page.evaluate(() => window.scrollY)).toBeGreaterThan(0);
});

test('entering strategies reveals the whole editor in a short window', async ({ context, extensionId }) => {
  const page = await context.newPage();
  await page.setViewportSize({ width: 1280, height: 600 });
  await page.goto(`chrome-extension://${extensionId}/dashboard.html#/strategies`);

  await expect(page.locator('.strategy-card.selected')).toBeVisible();
  await expectFullyVisible(page);
  expect(await page.evaluate(() => window.scrollY)).toBeGreaterThan(0);
});
