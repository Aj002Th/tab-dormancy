import { describe, expect, it } from 'vitest';
import { createConfigBundle, parseConfigBundle } from '../../src/core/config';
import { DEFAULT_SETTINGS, LIMITS } from '../../src/shared/constants';
import type { Expr, Strategy } from '../../src/shared/types';

const now = 1_000_000_000;

const expression: Expr = {
  type: 'condition',
  id: 'node-1',
  fact: 'lastActiveMinutes',
  op: 'gt',
  value: 60,
};

function strategy(partial: Partial<Strategy> = {}): Strategy {
  return {
    id: 'custom-1',
    name: 'Mine',
    builtin: false,
    expression,
    createdAt: now,
    updatedAt: now,
    lastPreviewHash: null,
    lastPreviewAt: null,
    ...partial,
  };
}

const builtin: Strategy = {
  ...strategy({ id: 'preset:standard', name: 'Standard', builtin: true }),
};

describe('config bundle', () => {
  it('exports settings and only custom strategies', () => {
    const bundle = createConfigBundle(DEFAULT_SETTINGS, [builtin, strategy()], now);
    expect(bundle.app).toBe('tab-dormancy');
    expect(bundle.schemaVersion).toBe(1);
    expect(bundle.exportedAt).toBe(now);
    expect(bundle.settings).toEqual(DEFAULT_SETTINGS);
    expect(bundle.strategies.map((item) => item.id)).toEqual(['custom-1']);
  });

  it('round-trips through JSON', () => {
    const bundle = createConfigBundle(DEFAULT_SETTINGS, [strategy()], now);
    const parsed = parseConfigBundle(JSON.parse(JSON.stringify(bundle)));
    expect(parsed.ok).toBe(true);
    if (!parsed.ok) return;
    expect(parsed.bundle.settings).toEqual(DEFAULT_SETTINGS);
    expect(parsed.bundle.strategies[0]).toMatchObject({
      id: 'custom-1',
      name: 'Mine',
      builtin: false,
      expression,
    });
  });

  it('keeps the internal-page scope and defaults it for legacy bundles', () => {
    const enabled = createConfigBundle({ ...DEFAULT_SETTINGS, cleanInternalPages: true }, [], now);
    const parsed = parseConfigBundle(enabled);
    expect(parsed.ok).toBe(true);
    if (!parsed.ok) return;
    expect(parsed.bundle.settings.cleanInternalPages).toBe(true);

    const legacy = JSON.parse(JSON.stringify(enabled)) as { settings: Record<string, unknown> };
    delete legacy.settings.cleanInternalPages;
    const legacyParsed = parseConfigBundle(legacy);
    expect(legacyParsed.ok).toBe(true);
    if (!legacyParsed.ok) return;
    expect(legacyParsed.bundle.settings.cleanInternalPages).toBe(false);
  });

  it('rejects values that are not a Tab Dormancy bundle', () => {
    expect(parseConfigBundle(null)).toEqual({ ok: false, issue: 'BAD_FORMAT' });
    expect(parseConfigBundle({})).toEqual({ ok: false, issue: 'BAD_FORMAT' });
    expect(parseConfigBundle({ app: 'other', schemaVersion: 1 })).toEqual({
      ok: false,
      issue: 'BAD_FORMAT',
    });
    expect(parseConfigBundle({ app: 'tab-dormancy', schemaVersion: 0 })).toEqual({
      ok: false,
      issue: 'BAD_FORMAT',
    });
    expect(parseConfigBundle({ app: 'tab-dormancy', schemaVersion: 2 })).toEqual({
      ok: false,
      issue: 'UNSUPPORTED_VERSION',
    });
  });

  it('rejects invalid settings', () => {
    const bundle = createConfigBundle(DEFAULT_SETTINGS, [], now) as unknown as Record<string, unknown>;
    const cases = [
      { ...DEFAULT_SETTINGS, idleThresholdMinutes: 0 },
      { ...DEFAULT_SETTINGS, lockDelayMinutes: -1 },
      { ...DEFAULT_SETTINGS, historyRetentionDays: 366 },
      { ...DEFAULT_SETTINGS, historyMaxRecords: LIMITS.maxHistory + 1 },
      { ...DEFAULT_SETTINGS, theme: 'sepia' },
      { ...DEFAULT_SETTINGS, language: 'fr' },
      { ...DEFAULT_SETTINGS, activeStrategyId: '' },
    ];
    for (const settings of cases) {
      expect(parseConfigBundle({ ...bundle, settings })).toEqual({ ok: false, issue: 'BAD_SETTINGS' });
    }
  });

  it('rejects built-in, duplicate and malformed strategies', () => {
    const bundle = createConfigBundle(DEFAULT_SETTINGS, [], now) as unknown as Record<string, unknown>;
    expect(parseConfigBundle({ ...bundle, strategies: [builtin] })).toEqual({
      ok: false,
      issue: 'BAD_STRATEGY',
    });
    expect(parseConfigBundle({ ...bundle, strategies: [strategy(), strategy()] })).toEqual({
      ok: false,
      issue: 'BAD_STRATEGY',
    });
    expect(parseConfigBundle({ ...bundle, strategies: [{ ...strategy(), name: ' ' }] })).toEqual({
      ok: false,
      issue: 'BAD_STRATEGY',
    });
    expect(parseConfigBundle({ ...bundle, strategies: [{ ...strategy(), expression: {} }] })).toEqual({
      ok: false,
      issue: 'BAD_STRATEGY',
    });
  });

  it('limits the number of imported strategies', () => {
    const bundle = createConfigBundle(DEFAULT_SETTINGS, [], now) as unknown as Record<string, unknown>;
    const strategies = Array.from({ length: LIMITS.maxStrategies + 1 }, (_, index) =>
      strategy({ id: `custom-${index}` }),
    );
    expect(parseConfigBundle({ ...bundle, strategies })).toEqual({
      ok: false,
      issue: 'TOO_MANY_STRATEGIES',
    });
  });
});
