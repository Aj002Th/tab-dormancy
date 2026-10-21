import { TAB_GROUP_ID_NONE } from '../shared/constants';
import type { Capabilities, CleanupPlan, PlannedTab, Strategy, TabFacts, TraceNode } from '../shared/types';
import { buildFacts, managedTabs } from './facts';
import { evaluateStrategy } from './rules/evaluate';

export type CleanerInput = {
  tabs: chrome.tabs.Tab[];
  windows: chrome.windows.Window[];
  groups: chrome.tabGroups.TabGroup[];
  strategy: Strategy;
  capabilities: Capabilities;
  now: number;
};

export function planCleanup(input: CleanerInput): CleanupPlan {
  const facts = buildFacts(input);
  const managed = managedTabs(input).filter((tab) => typeof tab.id === 'number' && facts.has(tab.id));
  const groups = new Map(input.groups.map((group) => [group.id, group]));
  const matched: PlannedTab[] = [];
  const kept: PlannedTab[] = [];

  for (const tab of managed) {
    const tabFacts = facts.get(tab.id as number);
    if (!tabFacts) continue;
    const evaluation = evaluateStrategy(input.strategy, tabFacts, input.capabilities);
    const planned = toPlannedTab(tab, tabFacts, groups, evaluation.trace);
    if (evaluation.matched) matched.push(planned);
    else kept.push(planned);
  }

  preserveOnePerWindow(matched, kept, input.tabs, input.windows);
  const order = (a: PlannedTab, b: PlannedTab) => a.windowId - b.windowId || a.index - b.index;
  matched.sort(order);
  kept.sort(order);
  return { matched, kept, totalManagedTabs: managed.length };
}

function toPlannedTab(
  tab: chrome.tabs.Tab,
  facts: TabFacts,
  groups: Map<number, chrome.tabGroups.TabGroup>,
  trace: TraceNode[],
): PlannedTab {
  const group = tab.groupId !== TAB_GROUP_ID_NONE ? groups.get(tab.groupId) : undefined;
  return {
    tabId: tab.id as number,
    windowId: tab.windowId,
    url: facts.url,
    title: facts.title,
    domain: facts.domain,
    groupId: tab.groupId,
    groupTitle: group?.title ?? '',
    groupColor: group?.color ?? '',
    groupCollapsed: group?.collapsed === true,
    pinned: tab.pinned === true,
    index: tab.index,
    sessionId: (tab as chrome.tabs.Tab & { sessionId?: string }).sessionId ?? null,
    facts,
    trace,
  };
}

function preserveOnePerWindow(
  matched: PlannedTab[],
  kept: PlannedTab[],
  allTabs: chrome.tabs.Tab[],
  windows: chrome.windows.Window[],
): void {
  const normalWindowIds = new Set(
    windows
      .filter((window) => window.type === 'normal' && !window.incognito && typeof window.id === 'number')
      .map((window) => window.id as number),
  );

  const byWindow = new Map<number, PlannedTab[]>();
  for (const tab of matched) {
    const list = byWindow.get(tab.windowId) ?? [];
    list.push(tab);
    byWindow.set(tab.windowId, list);
  }

  for (const [windowId, candidates] of byWindow) {
    if (!normalWindowIds.has(windowId)) continue;
    const totalInWindow = allTabs.filter((tab) => tab.windowId === windowId).length;
    if (candidates.length !== totalInWindow) continue;

    const keeper = [...candidates].sort((a, b) => {
      if (a.facts.active !== b.facts.active) return a.facts.active ? -1 : 1;
      const left = a.facts.lastActiveMinutes ?? Number.MAX_SAFE_INTEGER;
      const right = b.facts.lastActiveMinutes ?? Number.MAX_SAFE_INTEGER;
      return left - right || a.index - b.index;
    })[0];

    if (!keeper) continue;
    matched.splice(matched.indexOf(keeper), 1);
    kept.push(keeper);
  }
}

export function revalidatePlannedTab(planned: PlannedTab, current: chrome.tabs.Tab): boolean {
  const url = current.url ?? current.pendingUrl ?? '';
  return current.id === planned.tabId && current.windowId === planned.windowId && url === planned.url;
}
