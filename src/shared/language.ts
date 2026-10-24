import type { Language, Locale } from './types';

export const DEFAULT_LANGUAGE: Language = 'system';

export function isLanguage(value: unknown): value is Language {
  return value === 'system' || value === 'zh' || value === 'en';
}

export function languageOf(value: unknown): Language {
  return isLanguage(value) ? value : DEFAULT_LANGUAGE;
}

export function resolveLocale(language: Language, browserLanguages: readonly string[]): Locale {
  if (language !== 'system') return language;
  const first = browserLanguages.find((item) => item.length > 0);
  return first?.toLowerCase().startsWith('zh') ? 'zh' : 'en';
}

export function browserLanguages(): string[] {
  if (typeof navigator === 'undefined') return [];
  return navigator.languages.length > 0 ? [...navigator.languages] : [navigator.language];
}
