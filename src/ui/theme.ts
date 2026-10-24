import { STORAGE_KEYS } from '../shared/constants';
import { isTheme, themeOf } from '../shared/theme';
import type { Theme } from '../shared/types';

const CACHE_KEY = 'tab-dormancy:theme';

function storedTheme(value: unknown): Theme {
  if (!value || typeof value !== 'object') return themeOf(undefined);
  return themeOf((value as { theme?: unknown }).theme);
}

function cachedTheme(): Theme | null {
  try {
    const value = localStorage.getItem(CACHE_KEY);
    return isTheme(value) ? value : null;
  } catch {
    return null;
  }
}

export function primeTheme(): void {
  const cached = cachedTheme();
  if (cached) document.documentElement.dataset.theme = cached;
}

export function applyTheme(theme: Theme): void {
  document.documentElement.dataset.theme = theme;
  try {
    localStorage.setItem(CACHE_KEY, theme);
  } catch {
    // localStorage can be unavailable; the persisted setting still applies.
  }
}

export async function loadTheme(): Promise<Theme> {
  const stored = await chrome.storage.local.get(STORAGE_KEYS.settings);
  return storedTheme(stored[STORAGE_KEYS.settings]);
}

export function watchTheme(onTheme: (theme: Theme) => void): () => void {
  const listener = (changes: Record<string, chrome.storage.StorageChange>, areaName: string) => {
    if (areaName !== 'local') return;
    const change = changes[STORAGE_KEYS.settings];
    if (!change) return;
    onTheme(storedTheme(change.newValue));
  };
  chrome.storage.onChanged.addListener(listener);
  return () => chrome.storage.onChanged.removeListener(listener);
}

export function startTheme(): void {
  primeTheme();
  void loadTheme()
    .then(applyTheme)
    .catch(() => {
      // Keep the cached or system theme if storage is unavailable.
    });
  watchTheme(applyTheme);
}
