import { describe, expect, it, vi } from 'vitest';
import { TabDormancyService } from '../../src/background/service';
import { Repo } from '../../src/platform/storage';
import type { SettingsPatch, Strategy } from '../../src/shared/types';
import { defined } from '../helpers/assert-defined';
import { FakeBrowser } from './fake-browser';

const now = 1_000_000_000;
const minute = 60_000;
const agent = 'Mozilla/5.0 Chrome/132.0.0.0';

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

function workStrategy(): Strategy {
  return {
    id: '',
    name: 'Work',
    builtin: false,
    expression: { type: 'condition', id: 'c', fact: 'domain', op: 'matchesDomain', value: 'example.com' },
    createdAt: now,
    updatedAt: now,
    lastPreviewHash: null,
    lastPreviewAt: null,
  };
}

describe('quick cleanup', () => {
  it('stores a deduplicated quick list and drops unknown ids', async () => {
    const { repo, service } = setup();
    await service.bootstrap();
    const next = await service.setQuickStrategies(['preset:mild', 'preset:mild', 'ghost']);
    expect(next).toEqual(['preset:mild']);
    expect((await repo.getSettings()).quickStrategyIds).toEqual(['preset:mild']);
  });

  it('replaces the list on each call', async () => {
    const { repo, service } = setup();
    await service.bootstrap();
    await service.setQuickStrategies(['preset:standard']);
    await service.setQuickStrategies(['preset:mild']);
    expect((await repo.getSettings()).quickStrategyIds).toEqual(['preset:mild']);
  });

  it('drops a deleted strategy from the quick list', async () => {
    const { repo, service } = setup();
    await service.bootstrap();
    const created = await service.saveStrategy(
      {
        id: '',
        name: 'Work',
        builtin: false,
        expression: { type: 'condition', id: 'c', fact: 'domain', op: 'matchesDomain', value: 'example.com' },
        createdAt: 0,
        updatedAt: 0,
        lastPreviewHash: null,
        lastPreviewAt: null,
      },
      undefined,
    );
    await service.setQuickStrategies([created.id]);
    await service.deleteStrategy(created.id);
    expect((await repo.getSettings()).quickStrategyIds).toEqual([]);
  });

  it('prunes dangling ids on bootstrap', async () => {
    const { browser, repo } = setup();
    const first = new TabDormancyService({
      browser,
      repo,
      now: () => now,
      id: () => 'id-x',
      userAgent: () => 'Mozilla/5.0 Chrome/132.0.0.0',
    });
    await first.bootstrap();
    await repo.setSettings({ ...(await repo.getSettings()), quickStrategyIds: ['preset:mild', 'ghost'] });
    const second = new TabDormancyService({
      browser,
      repo,
      now: () => now,
      id: () => 'id-y',
      userAgent: () => 'Mozilla/5.0 Chrome/132.0.0.0',
    });
    await second.bootstrap();
    expect((await repo.getSettings()).quickStrategyIds).toEqual(['preset:mild']);
  });

  it('reports matches for each quick strategy in strategy-list order', async () => {
    const { browser, service } = setup();
    await service.bootstrap();
    browser.addTab({ url: 'https://example.com/old', lastAccessed: now - 5_000 * minute });
    browser.addTab({ url: 'https://other.test/x', lastAccessed: now - 5_000 * minute });
    const work = await service.saveStrategy(workStrategy(), undefined);
    await service.setQuickStrategies([work.id, 'preset:mild']);
    const items = await service.quickPreview();
    expect(items.map((item) => item.strategyId)).toEqual(['preset:mild', work.id]);
    expect(items.find((item) => item.strategyId === work.id)).toMatchObject({ matched: 1, status: 'ready' });
  });

  it('marks an invalid rule instead of reporting zero matches', async () => {
    const { repo, service } = setup();
    await service.bootstrap();
    const broken = {
      ...workStrategy(),
      id: 'broken',
      expression: { type: 'condition', id: 'c', fact: 'nope', op: 'is', value: true },
    } as unknown as Strategy;
    await repo.setStrategies([...(await repo.getStrategies()), broken]);
    await service.setQuickStrategies(['broken']);
    const [item] = await service.quickPreview();
    expect(item).toMatchObject({ status: 'invalid', matched: 0 });
  });

  it('marks a rule that needs an unavailable capability', async () => {
    const { service } = setup();
    await service.bootstrap();
    // 保存时用的是真实能力集，先保存再改能力，否则 saveStrategy 会因 FACT_UNAVAILABLE 拒绝。
    const grouped = await service.saveStrategy(
      { ...workStrategy(), expression: { type: 'condition', id: 'c', fact: 'grouped', op: 'is', value: true } },
      undefined,
    );
    vi.spyOn(service, 'getCapabilities').mockResolvedValue({
      chromeMajor: 132,
      lastAccessed: true,
      frozen: true,
      tabGroups: false,
      sessions: true,
    });
    await service.setQuickStrategies([grouped.id]);
    const [item] = await service.quickPreview();
    expect(item?.status).toBe('unsupported');
  });

  it('cleans only the strategy that was asked for and keeps the active one', async () => {
    const { browser, repo, service } = setup();
    await service.bootstrap();
    const activeBefore = (await repo.getSettings()).activeStrategyId;
    browser.addTab({ url: 'https://example.com/a', lastAccessed: now - 5_000 * minute });
    const other = browser.addTab({ url: 'https://other.test/b', lastAccessed: now - 5_000 * minute });
    const work = await service.saveStrategy(workStrategy(), undefined);

    const result = await service.runCleanup('manual', work.id);

    expect(result.closed).toBe(1);
    expect(await browser.getTab(defined(other.id, 'other tab id'))).not.toBeNull();
    expect((await repo.getSettings()).activeStrategyId).toBe(activeBefore);
    const [summary] = await repo.getHistoryIndex();
    expect(summary).toMatchObject({ strategyId: work.id, strategyName: 'Work', trigger: 'manual' });
  });

  it('rejects a settings patch with an out-of-range quick limit', async () => {
    const { service } = setup();
    await service.bootstrap();
    await expect(service.updateSettings({ quickCleanupLimit: 0 })).rejects.toMatchObject({
      code: 'INVALID_SETTINGS',
    });
  });

  it('ignores quickStrategyIds sent through settings.update', async () => {
    const { repo, service } = setup();
    await service.bootstrap();
    await service.setQuickStrategies(['preset:mild']);
    const patch = { idleThresholdMinutes: 30, quickStrategyIds: [] } as unknown as SettingsPatch;

    const next = await service.updateSettings(patch);

    expect(next.quickStrategyIds).toEqual(['preset:mild']);
    expect((await repo.getSettings()).quickStrategyIds).toEqual(['preset:mild']);
  });

  it('still throws BUSY when a cleanup is already running', async () => {
    const { service } = setup();
    await service.bootstrap();
    const work = await service.saveStrategy(workStrategy(), undefined);
    const first = service.runCleanup('manual');
    await Promise.resolve(); // 让第一次调用越过 bootstrap 并把 running 置位
    await expect(service.runCleanup('manual', work.id)).rejects.toMatchObject({ code: 'BUSY' });
    await first;
  });

  it('rejects additions beyond the configured limit', async () => {
    const { repo, service } = setup();
    await service.bootstrap();
    const first = await service.saveStrategy(workStrategy(), undefined);
    const second = await service.saveStrategy({ ...workStrategy(), name: 'Second' }, undefined);
    await service.updateSettings({ quickCleanupLimit: 2 });

    await expect(
      service.setQuickStrategies(['preset:mild', 'preset:aggressive', first.id, second.id]),
    ).rejects.toMatchObject({ code: 'INVALID_SETTINGS' });

    await service.setQuickStrategies(['preset:mild', 'preset:aggressive']);
    expect((await repo.getSettings()).quickStrategyIds).toHaveLength(2);

    await service.updateSettings({ quickCleanupLimit: 1 });
    expect((await repo.getSettings()).quickStrategyIds).toHaveLength(2);
  });

  it('never stores the active strategy as a quick item', async () => {
    const { repo, service } = setup();
    await service.bootstrap();
    await service.setQuickStrategies(['preset:standard', 'preset:mild']);
    expect((await repo.getSettings()).quickStrategyIds).toEqual(['preset:mild']);
  });

  it('drops the quick entry when its strategy becomes active', async () => {
    const { repo, service } = setup();
    await service.bootstrap();
    await service.setQuickStrategies(['preset:mild']);
    await service.activateStrategy('preset:mild');
    expect((await repo.getSettings()).quickStrategyIds).toEqual([]);
  });

  it('prunes the active strategy from a stale quick list on bootstrap', async () => {
    const { browser, repo } = setup();
    const first = new TabDormancyService({ browser, repo, now: () => now, id: () => 'id-x', userAgent: () => agent });
    await first.bootstrap();
    await repo.setSettings({ ...(await repo.getSettings()), quickStrategyIds: ['preset:mild', 'preset:standard'] });
    const second = new TabDormancyService({ browser, repo, now: () => now, id: () => 'id-y', userAgent: () => agent });
    await second.bootstrap();
    expect((await repo.getSettings()).quickStrategyIds).toEqual(['preset:mild']);
  });

  it('hides the active strategy from the popup preview', async () => {
    const { repo, service } = setup();
    await service.bootstrap();
    await service.setQuickStrategies(['preset:mild']);
    await repo.setSettings({ ...(await repo.getSettings()), quickStrategyIds: ['preset:mild', 'preset:standard'] });
    const items = await service.quickPreview();
    expect(items.map((item) => item.strategyId)).toEqual(['preset:mild']);
  });

  it('allows removals after the limit is lowered below the stored count', async () => {
    const { repo, service } = setup();
    await service.bootstrap();
    const work = await service.saveStrategy(workStrategy(), undefined);
    await service.setQuickStrategies(['preset:mild', 'preset:aggressive', work.id]);
    await service.updateSettings({ quickCleanupLimit: 1 });
    expect((await repo.getSettings()).quickStrategyIds).toHaveLength(3);

    // Still above the new limit: removing one must not be rejected.
    const next = await service.setQuickStrategies(['preset:mild', 'preset:aggressive']);

    expect(next).toEqual(['preset:mild', 'preset:aggressive']);
    expect((await repo.getSettings()).quickStrategyIds).toHaveLength(2);
  });

  it('allows swapping an item while already at the limit', async () => {
    const { service } = setup();
    await service.bootstrap();
    const work = await service.saveStrategy(workStrategy(), undefined);
    await service.updateSettings({ quickCleanupLimit: 2 });
    await service.setQuickStrategies(['preset:mild', 'preset:aggressive']);

    await expect(service.setQuickStrategies(['preset:mild', work.id])).resolves.toEqual(['preset:mild', work.id]);
    await expect(service.setQuickStrategies(['preset:mild', 'preset:aggressive', work.id])).rejects.toMatchObject({
      code: 'INVALID_SETTINGS',
    });
  });
});
