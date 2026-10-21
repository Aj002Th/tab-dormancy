import { describe, expect, it } from 'vitest';
import { planCleanup, revalidatePlannedTab } from '../../src/core/cleaner';
import type { Capabilities, Expr, PlannedTab, Strategy } from '../../src/shared/types';

const now = 1_000_000_000;
const caps: Capabilities = { chromeMajor: 132, lastAccessed: true, frozen: true, tabGroups: true, sessions: true };

const tab = (partial: Partial<chrome.tabs.Tab>): chrome.tabs.Tab =>
  ({
    id: 1,
    windowId: 1,
    index: 0,
    url: 'https://example.com/a',
    title: 'A',
    pinned: false,
    audible: false,
    active: false,
    mutedInfo: { muted: false },
    discarded: false,
    groupId: -1,
    ...partial,
  }) as chrome.tabs.Tab;

const window = (partial: Partial<chrome.windows.Window> = {}): chrome.windows.Window =>
  ({ id: 1, type: 'normal', incognito: false, focused: true, ...partial }) as chrome.windows.Window;

const strategy = (expression: Expr): Strategy => ({
  id: 'test',
  name: '测试',
  builtin: false,
  expression,
  createdAt: now,
  updatedAt: now,
  lastPreviewHash: null,
  lastPreviewAt: null,
});

const timeExpr: Expr = { type: 'condition', id: 'time', fact: 'lastActiveMinutes', op: 'gt', value: 60 };

describe('planCleanup', () => {
  it('matches only tabs satisfying the strategy', () => {
    const tabs = [tab({ id: 1, lastAccessed: now - 2 * 60 * 60_000 }), tab({ id: 2, lastAccessed: now - 10 * 60_000 })];
    const plan = planCleanup({
      tabs,
      windows: [window()],
      groups: [],
      strategy: strategy(timeExpr),
      capabilities: caps,
      now,
    });
    expect(plan.matched.map((item) => item.tabId)).toEqual([1]);
    expect(plan.kept.map((item) => item.tabId)).toEqual([2]);
  });

  it('keeps one tab when every manageable tab in a window matches', () => {
    const tabs = [
      tab({ id: 1, active: true, lastAccessed: now - 2 * 60 * 60_000 }),
      tab({ id: 2, lastAccessed: now - 3 * 60 * 60_000 }),
    ];
    const plan = planCleanup({
      tabs,
      windows: [window()],
      groups: [],
      strategy: strategy(timeExpr),
      capabilities: caps,
      now,
    });
    expect(plan.matched).toHaveLength(1);
    expect(plan.kept).toHaveLength(1);
    expect(plan.kept[0]?.facts.active).toBe(true);
  });

  it('does not apply the guard when a window has an internal page that cannot close', () => {
    const tabs = [tab({ id: 1, lastAccessed: now - 2 * 60 * 60_000 }), tab({ id: 2, url: 'chrome://settings' })];
    const plan = planCleanup({
      tabs,
      windows: [window()],
      groups: [],
      strategy: strategy(timeExpr),
      capabilities: caps,
      now,
    });
    expect(plan.matched.map((item) => item.tabId)).toEqual([1]);
    expect(plan.kept).toHaveLength(0);
  });

  it('does not match tabs whose last access time is unknown', () => {
    const plan = planCleanup({
      tabs: [tab({ id: 1, lastAccessed: 0 })],
      windows: [window()],
      groups: [],
      strategy: strategy(timeExpr),
      capabilities: caps,
      now,
    });
    expect(plan.matched).toHaveLength(0);
  });
});

describe('revalidatePlannedTab', () => {
  it('rejects a tab whose url changed', () => {
    const plan = planCleanup({
      tabs: [tab({ id: 1, lastAccessed: now - 2 * 60 * 60_000 }), tab({ id: 2, lastAccessed: now - 10 * 60_000 })],
      windows: [window()],
      groups: [],
      strategy: strategy(timeExpr),
      capabilities: caps,
      now,
    });
    const planned = plan.matched[0] as PlannedTab;
    expect(
      revalidatePlannedTab(
        planned,
        tab({ id: 1, url: 'https://example.com/gone', lastAccessed: now - 2 * 60 * 60_000 }),
      ),
    ).toBe(false);
    expect(revalidatePlannedTab(planned, tab({ id: 1, lastAccessed: now - 2 * 60 * 60_000 }))).toBe(true);
  });
});
