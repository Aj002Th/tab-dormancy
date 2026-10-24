import { defineConfig } from '@playwright/test';

export default defineConfig({
  testDir: './tests/e2e',
  timeout: 30_000,
  fullyParallel: false,
  use: { headless: false, locale: 'zh-CN' },
  webServer: {
    command: 'node tests/e2e/test-server.mjs',
    port: 4173,
    reuseExistingServer: true,
  },
});
