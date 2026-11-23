import { describe, expect, it } from 'vitest';
import { TabDormancyService } from '../../src/background/service';
import { signatureOf } from '../../src/core/rules/signature';
import { Repo } from '../../src/platform/storage';
import { DEFAULT_SETTINGS } from '../../src/shared/constants';
import type { ConfigBundle, Expr, Strategy } from '../../src/shared/types';
import { FakeBrowser } from './fake-browser';

const now = 1_000_000_000;

function setup() {
  const browser = new FakeBrowser();
  const repo = new Repo(browser.storageLocal, browser.storageSession, () => now);
  let counter = 0;
  const service = new TabDormancyService({
    browser,
    repo,
    now: () => now,
    id: () => `id-${counter++}`,
    userAgent: () => 'Mozilla/5.0 Chrome/132.0.0.0',
  });
  return { browser, repo, service };
}

const expression: Expr = {
  type: 'condition',
  id: 'imported-node',
  fact: 'lastActiveMinutes',
  op: 'gt',
  value: 120,
};

function customStrategy(partial: Partial<Strategy> = {}): Strategy {
  return {
    id: 'external',
    name: 'Imported',
    builtin: false,
    expression,
    createdAt: now,
    updatedAt: now,
    lastPreviewHash: null,
    lastPreviewAt: null,
    ...partial,
  };
}

function bundle(overrides: Partial<ConfigBundle> = {}): ConfigBundle {
  return {
    app: 'tab-dormancy',
    schemaVersion: 1,
    exportedAt: now,
    settings: {
      ...DEFAULT_SETTINGS,
      idleThresholdMinutes: 42,
      activeStrategyId: 'external',
    },
    strategies: [customStrategy()],
    ...overrides,
  };
}

describe('configuration import and export', () => {
  it('exports persisted settings and custom strategies', async () => {
    const { service } = setup();
    await service.bootstrap();
    const saved = await service.saveStrategy(customStrategy(), await signatureOf(expression));

    const exported = await service.exportConfig();
    expect(exported.app).toBe('tab-dormancy');
    expect(exported.settings.activeStrategyId).toBe('preset:standard');
    expect(exported.strategies).toHaveLength(1);
    expect(exported.strategies[0]?.id).toBe(saved.id);
    expect(exported.strategies.some((item) => item.builtin)).toBe(false);
  });

  it('imports settings and strategies with fresh ids and the preview state', async () => {
    const { browser, service } = setup();
    await service.bootstrap();
    const signature = await signatureOf(expression);
    const input = bundle({
      strategies: [customStrategy({ lastPreviewHash: signature, lastPreviewAt: now })],
    });

    const result = await service.importConfig(JSON.parse(JSON.stringify(input)));
    expect(result.imported).toBe(1);
    expect(result.activeStrategyId).not.toBe('external');

    const state = await service.getState();
    expect(state.settings.idleThresholdMinutes).toBe(42);
    expect(state.settings.activeStrategyId).toBe(result.activeStrategyId);
    expect(state.activeStrategy.id).toBe(result.activeStrategyId);
    expect(state.activeStrategy.name).toBe('Imported');
    expect(state.activeStrategy.lastPreviewHash).toBe(signature);
    expect(state.strategies).toHaveLength(4);
    expect(state.strategies.filter((item) => item.builtin)).toHaveLength(3);
    expect(browser.detectionInterval).toBe(42 * 60);
  });

  it('clears the preview requirement when the signature does not match', async () => {
    const { service } = setup();
    await service.bootstrap();
    await service.importConfig(bundle({ strategies: [customStrategy({ lastPreviewHash: 'stale' })] }));

    const state = await service.getState();
    expect(state.activeStrategy.lastPreviewHash).toBeNull();
    expect(state.warnings.length).toBeGreaterThan(0);
  });

  it('falls back to the standard preset when the active strategy is missing', async () => {
    const { service } = setup();
    await service.bootstrap();
    const input = bundle({ settings: { ...DEFAULT_SETTINGS, activeStrategyId: 'missing' }, strategies: [] });

    const result = await service.importConfig(input);
    expect(result.activeStrategyId).toBe('preset:standard');
    expect(result.imported).toBe(0);
  });

  it('applies the internal-page cleanup scope from the bundle', async () => {
    const { service } = setup();
    await service.bootstrap();
    await service.importConfig(
      bundle({
        settings: {
          ...DEFAULT_SETTINGS,
          activeStrategyId: 'preset:standard',
          cleanInternalPages: true,
        },
        strategies: [],
      }),
    );

    expect((await service.getState()).settings.cleanInternalPages).toBe(true);
  });

  it('remaps quick cleanup ids onto the imported strategies', async () => {
    const { repo, service } = setup();
    await service.bootstrap();
    const input = bundle({
      settings: { ...bundle().settings, quickStrategyIds: ['external', 'preset:standard', 'ghost'] },
    });

    await service.importConfig(JSON.parse(JSON.stringify(input)));

    const importedId = (await repo.getStrategies()).find((item) => !item.builtin)?.id;
    const quick = (await repo.getSettings()).quickStrategyIds;
    expect(quick).toContain(importedId);
    expect(quick).toContain('preset:standard');
    expect(quick).not.toContain('external');
    expect(quick).not.toContain('ghost');
  });

  it('rejects malformed bundles without changing state', async () => {
    const { service } = setup();
    await service.bootstrap();
    const before = await service.getState();

    await expect(service.importConfig({ app: 'tab-dormancy', schemaVersion: 99 })).rejects.toMatchObject({
      code: 'INVALID_CONFIG',
    });
    expect((await service.getState()).settings).toEqual(before.settings);
    expect((await service.getState()).strategies).toEqual(before.strategies);
  });
});
