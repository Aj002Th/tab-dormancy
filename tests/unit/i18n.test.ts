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
    expect(translate('en', 'popup.tabsToClean', { count: 1 })).toBe('tab can be cleaned');
    expect(translate('en', 'popup.tabsToClean', { count: 2 })).toBe('tabs can be cleaned');
    expect(translate('zh', 'popup.tabsToClean', { count: 2 })).toBe('个标签可清理');
    expect(translate('en', 'tabs.confirm', { count: 1 })).toBe('Close 1 tab? It stays in history and can be restored.');
    expect(translate('en', 'tabs.confirm', { count: 2 })).toBe(
      'Close 2 tabs? They stay in history and can be restored.',
    );
    expect(translate('en', 'popup.confirmClean', { count: 1 })).toBe(
      'Close 1 tab? You can restore it from the dashboard.',
    );
    expect(translate('en', 'popup.confirmClean', { count: 2 })).toBe(
      'Close 2 tabs? You can restore them from the dashboard.',
    );
  });

  it('localizes the quick cleanup copy', () => {
    expect(translate('zh', 'popup.quickDone', { name: '工作', count: 3 })).toBe('已用「工作」关闭 3 个标签');
    expect(translate('en', 'popup.quickDone', { name: 'Work', count: 3 })).toBe('Closed 3 tabs with "Work"');
    expect(translate('zh', 'strategies.quickLimit', { max: 4 })).toBe('最多选择 4 条快速清理策略');
    expect(translate('zh', 'strategies.quickHint')).toBe('在弹窗中显示为手动清理按钮');
    expect(translate('en', 'strategies.quickHint')).toBe('Shown as a manual button in the popup');
  });

  it('localizes the two-step quick cleanup copy', () => {
    expect(translate('zh', 'popup.quickConfirm')).toBe('确认');
    expect(translate('en', 'popup.quickCancel')).toBe('Cancel');
    expect(translate('zh', 'popup.quickConfirmAria', { name: '工作', count: 3 })).toBe('用「工作」关闭 3 个标签');
    expect(translate('en', 'popup.quickCancelAria', { name: 'Work' })).toBe('Cancel cleaning with "Work"');
    expect(translate('zh', 'settings.quickCleanupRange')).toBe('1–8 条');
    expect(translate('en', 'settings.quickCleanupHelp')).toBe('How many quick cleanup items the popup offers');
  });
});
