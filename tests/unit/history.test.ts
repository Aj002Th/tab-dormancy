import { describe, expect, it } from 'vitest';
import { buildClosedRecords, markRestored, planRestore, toSummary } from '../../src/core/history';
import type { CleanupPlan, ClosedTabRecord, PlannedTab } from '../../src/shared/types';

const now = 1_000_000;
const strategy = { id: 'preset:standard', name: '标准' };

const planned = (partial: Partial<PlannedTab>): PlannedTab => ({
  tabId: 1,
  windowId: 10,
  url: 'https://example.com/a',
  title: 'A',
  domain: 'example.com',
  groupId: -1,
  groupTitle: '',
  groupColor: '',
  groupCollapsed: false,
  pinned: false,
  index: 0,
  sessionId: null,
  facts: {} as PlannedTab['facts'],
  trace: [],
  ...partial,
});

const plan: CleanupPlan = {
  matched: [
    planned({ tabId: 1, url: 'https://example.com/a' }),
    planned({ tabId: 2, url: 'https://example.com/b', groupId: 7, groupTitle: '工作', groupColor: 'blue' }),
  ],
  kept: [],
  totalManagedTabs: 2,
};

describe('history planning', () => {
  it('builds pending records in matched order', () => {
    let counter = 0;
    const records = buildClosedRecords(plan, {
      trigger: 'idle',
      strategy,
      browserSessionId: 'session-1',
      now,
      ids: () => `r${counter++}`,
    });
    expect(records.map((record) => record.id)).toEqual(['r0', 'r1']);
    expect(records.every((record) => record.status === 'pending')).toBe(true);
    expect(records[1]?.groupTitle).toBe('工作');
  });

  it('plans current-window restore as one group', () => {
    const records = buildClosedRecords(plan, {
      trigger: 'idle',
      strategy,
      browserSessionId: 'session-1',
      now,
      ids: () => `r${Math.random()}`,
    });
    const groups = planRestore(records, { mode: 'current-window', complete: false }, 99);
    expect(groups).toHaveLength(1);
    expect(groups[0]?.windowId).toBe(99);
    expect(groups[0]?.records).toHaveLength(2);
  });

  it('plans original-window-groups restore by browser session and window', () => {
    const records: ClosedTabRecord[] = [
      {
        ...buildClosedRecords(plan, { trigger: 'idle', strategy, browserSessionId: 's1', now, ids: () => 'a' })[0]!,
        windowId: 10,
        groupId: -1,
      },
      {
        ...buildClosedRecords(plan, { trigger: 'idle', strategy, browserSessionId: 's1', now, ids: () => 'b' })[0]!,
        windowId: 10,
        groupId: 7,
        groupTitle: '工作',
        groupColor: 'blue',
      },
      {
        ...buildClosedRecords(plan, { trigger: 'idle', strategy, browserSessionId: 's1', now, ids: () => 'c' })[0]!,
        windowId: 11,
        groupId: -1,
      },
    ];
    const groups = planRestore(records, { mode: 'original-window-groups', complete: false }, 99);
    expect(groups).toHaveLength(2);
    expect(groups.every((group) => group.windowId === 'new')).toBe(true);
    expect(groups[0]?.groups.some((group) => group.groupTitle === '工作')).toBe(true);
  });

  it('marks restored summaries', () => {
    const record = buildClosedRecords(plan, {
      trigger: 'idle',
      strategy,
      browserSessionId: 's1',
      now,
      ids: () => 'r',
    })[0]!;
    const index = [toSummary(record)];
    const next = markRestored(index, ['r'], now + 1);
    expect(next[0]?.restoredAt).toBe(now + 1);
  });
});
