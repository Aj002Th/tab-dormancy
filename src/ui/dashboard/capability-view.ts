import { getLocale, type MessageKey, translate } from '../../shared/i18n';
import type { Capabilities, Locale } from '../../shared/types';

export type CapabilityKey = 'lastAccessed' | 'frozen' | 'tabGroups' | 'sessions';

export type CapabilityViewItem = {
  key: CapabilityKey;
  label: string;
  description: string;
  requirement: string | null;
  available: boolean;
};

export type CapabilityView = {
  versionLabel: string;
  items: CapabilityViewItem[];
  unavailable: CapabilityViewItem[];
  availableCount: number;
  allAvailable: boolean;
  summary: string;
};

const CAPABILITIES: Array<{
  key: CapabilityKey;
  labelKey: MessageKey;
  availableKey: MessageKey;
  unavailableKey: MessageKey;
  requirementKey: MessageKey | null;
}> = [
  {
    key: 'lastAccessed',
    labelKey: 'capabilities.lastAccessed.label',
    availableKey: 'capabilities.lastAccessed.available',
    unavailableKey: 'capabilities.lastAccessed.unavailable',
    requirementKey: 'capabilities.lastAccessed.requirement',
  },
  {
    key: 'frozen',
    labelKey: 'capabilities.frozen.label',
    availableKey: 'capabilities.frozen.available',
    unavailableKey: 'capabilities.frozen.unavailable',
    requirementKey: 'capabilities.frozen.requirement',
  },
  {
    key: 'tabGroups',
    labelKey: 'capabilities.tabGroups.label',
    availableKey: 'capabilities.tabGroups.available',
    unavailableKey: 'capabilities.tabGroups.unavailable',
    requirementKey: null,
  },
  {
    key: 'sessions',
    labelKey: 'capabilities.sessions.label',
    availableKey: 'capabilities.sessions.available',
    unavailableKey: 'capabilities.sessions.unavailable',
    requirementKey: null,
  },
];

export function capabilityView(capabilities: Capabilities, locale: Locale = getLocale()): CapabilityView {
  const items = CAPABILITIES.map(({ key, labelKey, availableKey, unavailableKey, requirementKey }) => {
    const available = capabilities[key];
    return {
      key,
      label: translate(locale, labelKey),
      available,
      description: translate(locale, available ? availableKey : unavailableKey),
      requirement: requirementKey ? translate(locale, requirementKey) : null,
    };
  });
  const unavailable = items.filter((item) => !item.available);
  const availableCount = items.length - unavailable.length;
  return {
    versionLabel: translate(locale, 'diagnostics.version', {
      version: capabilities.chromeMajor ?? translate(locale, 'diagnostics.versionUnknown'),
    }),
    items,
    unavailable,
    availableCount,
    allAvailable: unavailable.length === 0,
    summary: translate(locale, unavailable.length === 0 ? 'diagnostics.summaryAll' : 'diagnostics.summarySome', {
      count: unavailable.length,
    }),
  };
}
