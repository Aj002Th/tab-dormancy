import { describe, expect, it } from 'vitest';
import { detectCapabilities } from '../../src/core/capabilities';
import { createPresetStrategies } from '../../src/core/rules/presets';
import { strategyUsable, unsupportedFacts } from '../../src/core/strategies';

const base = { hasTabGroups: true, hasSessions: true };

describe('detectCapabilities', () => {
  it('derives lastAccessed from Chrome 121 and frozen from Chrome 132', () => {
    const old = detectCapabilities({ ...base, userAgent: 'Mozilla/5.0 Chrome/120.0.0.0 Safari/537.36' });
    expect(old.lastAccessed).toBe(false);
    expect(old.frozen).toBe(false);

    const milestone = detectCapabilities({ ...base, userAgent: 'Mozilla/5.0 Chrome/132.0.0.0 Safari/537.36' });
    expect(milestone.lastAccessed).toBe(true);
    expect(milestone.frozen).toBe(true);
  });

  it('uses a real tab sample when provided', () => {
    const caps = detectCapabilities({
      ...base,
      userAgent: 'Mozilla/5.0 Chrome/140.0.0.0',
      sampleTab: { lastAccessed: undefined } as chrome.tabs.Tab,
    });
    expect(caps.lastAccessed).toBe(false);
  });

  it('reports facts unavailable from a strategy', () => {
    const caps = { chromeMajor: 121, lastAccessed: false, frozen: false, tabGroups: false, sessions: true };
    const standard = createPresetStrategies(0).find((strategy) => strategy.id === 'preset:standard');
    if (!standard) throw new Error('preset:standard not found');
    expect(unsupportedFacts(standard.expression, caps)).toContain('lastActiveMinutes');
    expect(strategyUsable(standard, caps)).toBe(false);
  });
});
