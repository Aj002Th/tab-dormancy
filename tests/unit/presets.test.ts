import { describe, expect, it } from 'vitest';
import { evaluateStrategy } from '../../src/core/rules/evaluate';
import { cloneStrategy, createPresetStrategies } from '../../src/core/rules/presets';
import { signatureOf } from '../../src/core/rules/signature';
import type { Capabilities, TabFacts } from '../../src/shared/types';

const caps: Capabilities = { chromeMajor: 121, lastAccessed: true, frozen: true, tabGroups: true, sessions: true };

function staleFacts(overrides: Partial<TabFacts> = {}): TabFacts {
  return {
    tabId: 1,
    windowId: 10,
    url: 'https://example.com/page',
    title: 'Example',
    domain: 'example.com',
    lastActiveMinutes: 20000,
    totalTabCount: 5,
    windowTabCount: 3,
    pinned: false,
    audible: false,
    active: false,
    muted: false,
    discarded: false,
    frozen: false,
    grouped: false,
    groupCollapsed: false,
    windowFocused: true,
    onlyTabInWindow: false,
    groupTitle: '',
    ...overrides,
  };
}

describe('presets', () => {
  it('creates the three built-in strategies', () => {
    const presets = createPresetStrategies(1_000);
    expect(presets.map((preset) => preset.name)).toEqual(['温和', '标准', '激进']);
    expect(presets.every((preset) => preset.builtin)).toBe(true);
    expect(presets.find((preset) => preset.id === 'preset:standard')?.id).toBe('preset:standard');
  });

  it('clones a preset with fresh ids and the same semantics', async () => {
    const source = createPresetStrategies(1_000)[1];
    expect(source).toBeDefined();
    if (!source) return;
    const clone = cloneStrategy(source, 2_000, 'custom:1', `${source.name} 副本`);
    expect(clone.builtin).toBe(false);
    expect(clone.id).toBe('custom:1');
    expect(clone.name).toBe('标准 副本');
    expect(await signatureOf(clone.expression)).toBe(await signatureOf(source.expression));
  });

  describe('preset matching behavior', () => {
    const presets = createPresetStrategies(0);
    const mild = presets[0];
    const standard = presets[1];
    const aggressive = presets[2];
    if (!mild || !standard || !aggressive) throw new Error('presets missing');

    it('mild: matches a stale unprotected tab', () => {
      const result = evaluateStrategy(mild, staleFacts({ lastActiveMinutes: 20000 }), caps);
      expect(result.matched).toBe(true);
    });

    it('mild: does not match a recent tab', () => {
      const result = evaluateStrategy(mild, staleFacts({ lastActiveMinutes: 5000 }), caps);
      expect(result.matched).toBe(false);
    });

    it('mild: does not match pinned', () => {
      const result = evaluateStrategy(mild, staleFacts({ pinned: true }), caps);
      expect(result.matched).toBe(false);
    });

    it('mild: does not match audible', () => {
      const result = evaluateStrategy(mild, staleFacts({ audible: true }), caps);
      expect(result.matched).toBe(false);
    });

    it('mild: does not match active', () => {
      const result = evaluateStrategy(mild, staleFacts({ active: true }), caps);
      expect(result.matched).toBe(false);
    });

    it('mild: does not match grouped', () => {
      const result = evaluateStrategy(mild, staleFacts({ grouped: true }), caps);
      expect(result.matched).toBe(false);
    });

    it('standard: matches a stale unprotected tab', () => {
      const result = evaluateStrategy(standard, staleFacts({ lastActiveMinutes: 10000 }), caps);
      expect(result.matched).toBe(true);
    });

    it('standard: does not match a recent tab', () => {
      const result = evaluateStrategy(standard, staleFacts({ lastActiveMinutes: 1000 }), caps);
      expect(result.matched).toBe(false);
    });

    it('standard: does not match pinned', () => {
      const result = evaluateStrategy(standard, staleFacts({ pinned: true }), caps);
      expect(result.matched).toBe(false);
    });

    it('standard: does not match audible', () => {
      const result = evaluateStrategy(standard, staleFacts({ audible: true }), caps);
      expect(result.matched).toBe(false);
    });

    it('standard: does not match active', () => {
      const result = evaluateStrategy(standard, staleFacts({ active: true }), caps);
      expect(result.matched).toBe(false);
    });

    it('standard: does not match grouped', () => {
      const result = evaluateStrategy(standard, staleFacts({ grouped: true }), caps);
      expect(result.matched).toBe(false);
    });

    it('aggressive: matches a stale unprotected tab', () => {
      const result = evaluateStrategy(aggressive, staleFacts({ lastActiveMinutes: 5000 }), caps);
      expect(result.matched).toBe(true);
    });

    it('aggressive: does not match a recent tab', () => {
      const result = evaluateStrategy(aggressive, staleFacts({ lastActiveMinutes: 500 }), caps);
      expect(result.matched).toBe(false);
    });

    it('aggressive: does not match pinned', () => {
      const result = evaluateStrategy(aggressive, staleFacts({ pinned: true }), caps);
      expect(result.matched).toBe(false);
    });

    it('aggressive: does not match audible', () => {
      const result = evaluateStrategy(aggressive, staleFacts({ audible: true }), caps);
      expect(result.matched).toBe(false);
    });

    it('aggressive: does not match active', () => {
      const result = evaluateStrategy(aggressive, staleFacts({ active: true }), caps);
      expect(result.matched).toBe(false);
    });

    it('aggressive: DOES match a grouped tab (no grouped protection)', () => {
      const result = evaluateStrategy(aggressive, staleFacts({ grouped: true }), caps);
      expect(result.matched).toBe(true);
    });

    it('standard does not match a stale grouped tab', () => {
      const result = evaluateStrategy(standard, staleFacts({ grouped: true }), caps);
      expect(result.matched).toBe(false);
    });

    it('mild does not match a stale grouped tab', () => {
      const result = evaluateStrategy(mild, staleFacts({ grouped: true }), caps);
      expect(result.matched).toBe(false);
    });
  });
});
