import type { Locator, Page } from '@playwright/test';
import { expect } from './fixtures';

export async function chooseSelect(root: Locator, value: string): Promise<void> {
  await root.click();
  await root.page().locator(`[role="option"][data-value="${value}"]`).click();
}

export async function switchLanguage(page: Page, value: 'system' | 'zh' | 'en'): Promise<void> {
  await chooseSelect(page.getByTestId('settings-language'), value);
  await page.getByTestId('settings-save').click();
  await expect(page.getByTestId('settings-save')).toBeDisabled();
}
