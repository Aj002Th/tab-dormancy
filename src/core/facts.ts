import { TAB_GROUP_ID_NONE } from '../shared/constants';
import type { TabFacts } from '../shared/types';
import { domainOf, isManageableUrl } from '../shared/url';

export type FactsInput = {
  tabs: chrome.tabs.Tab[];
  windows: chrome.windows.Window[];
  groups: chrome.tabGroups.TabGroup[];
  now: number;
};

export function managedTabs(input: Pick<FactsInput, 'tabs' | 'windows'>): chrome.tabs.Tab[] {
  const normalWindows = new Set(
    input.windows
      .filter((window) => window.type === 'normal' && !window.incognito && typeof window.id === 'number')
      .map((window) => window.id as number),
  );

  return input.tabs.filter((tab) => {
    if (typeof tab.id !== 'number' || typeof tab.windowId !== 'number') return false;
    if (!normalWindows.has(tab.windowId)) return false;
    const url = tab.url ?? tab.pendingUrl ?? '';
    return isManageableUrl(url);
  });
}

export function buildFacts(input: FactsInput): Map<number, TabFacts> {
  const tabs = managedTabs(input);
  const windows = new Map(input.windows.map((window) => [window.id, window]));
  const groups = new Map(input.groups.map((group) => [group.id, group]));
  const counts = new Map<number, number>();
  for (const tab of tabs) {
    counts.set(tab.windowId, (counts.get(tab.windowId) ?? 0) + 1);
  }

  const result = new Map<number, TabFacts>();
  for (const tab of tabs) {
    const tabId = tab.id as number;
    const windowId = tab.windowId;
    const window = windows.get(windowId);
    const url = tab.url ?? tab.pendingUrl ?? '';
    const group = tab.groupId !== TAB_GROUP_ID_NONE ? groups.get(tab.groupId) : undefined;
    const lastAccessed = tab.lastAccessed;
    const lastActiveMinutes =
      typeof lastAccessed === 'number' && Number.isFinite(lastAccessed) && lastAccessed > 0
        ? Math.max(0, Math.floor((input.now - lastAccessed) / 60_000))
        : null;

    result.set(tabId, {
      tabId,
      windowId,
      url,
      title: tab.title ?? '',
      domain: domainOf(url),
      lastActiveMinutes,
      totalTabCount: tabs.length,
      windowTabCount: counts.get(windowId) ?? 0,
      pinned: tab.pinned === true,
      audible: tab.audible === true,
      active: tab.active === true,
      muted: tab.mutedInfo?.muted === true,
      discarded: tab.discarded === true,
      frozen: (tab as chrome.tabs.Tab & { frozen?: boolean }).frozen === true,
      grouped: tab.groupId !== TAB_GROUP_ID_NONE,
      groupCollapsed: group?.collapsed === true,
      windowFocused: window?.focused === true,
      onlyTabInWindow: (counts.get(windowId) ?? 0) === 1,
      groupTitle: group?.title ?? '',
    });
  }

  return result;
}
