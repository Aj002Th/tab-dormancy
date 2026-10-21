import { describe, expect, it } from 'vitest';
import { buildFacts, managedTabs } from '../../src/core/facts';

const now = 1_000_000_000;

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

const window = (partial: Partial<chrome.windows.Window>): chrome.windows.Window =>
  ({ id: 1, type: 'normal', incognito: false, focused: true, ...partial }) as chrome.windows.Window;

describe('buildFacts', () => {
  it('builds counts, focus and group facts', () => {
    const tabs = [
      tab({ id: 1, active: true, lastAccessed: now - 5 * 60_000 }),
      tab({ id: 2, lastAccessed: now - 90 * 60_000 }),
      tab({ id: 3, groupId: 7 }),
    ];
    const groups = [{ id: 7, title: '工作', color: 'blue', collapsed: true, windowId: 1 } as chrome.tabGroups.TabGroup];
    const facts = buildFacts({ tabs, windows: [window({})], groups, now });

    expect(facts.size).toBe(3);
    expect(facts.get(1)?.lastActiveMinutes).toBe(5);
    expect(facts.get(1)?.onlyTabInWindow).toBe(false);
    expect(facts.get(3)?.grouped).toBe(true);
    expect(facts.get(3)?.groupTitle).toBe('工作');
    expect(facts.get(3)?.groupCollapsed).toBe(true);
    expect(facts.get(1)?.windowFocused).toBe(true);
  });

  it('treats missing, zero and future lastAccessed as unknown', () => {
    const facts = buildFacts({
      tabs: [tab({ id: 1 }), tab({ id: 2, lastAccessed: 0 }), tab({ id: 3, lastAccessed: now + 60_000 })],
      windows: [window({})],
      groups: [],
      now,
    });
    expect(facts.get(1)?.lastActiveMinutes).toBeNull();
    expect(facts.get(2)?.lastActiveMinutes).toBeNull();
    expect(facts.get(3)?.lastActiveMinutes).toBe(0);
  });

  it('ignores internal pages and incognito windows', () => {
    const tabs = [tab({ id: 1, url: 'chrome://settings' }), tab({ id: 2, windowId: 2 })];
    const windows = [window({ id: 1 }), window({ id: 2, incognito: true })];
    expect(managedTabs({ tabs, windows }).map((item) => item.id)).toEqual([]);
    expect(buildFacts({ tabs, windows, groups: [], now }).size).toBe(0);
  });
});
