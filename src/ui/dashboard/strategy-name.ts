import { getLocale, type MessageKey, translate } from '../../shared/i18n';
import type { Locale, Strategy } from '../../shared/types';

const PRESET_KEYS: Record<string, MessageKey | undefined> = {
  'preset:mild': 'preset.mild',
  'preset:standard': 'preset.standard',
  'preset:aggressive': 'preset.aggressive',
};

export function strategyDisplayName(strategy: Pick<Strategy, 'id' | 'name'>, locale?: Locale): string {
  const key = PRESET_KEYS[strategy.id];
  if (!key) return strategy.name;
  return translate(locale ?? getLocale(), key);
}
