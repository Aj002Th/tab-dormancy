import { LIMITS } from '../../shared/constants';
import { t } from '../../shared/i18n';
import { isLanguage } from '../../shared/language';
import { isTheme } from '../../shared/theme';
import type { Language, Settings, SettingsPatch, Theme } from '../../shared/types';

export type SettingsForm = {
  idleThresholdMinutes: string;
  lockCleanupEnabled: boolean;
  lockDelayMinutes: string;
  historyRetentionDays: string;
  historyMaxRecords: string;
  theme: Theme;
  language: Language;
};

export function toSettingsForm(settings: Settings): SettingsForm {
  return {
    idleThresholdMinutes: String(settings.idleThresholdMinutes),
    lockCleanupEnabled: settings.lockCleanupEnabled,
    lockDelayMinutes: String(settings.lockDelayMinutes),
    historyRetentionDays: String(settings.historyRetentionDays),
    historyMaxRecords: String(settings.historyMaxRecords),
    theme: settings.theme,
    language: settings.language,
  };
}

export function parseSettingsForm(form: SettingsForm): { patch: SettingsPatch } | { error: string } {
  if (!isLanguage(form.language)) {
    return { error: t('errors.invalidLanguage') };
  }

  if (!isTheme(form.theme)) {
    return { error: '外观主题无效' };
  }

  const idle = parseInteger(form.idleThresholdMinutes);
  if (idle === null || idle < 1 || idle > 1_440) {
    return { error: '空闲阈值需为 1–1440 分钟' };
  }

  const lockDelay = parseInteger(form.lockDelayMinutes);
  if (lockDelay === null || lockDelay < 0 || lockDelay > 1_440) {
    return { error: '锁屏延迟需为 0–1440 分钟' };
  }

  const retention = parseInteger(form.historyRetentionDays);
  if (retention === null || retention < 1 || retention > 365) {
    return { error: '历史保留需为 1–365 天' };
  }

  const maxRecords = parseInteger(form.historyMaxRecords);
  if (maxRecords === null || maxRecords < 1 || maxRecords > LIMITS.maxHistory) {
    return { error: `历史保留条数需为 1–${LIMITS.maxHistory} 条` };
  }

  return {
    patch: {
      idleThresholdMinutes: idle,
      lockCleanupEnabled: form.lockCleanupEnabled,
      lockDelayMinutes: lockDelay,
      historyRetentionDays: retention,
      historyMaxRecords: maxRecords,
      theme: form.theme,
      language: form.language,
    },
  };
}

export function isSettingsDirty(form: SettingsForm, saved: Settings): boolean {
  const savedForm = toSettingsForm(saved);
  return (
    form.idleThresholdMinutes !== savedForm.idleThresholdMinutes ||
    form.lockCleanupEnabled !== savedForm.lockCleanupEnabled ||
    form.lockDelayMinutes !== savedForm.lockDelayMinutes ||
    form.historyRetentionDays !== savedForm.historyRetentionDays ||
    form.historyMaxRecords !== savedForm.historyMaxRecords ||
    form.theme !== savedForm.theme ||
    form.language !== savedForm.language
  );
}

function parseInteger(value: string): number | null {
  const trimmed = value.trim();
  if (!/^\d+$/.test(trimmed)) return null;
  const parsed = Number(trimmed);
  return Number.isInteger(parsed) ? parsed : null;
}
