import type { Capabilities } from '../shared/types';

export type CapabilityInput = {
  userAgent: string;
  sampleTab?: Partial<chrome.tabs.Tab>;
  hasTabGroups: boolean;
  hasSessions: boolean;
};

function chromeMajor(userAgent: string): number | null {
  const match = /(?:Chrome|Chromium)\/(\d+)/.exec(userAgent);
  return match ? Number(match[1]) : null;
}

export function detectCapabilities(input: CapabilityInput): Capabilities {
  const major = chromeMajor(input.userAgent);
  const sample = input.sampleTab;
  return {
    chromeMajor: major,
    lastAccessed: sample ? sample.lastAccessed !== undefined : major !== null && major >= 121,
    frozen: sample
      ? (sample as chrome.tabs.Tab & { frozen?: boolean }).frozen !== undefined
      : major !== null && major >= 132,
    tabGroups: input.hasTabGroups,
    sessions: input.hasSessions,
  };
}
