import type { Page } from '@playwright/test';
import { expect } from './fixtures';

export async function switchLanguage(page: Page, value: 'system' | 'zh' | 'en'): Promise<void> {
  await page.getByTestId('settings-language').selectOption(value);
  await page.getByTestId('settings-save').click();
  await expect(page.getByTestId('settings-save')).toBeDisabled();
}
