import { describe, expect, it } from 'vitest';
import { TabDormancyService } from '../../src/background/service';
import { Repo } from '../../src/platform/storage';
import type { Strategy } from '../../src/shared/types';
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
});
