import { describe, expect, it } from 'vitest';
import { isLanguage, languageOf, resolveLocale } from '../../src/shared/language';

describe('language', () => {
  it('validates language values', () => {
    expect(isLanguage('system')).toBe(true);
    expect(isLanguage('zh')).toBe(true);
    expect(isLanguage('en')).toBe(true);
    expect(isLanguage('ja')).toBe(false);
    expect(isLanguage(undefined)).toBe(false);
  });

  it('falls back to system for invalid values', () => {
    expect(languageOf('en')).toBe('en');
    expect(languageOf('ja')).toBe('system');
    expect(languageOf(null)).toBe('system');
  });

  it('resolves explicit languages directly', () => {
    expect(resolveLocale('zh', ['en-US'])).toBe('zh');
    expect(resolveLocale('en', ['zh-CN'])).toBe('en');
  });

  it('follows Chinese browser languages and defaults others to English', () => {
    expect(resolveLocale('system', ['zh-CN', 'en-US'])).toBe('zh');
    expect(resolveLocale('system', ['zh-TW'])).toBe('zh');
    expect(resolveLocale('system', ['en-US'])).toBe('en');
    expect(resolveLocale('system', ['ja-JP'])).toBe('en');
    expect(resolveLocale('system', [])).toBe('en');
  });
});
