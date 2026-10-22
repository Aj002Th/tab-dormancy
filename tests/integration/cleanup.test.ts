import { describe, expect, it, vi } from 'vitest';
import { TabDormancyService } from '../../src/background/service';
import { Repo } from '../../src/platform/storage';
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

async function seedTabs(browser: FakeBrowser) {
  const old = browser.addTab({ url: 'https://example.com/old', lastAccessed: now - 5_000 * minute });
  const recent = browser.addTab({ url: 'https://example.com/recent', lastAccessed: now - 10 * minute });
  return { old, recent };
}

describe('cleanup pipeline', () => {
  it('writes history before closing and clears the lock', async () => {
    const { browser, repo, service } = setup();
    await service.bootstrap();
    const { old, recent } = await seedTabs(browser);

    const result = await service.runCleanup('manual');
    expect(result.closed).toBe(1);
    expect(await browser.getTab(old.id!)).toBeNull();
    expect(await browser.getTab(recent.id!)).not.toBeNull();

    const index = await repo.getHistoryIndex();
    expect(index).toHaveLength(1);
    expect(index[0]?.status).toBe('closed');
    expect(await repo.getCleanupLock()).toBeNull();
    expect(await repo.getCleanupRun()).toBeNull();
    expect((await repo.getLastCleanup())?.closed).toBe(1);
  });

  it('closes nothing when history cannot be written', async () => {
    const { browser, repo, service } = setup();
    await service.bootstrap();
    const { old } = await seedTabs(browser);
    vi.spyOn(repo, 'setHistoryIndex').mockRejectedValueOnce(new Error('disk full'));

    await expect(service.runCleanup('manual')).rejects.toMatchObject({ code: 'STORAGE_FAILED' });
    expect(await browser.getTab(old.id!)).not.toBeNull();
  });

  it('skips a tab whose url changed after planning', async () => {
    const { browser, service } = setup();
    await service.bootstrap();
    const { old } = await seedTabs(browser);
    const original = browser.getTab.bind(browser);
    vi.spyOn(browser, 'getTab').mockImplementation(async (tabId: number) => {
      const tab = await original(tabId);
      return tab && tab.id === old.id ? { ...tab, url: 'https://example.com/changed' } : tab;
    });

    const result = await service.runCleanup('manual');
    expect(result.skipped).toBe(1);
    expect(await browser.getTab(old.id!)).not.toBeNull();
  });

  it('reports a removal failure and still closes other tabs', async () => {
    const { browser, service } = setup();
    await service.bootstrap();
    browser.addTab({ url: 'https://example.com/recent', lastAccessed: now - 10 * minute });
    const first = browser.addTab({ url: 'https://example.com/1', lastAccessed: now - 5_000 * minute });
    const second = browser.addTab({ url: 'https://example.com/2', lastAccessed: now - 5_001 * minute });
    vi.spyOn(browser, 'removeTab').mockImplementation(async (tabId: number) => {
      if (tabId === first.id) throw new Error('cannot close');
      browser.tabs = browser.tabs.filter((tab) => tab.id !== tabId);
    });

    const result = await service.runCleanup('manual');
    expect(result.closed).toBe(1);
    expect(result.failed).toBe(1);
    expect(await browser.getTab(first.id!)).not.toBeNull();
    expect(await browser.getTab(second.id!)).toBeNull();
  });
});
