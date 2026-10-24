import { describe, expect, it } from 'vitest';
import { Repo } from '../../src/platform/storage';
import { DEFAULT_SETTINGS, STORAGE_KEYS } from '../../src/shared/constants';
import type { ClosedTabRecord, ClosedTabSummary, Strategy } from '../../src/shared/types';
import { MemoryStorage } from '../helpers/memory-storage';

const now = 1_000_000;

const repo = () => {
  const local = new MemoryStorage();
  const session = new MemoryStorage();
  return { local, session, repo: new Repo(local, session, () => now) };
};

const summary: ClosedTabSummary = {
  id: 'r1',
  url: 'https://example.com',
  title: 'Example',
  domain: 'example.com',
  closedAt: now,
  trigger: 'idle',
  status: 'pending',
  restoredAt: null,
};

const record: ClosedTabRecord = {
  ...summary,
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

const strategy: Strategy = {
  id: 'custom:1',
  name: '自定义',
  builtin: false,
  expression: { type: 'condition', id: 'c', fact: 'pinned', op: 'is', value: true },
  createdAt: now,
  updatedAt: now,
  lastPreviewHash: null,
  lastPreviewAt: null,
};

describe('Repo', () => {
  it('returns and persists defaults for missing settings', async () => {
    const { repo: store } = repo();
    expect(await store.getSettings()).toEqual(DEFAULT_SETTINGS);
    expect(await store.getSettings()).toEqual(DEFAULT_SETTINGS);
    await store.setSettings({ ...DEFAULT_SETTINGS, idleThresholdMinutes: 30 });
    expect((await store.getSettings()).idleThresholdMinutes).toBe(30);
  });

  it('migrates legacy settings without resetting other values', async () => {
    const { local, repo: store } = repo();
    const legacy = {
      idleThresholdMinutes: 42,
      lockCleanupEnabled: false,
      lockDelayMinutes: 3,
      historyRetentionDays: 7,
      activeStrategyId: 'preset:mild',
    };
    await local.set({ [STORAGE_KEYS.settings]: legacy });

    const migrated = {
      ...legacy,
      historyMaxRecords: DEFAULT_SETTINGS.historyMaxRecords,
      theme: 'system',
      language: 'system',
    };
    expect(await store.getSettings()).toEqual(migrated);
    expect((await local.get(STORAGE_KEYS.settings))[STORAGE_KEYS.settings]).toEqual(migrated);
    const keys = Object.keys(local.data).filter((key) => key.startsWith(STORAGE_KEYS.chaosPrefix));
    expect(keys).toHaveLength(0);
  });

  it('normalizes unsupported themes to system', async () => {
    const { local, repo: store } = repo();
    await local.set({ [STORAGE_KEYS.settings]: { ...DEFAULT_SETTINGS, theme: 'sepia' } });
    expect((await store.getSettings()).theme).toBe('system');
  });

  it('backs up corrupt settings instead of throwing', async () => {
    const { local, repo: store } = repo();
    await local.set({ [STORAGE_KEYS.settings]: { nope: true } });
    expect(await store.getSettings()).toEqual(DEFAULT_SETTINGS);
    const keys = Object.keys(local.data).filter((key) => key.startsWith(STORAGE_KEYS.chaosPrefix));
    expect(keys).toHaveLength(1);
  });

  it('round-trips strategies, history and cleanup state', async () => {
    const { repo: store } = repo();
    await store.setStrategies([strategy]);
    expect(await store.getStrategies()).toEqual([strategy]);

    await store.setHistoryIndex([summary]);
    await store.setHistoryRecords([record]);
    expect(await store.getHistoryIndex()).toEqual([summary]);
    expect(await store.getHistoryRecords(['r1'])).toEqual([record]);

    await store.setCleanupLock({ runId: 'run', startedAt: now });
    expect(await store.getCleanupLock()).toEqual({ runId: 'run', startedAt: now });
    await store.clearCleanupLock();
    expect(await store.getCleanupLock()).toBeNull();

    await store.setCleanupRun({
      id: 'run',
      startedAt: now,
      trigger: 'idle',
      strategyId: strategy.id,
      browserSessionId: 's1',
      drafts: [record],
    });
    expect((await store.getCleanupRun())?.id).toBe('run');
    await store.clearCleanupRun();
    expect(await store.getCleanupRun()).toBeNull();

    await store.setLastCleanup({
      at: now,
      trigger: 'idle',
      closed: 1,
      failed: 0,
      skipped: 0,
      durationMs: 12,
      recordIds: ['r1'],
    });
    expect((await store.getLastCleanup())?.closed).toBe(1);

    await store.setBrowserSessionId('browser-1');
    expect(await store.getBrowserSessionId()).toBe('browser-1');
  });

  it('deletes history items and their index entries', async () => {
    const { repo: store } = repo();
    await store.setHistoryIndex([summary]);
    await store.setHistoryRecords([record]);
    await store.deleteHistoryRecords(['r1']);
    await store.setHistoryIndex([]);
    expect(await store.getHistoryIndex()).toEqual([]);
    expect(await store.getHistoryRecords(['r1'])).toEqual([]);
  });

  it('migrates missing language to system and keeps explicit values', async () => {
    const { local, repo: store } = repo();
    const legacy = { ...DEFAULT_SETTINGS } as Record<string, unknown>;
    delete legacy.language;
    await local.set({ [STORAGE_KEYS.settings]: legacy });
    expect((await store.getSettings()).language).toBe('system');
    await store.setSettings({ ...DEFAULT_SETTINGS, language: 'en' });
    expect((await store.getSettings()).language).toBe('en');
  });
});
