import { resolve } from 'node:path';
import { type BrowserContext, test as base, chromium } from '@playwright/test';

const extensionPath = resolve('dist');

export const test = base.extend<{ context: BrowserContext; extensionId: string }>({
  context: async ({ locale }, use) => {
    const context = await chromium.launchPersistentContext('', {
      headless: false,
      locale,
      args: [`--disable-extensions-except=${extensionPath}`, `--load-extension=${extensionPath}`],
    });
    await use(context);
    await context.close();
  },
  extensionId: async ({ context }, use) => {
    let [worker] = context.serviceWorkers();
    if (!worker) worker = await context.waitForEvent('serviceworker');
    await use(new URL(worker.url()).host);
  },
});

export { expect } from '@playwright/test';
