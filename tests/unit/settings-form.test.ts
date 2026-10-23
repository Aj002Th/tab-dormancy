import { describe, expect, it } from 'vitest';
import type { Settings } from '../../src/shared/types';
import {
  isSettingsDirty,
  parseSettingsForm,
  type SettingsForm,
  toSettingsForm,
} from '../../src/ui/dashboard/settings-form';

const saved: Settings = {
  idleThresholdMinutes: 15,
  lockCleanupEnabled: true,
  lockDelayMinutes: 15,
  historyRetentionDays: 30,
  activeStrategyId: 'preset:standard',
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
    });
  });

  it('parses valid values into a settings patch', () => {
    expect(
      parseSettingsForm({
        idleThresholdMinutes: '30',
        lockCleanupEnabled: false,
        lockDelayMinutes: '0',
        historyRetentionDays: '7',
      }),
    ).toEqual({
      patch: {
        idleThresholdMinutes: 30,
        lockCleanupEnabled: false,
        lockDelayMinutes: 0,
        historyRetentionDays: 7,
      },
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
  ])('rejects %s', (_name, patch, message) => {
    expect(parseSettingsForm(form(patch))).toEqual({ error: message });
  });

  it('detects changes to every editable setting', () => {
    expect(isSettingsDirty(form(), saved)).toBe(false);
    expect(isSettingsDirty(form({ idleThresholdMinutes: '16' }), saved)).toBe(true);
    expect(isSettingsDirty(form({ lockCleanupEnabled: false }), saved)).toBe(true);
    expect(isSettingsDirty(form({ lockDelayMinutes: '0' }), saved)).toBe(true);
    expect(isSettingsDirty(form({ historyRetentionDays: '7' }), saved)).toBe(true);
  });

  it('ignores the active strategy when comparing settings', () => {
    expect(isSettingsDirty(form(), { ...saved, activeStrategyId: 'preset:mild' })).toBe(false);
  });
});
