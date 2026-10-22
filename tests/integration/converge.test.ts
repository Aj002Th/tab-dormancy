import { describe, expect, it } from 'vitest';
import { TabDormancyService } from '../../src/background/service';
import { Repo } from '../../src/platform/storage';
import type { ClosedTabRecord } from '../../src/shared/types';
import { FakeBrowser } from './fake-browser';

const now = 1_000_000;

function record(id: string, url: string): ClosedTabRecord {
  return {
    id,
    url,
    title: url,
    domain: 'example.com',
    closedAt: now,
    trigger: 'idle',
    status: 'pending',
    restoredAt: null,
    strategyId: 'preset:standard',
    strategyName: '标准',
    browserSessionId: 's1',
    windowId: 1,
    groupId: -1,
    groupTitle: '',
    groupColor: '',
    groupCollapsed: false,
    pinned: false,
    index: 0,
    sessionId: null,
    recovered: false,
  };
}

describe('pending run convergence', () => {
  it('marks missing tabs as closed and removes still-open drafts', async () => {
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
    const stillOpen = record('open', 'https://example.com/open');
    const closed = record('closed', 'https://example.com/closed');
    browser.addTab({ url: stillOpen.url, lastAccessed: now });
    await repo.setBrowserSessionId('s1');
    await repo.setHistoryIndex([stillOpen, closed]);
    await repo.setHistoryRecords([stillOpen, closed]);
    await repo.setCleanupRun({
      id: 'run',
      startedAt: now,
      trigger: 'idle',
      strategyId: 'preset:standard',
      browserSessionId: 's1',
      drafts: [stillOpen, closed],
    });

    await service.convergePendingRun();

    const index = await repo.getHistoryIndex();
    expect(index.map((item) => [item.id, item.status])).toEqual([['closed', 'closed']]);
    expect(await repo.getCleanupRun()).toBeNull();
  });
});
