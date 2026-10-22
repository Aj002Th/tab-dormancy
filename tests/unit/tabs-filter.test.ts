import { describe, expect, it } from 'vitest';
import type { TabListItem } from '../../src/shared/types';
import { filterTabs } from '../../src/ui/dashboard/tabs-filter';

const item = (id: number, title: string, windowId: number, domain = 'example.com'): TabListItem =>
  ({
    tab: { id } as chrome.tabs.Tab,
    facts: { tabId: id, title, url: `https://${domain}/${id}`, domain, windowId } as TabListItem['facts'],
    matched: false,
    trace: [],
  }) as TabListItem;

describe('filterTabs', () => {
  const items = [item(1, 'Alpha', 10, 'a.com'), item(2, 'Beta', 20, 'b.com'), item(3, 'Alpha two', 10, 'c.com')];

  it('filters by title, url and domain', () => {
    expect(filterTabs(items, 'alpha', 'all').map((entry) => entry.facts.tabId)).toEqual([1, 3]);
    expect(filterTabs(items, 'b.com', 'all').map((entry) => entry.facts.tabId)).toEqual([2]);
  });

  it('filters by window', () => {
    expect(filterTabs(items, '', 10).map((entry) => entry.facts.tabId)).toEqual([1, 3]);
    expect(filterTabs(items, '', 20).map((entry) => entry.facts.tabId)).toEqual([2]);
  });
});
