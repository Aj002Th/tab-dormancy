import { getLocale, translate } from '../../shared/i18n';
import type { Locale, Strategy } from '../../shared/types';

const PRESET_KEYS = {
  'preset:mild': 'preset.mild',
  'preset:standard': 'preset.standard',
  'preset:aggressive': 'preset.aggressive',
} as const;

export function strategyDisplayName(strategy: Pick<Strategy, 'id' | 'name'>, locale?: Locale): string {
  const key = PRESET_KEYS[strategy.id as keyof typeof PRESET_KEYS];
  if (!key) return strategy.name;
  return translate(locale ?? getLocale(), key);
}
