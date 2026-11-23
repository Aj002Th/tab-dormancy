import { describe, expect, it, vi } from 'vitest';
import { TabDormancyService } from '../../src/background/service';
import { Repo } from '../../src/platform/storage';
import type { Strategy } from '../../src/shared/types';
import { FakeBrowser } from './fake-browser';

const now = 1_000_000_000;
const minute = 60_000;

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
    const next = await service.setQuickStrategies(['preset:standard', 'preset:standard', 'ghost']);
    expect(next).toEqual(['preset:standard']);
    expect((await repo.getSettings()).quickStrategyIds).toEqual(['preset:standard']);
  });

  it('rejects more than four entries', async () => {
    const { service } = setup();
    await service.bootstrap();
    await expect(service.setQuickStrategies(['preset:standard', 'a', 'b', 'c', 'd'])).rejects.toMatchObject({
      code: 'INVALID_SETTINGS',
    });
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
    await repo.setSettings({ ...(await repo.getSettings()), quickStrategyIds: ['preset:standard', 'ghost'] });
    const second = new TabDormancyService({
      browser,
      repo,
      now: () => now,
      id: () => 'id-y',
      userAgent: () => 'Mozilla/5.0 Chrome/132.0.0.0',
    });
    await second.bootstrap();
    expect((await repo.getSettings()).quickStrategyIds).toEqual(['preset:standard']);
  });

  it('reports matches for each quick strategy in strategy-list order', async () => {
    const { browser, service } = setup();
    await service.bootstrap();
    browser.addTab({ url: 'https://example.com/old', lastAccessed: now - 5_000 * minute });
    browser.addTab({ url: 'https://other.test/x', lastAccessed: now - 5_000 * minute });
    const work = await service.saveStrategy(workStrategy(), undefined);
    await service.setQuickStrategies([work.id, 'preset:standard']);
    const items = await service.quickPreview();
    expect(items.map((item) => item.strategyId)).toEqual(['preset:standard', work.id]);
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
});
