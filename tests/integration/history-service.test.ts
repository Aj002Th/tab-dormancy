import { describe, expect, it, vi } from 'vitest';
import { TabDormancyService } from '../../src/background/service';
import { Repo } from '../../src/platform/storage';
import type { ClosedTabRecord } from '../../src/shared/types';
import { FakeBrowser } from './fake-browser';

const now = 1_000_000;

function record(id: string, partial: Partial<ClosedTabRecord> = {}): ClosedTabRecord {
  return {
    id,
    url: `https://example.com/${id}`,
    title: `Title ${id}`,
    domain: 'example.com',
    closedAt: now,
    trigger: 'idle',
    status: 'closed',
    restoredAt: null,
    strategyId: 'preset:standard',
    strategyName: '标准',
    browserSessionId: 's1',
    windowId: 10,
    groupId: -1,
    groupTitle: '',
    groupColor: '',
    groupCollapsed: false,
    pinned: false,
    index: 0,
    sessionId: null,
    recovered: false,
    ...partial,
  };
}

async function setup(records: ClosedTabRecord[]) {
  const browser = new FakeBrowser();
  const repo = new Repo(browser.storageLocal, browser.storageSession, () => now);
  const service = new TabDormancyService({
    browser,
    repo,
    now: () => now,
    id: () => 'id',
    userAgent: () => 'Mozilla/5.0 Chrome/132.0.0.0',
  });
  await service.bootstrap();
  await repo.setBrowserSessionId('s1');
  await repo.setHistoryIndex(
    records.map(({ id, url, title, domain, closedAt, trigger, status, restoredAt }) => ({
      id,
      url,
      title,
      domain,
      closedAt,
      trigger,
      status,
      restoredAt,
    })),
  );
  await repo.setHistoryRecords(records);
  return { browser, repo, service };
}

describe('history service', () => {
  it('searches, filters and paginates history', async () => {
    const { service } = await setup([
      record('a', { title: 'Alpha' }),
      record('b', { title: 'Beta', trigger: 'manual', restoredAt: 1 }),
      record('c', { title: 'Alpha two', closedAt: now - 100 }),
    ]);

    expect((await service.queryHistory({ query: 'alpha', page: 1, pageSize: 50 })).total).toBe(2);
    expect((await service.queryHistory({ trigger: 'manual', page: 1, pageSize: 50 })).items[0]?.id).toBe('b');
    expect((await service.queryHistory({ restored: false, page: 1, pageSize: 50 })).total).toBe(2);
    const page = await service.queryHistory({ page: 2, pageSize: 2 });
    expect(page.items).toHaveLength(1);
    expect(page.page).toBe(2);
  });

  it('restores tabs into the current window and marks them restored', async () => {
    const { browser, repo, service } = await setup([record('a'), record('b')]);
    const result = await service.restoreHistory(['a', 'b'], { mode: 'current-window', complete: false });
    expect(result.restored).toBe(2);
    expect((await browser.queryTabs()).some((tab) => tab.url === 'https://example.com/a')).toBe(true);
    const index = await repo.getHistoryIndex();
    expect(index.every((item) => item.restoredAt === now)).toBe(true);
  });

  it('recreates original windows and groups', async () => {
    const { browser, service } = await setup([
      record('a', { groupId: 7, groupTitle: '工作', groupColor: 'blue' }),
      record('b', { groupId: 7, groupTitle: '工作', groupColor: 'blue' }),
    ]);
    const result = await service.restoreHistory(['a', 'b'], { mode: 'original-window-groups', complete: false });
    expect(result.restored).toBe(2);
    expect(browser.windows.length).toBe(2);
    expect((await browser.getTabGroups())[0]?.title).toBe('工作');
  });

  it('uses sessions.restore when complete is requested and falls back on failure', async () => {
    const { browser, service } = await setup([
      record('a', { sessionId: 'session-1' }),
      record('b', { sessionId: 'bad' }),
    ]);
    browser.restoredSessions.set('session-1', {
      tab: { id: 99, url: 'https://example.com/a', windowId: 1 } as chrome.tabs.Tab,
    } as chrome.sessions.Session);
    const spy = vi.spyOn(browser, 'restoreSession');
    const result = await service.restoreHistory(['a', 'b'], { mode: 'current-window', complete: true });
    expect(spy).toHaveBeenCalledTimes(2);
    expect(result.restored).toBe(2);
    expect((await browser.queryTabs()).some((tab) => tab.url === 'https://example.com/b')).toBe(true);
  });

  it('returns results newest-first regardless of storage order', async () => {
    const { service } = await setup([
      record('a', { closedAt: now - 200 }),
      record('b', { closedAt: now }),
      record('c', { closedAt: now - 100 }),
    ]);

    const all = await service.queryHistory({ page: 1, pageSize: 50 });
    expect(all.items.map((item) => item.id)).toEqual(['b', 'c', 'a']);
    expect(all.total).toBe(3);

    const page1 = await service.queryHistory({ page: 1, pageSize: 2 });
    expect(page1.items.map((item) => item.id)).toEqual(['b', 'c']);
    expect(page1.total).toBe(3);
  });

  it('deletes and clears history', async () => {
    const { repo, service } = await setup([record('a'), record('b')]);
    await service.deleteHistory(['a']);
    expect((await repo.getHistoryIndex()).map((item) => item.id)).toEqual(['b']);
    await service.clearHistory();
    expect(await repo.getHistoryIndex()).toEqual([]);
    expect(await repo.getHistoryRecords(['b'])).toEqual([]);
  });
});
