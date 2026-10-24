import { useEffect, useState } from 'preact/hooks';
import { STORAGE_KEYS } from '../shared/constants';
import { getLocale, setLocale, subscribeLocale } from '../shared/i18n';
import { browserLanguages, languageOf, resolveLocale } from '../shared/language';
import type { Language, Locale } from '../shared/types';

const CACHE_KEY = 'tab-dormancy:locale';

function cachedLocale(): Locale | null {
  try {
    const value = localStorage.getItem(CACHE_KEY);
    return value === 'zh' || value === 'en' ? value : null;
  } catch {
    return null;
  }
}

function paint(locale: Locale): void {
  setLocale(locale);
  document.documentElement.lang = locale === 'zh' ? 'zh-CN' : 'en';
  try {
    localStorage.setItem(CACHE_KEY, locale);
  } catch {
    // localStorage can be unavailable; the saved setting still applies.
  }
}

export function applyLanguage(language: Language): void {
  paint(resolveLocale(language, browserLanguages()));
}

export function startLanguage(): void {
  const cached = cachedLocale();
  if (cached) paint(cached);

  const read = (value: unknown) => {
    if (!value || typeof value !== 'object') return;
    applyLanguage(languageOf((value as { language?: unknown }).language));
  };

  void chrome.storage.local
    .get(STORAGE_KEYS.settings)
    .then((stored) => read(stored[STORAGE_KEYS.settings]))
    .catch(() => {});

  chrome.storage.onChanged.addListener((changes, areaName) => {
    if (areaName !== 'local') return;
    const change = changes[STORAGE_KEYS.settings];
    if (change) read(change.newValue);
  });
}

export function useLocale(): Locale {
  const [value, setValue] = useState(getLocale);
  useEffect(() => subscribeLocale(() => setValue(getLocale())), []);
  return value;
}
