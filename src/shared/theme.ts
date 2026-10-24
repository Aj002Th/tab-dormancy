import type { Theme } from './types';

export const DEFAULT_THEME: Theme = 'system';

export function isTheme(value: unknown): value is Theme {
  return value === 'system' || value === 'light' || value === 'dark';
}

export function themeOf(value: unknown): Theme {
  return isTheme(value) ? value : DEFAULT_THEME;
}
