import { beforeAll, describe, expect, it } from 'vitest';
import { setLocale } from '../../src/shared/i18n';
import type { Settings } from '../../src/shared/types';
import {
  isSettingsDirty,
  parseSettingsForm,
  type SettingsForm,
  toSettingsForm,
} from '../../src/ui/dashboard/settings-form';

beforeAll(() => {
  setLocale('zh');
});

const saved: Settings = {
  idleThresholdMinutes: 15,
  lockCleanupEnabled: true,
  lockDelayMinutes: 15,
  historyRetentionDays: 30,
  historyMaxRecords: 5_000,
  activeStrategyId: 'preset:standard',
  theme: 'system',
  language: 'system',
};

function form(patch: Partial<SettingsForm> = {}): SettingsForm {
  return { ...toSettingsForm(saved), ...patch };
}

describe('settings form', () => {
  it('converts numeric settings into editable strings', () => {
    expect(toSettingsForm(saved)).toEqual({
      idleThresholdMinutes: '15',
      lockCleanupEnabled: true,
      lockDelayMinutes: '15',
      historyRetentionDays: '30',
      historyMaxRecords: '5000',
      theme: 'system',
      language: 'system',
    });
  });

  it('parses valid values into a settings patch', () => {
    expect(
      parseSettingsForm({
        idleThresholdMinutes: '30',
        lockCleanupEnabled: false,
        lockDelayMinutes: '0',
        historyRetentionDays: '7',
        historyMaxRecords: '120',
        theme: 'dark',
        language: 'system',
      }),
    ).toEqual({
      patch: {
        idleThresholdMinutes: 30,
        lockCleanupEnabled: false,
        lockDelayMinutes: 0,
        historyRetentionDays: 7,
        historyMaxRecords: 120,
        theme: 'dark',
        language: 'system',
      },
    });
  });

  it('rejects unsupported theme values', () => {
    expect(parseSettingsForm(form({ theme: 'sepia' as SettingsForm['theme'] }))).toEqual({
      error: '外观主题无效',
    });
  });

  it.each([
    ['empty idle threshold', { idleThresholdMinutes: '' }, '空闲阈值需为 1–1440 分钟'],
    ['zero idle threshold', { idleThresholdMinutes: '0' }, '空闲阈值需为 1–1440 分钟'],
    ['too large idle threshold', { idleThresholdMinutes: '1441' }, '空闲阈值需为 1–1440 分钟'],
    ['fractional idle threshold', { idleThresholdMinutes: '1.5' }, '空闲阈值需为 1–1440 分钟'],
    ['non-numeric idle threshold', { idleThresholdMinutes: 'abc' }, '空闲阈值需为 1–1440 分钟'],
    ['empty lock delay', { lockDelayMinutes: '' }, '锁屏延迟需为 0–1440 分钟'],
    ['negative lock delay', { lockDelayMinutes: '-1' }, '锁屏延迟需为 0–1440 分钟'],
    ['too large lock delay', { lockDelayMinutes: '1441' }, '锁屏延迟需为 0–1440 分钟'],
    ['empty retention', { historyRetentionDays: '' }, '历史保留需为 1–365 天'],
    ['zero retention', { historyRetentionDays: '0' }, '历史保留需为 1–365 天'],
    ['too large retention', { historyRetentionDays: '366' }, '历史保留需为 1–365 天'],
    ['empty max records', { historyMaxRecords: '' }, '历史保留条数需为 1–5000 条'],
    ['zero max records', { historyMaxRecords: '0' }, '历史保留条数需为 1–5000 条'],
    ['too large max records', { historyMaxRecords: '5001' }, '历史保留条数需为 1–5000 条'],
    ['fractional max records', { historyMaxRecords: '1.5' }, '历史保留条数需为 1–5000 条'],
    ['non-numeric max records', { historyMaxRecords: 'abc' }, '历史保留条数需为 1–5000 条'],
  ])('rejects %s', (_name, patch, message) => {
    expect(parseSettingsForm(form(patch))).toEqual({ error: message });
  });

  it('returns validation errors in the active language', () => {
    setLocale('en');
    try {
      expect(parseSettingsForm(form({ theme: 'sepia' as SettingsForm['theme'] }))).toEqual({
        error: 'Invalid appearance theme',
      });
      expect(parseSettingsForm(form({ idleThresholdMinutes: '' }))).toEqual({
        error: 'Idle threshold must be between 1 and 1440 minutes',
      });
      expect(parseSettingsForm(form({ historyMaxRecords: '5001' }))).toEqual({
        error: 'History must keep between 1 and 5000 records',
      });
      expect(parseSettingsForm(form({ language: 'fr' as SettingsForm['language'] }))).toEqual({
        error: 'Invalid interface language',
      });
    } finally {
      setLocale('zh');
    }
  });

  it('detects changes to every editable setting', () => {
    expect(isSettingsDirty(form(), saved)).toBe(false);
    expect(isSettingsDirty(form({ idleThresholdMinutes: '16' }), saved)).toBe(true);
    expect(isSettingsDirty(form({ lockCleanupEnabled: false }), saved)).toBe(true);
    expect(isSettingsDirty(form({ lockDelayMinutes: '0' }), saved)).toBe(true);
    expect(isSettingsDirty(form({ historyRetentionDays: '7' }), saved)).toBe(true);
    expect(isSettingsDirty(form({ historyMaxRecords: '120' }), saved)).toBe(true);
    expect(isSettingsDirty(form({ theme: 'dark' }), saved)).toBe(true);
    expect(isSettingsDirty(form({ language: 'en' }), saved)).toBe(true);
  });

  it('ignores the active strategy when comparing settings', () => {
    expect(isSettingsDirty(form(), { ...saved, activeStrategyId: 'preset:mild' })).toBe(false);
  });

  it('includes language in the form and dirty check', () => {
    const parsed = parseSettingsForm(form({ language: 'en' }));
    expect('patch' in parsed && parsed.patch.language).toBe('en');
    expect(isSettingsDirty(form({ language: 'en' }), saved)).toBe(true);
  });

  it('rejects invalid language values', () => {
    expect(parseSettingsForm(form({ language: 'fr' as SettingsForm['language'] }))).toEqual({
      error: '界面语言无效',
    });
  });
});
