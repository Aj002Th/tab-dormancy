import { beforeEach, describe, expect, it, vi } from 'vitest';
import { getLocale, setLocale, subscribeLocale, t, translate } from '../../src/shared/i18n';
import { en } from '../../src/shared/i18n/en';
import { zh } from '../../src/shared/i18n/zh';

describe('i18n', () => {
  beforeEach(() => setLocale('zh'));

  it('covers every Chinese key in English', () => {
    expect(Object.keys(en).sort()).toEqual(Object.keys(zh).sort());
  });

  it('translates and interpolates', () => {
    expect(t('nav.tabs')).toBe('标签页');
    expect(t('errors.invalidMaxRecords', { max: 5000 })).toContain('5000');
    setLocale('en');
    expect(t('nav.tabs')).toBe('Tabs');
    expect(t('errors.invalidMaxRecords', { max: 5000 })).toBe('History must keep between 1 and 5000 records');
  });

  it('notifies subscribers only on change', () => {
    const listener = vi.fn();
    const unsubscribe = subscribeLocale(listener);
    setLocale('zh');
    expect(listener).not.toHaveBeenCalled();
    setLocale('en');
    expect(listener).toHaveBeenCalledTimes(1);
    expect(getLocale()).toBe('en');
    unsubscribe();
  });

  it('supports English plurals through message functions', () => {
    expect(translate('en', 'time.minutesAgo', { count: 1 })).toBe('1 minute ago');
    expect(translate('en', 'time.minutesAgo', { count: 5 })).toBe('5 minutes ago');
    expect(translate('zh', 'time.minutesAgo', { count: 5 })).toBe('5 分钟前');
  });
});
