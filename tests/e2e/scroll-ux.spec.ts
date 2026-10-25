import { expect, test } from './fixtures';

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

test('entering strategies does not jump when the active card is already visible', async ({ context, extensionId }) => {
  const page = await context.newPage();
  await page.setViewportSize({ width: 900, height: 800 });
  await page.goto(`chrome-extension://${extensionId}/dashboard.html#/strategies`);

  const activeCard = page.locator('.strategy-card.selected');
  await expect(activeCard).toBeVisible();
  await page.waitForTimeout(400);

  expect(await page.evaluate(() => window.scrollY)).toBe(0);
  const card = await activeCard.boundingBox();
  const heading = await page.locator('.page-head h2').boundingBox();
  expect(heading?.y ?? Number.NEGATIVE_INFINITY).toBeGreaterThanOrEqual(0);
  expect((card?.y ?? Number.POSITIVE_INFINITY) + (card?.height ?? 0)).toBeLessThanOrEqual(800);
});
