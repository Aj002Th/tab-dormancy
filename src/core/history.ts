import { TAB_GROUP_ID_NONE } from '../shared/constants';
import type {
  CleanupPlan,
  ClosedTabRecord,
  ClosedTabSummary,
  RestoreOptions,
  Strategy,
  Trigger,
} from '../shared/types';

export type BuildHistoryInput = {
  trigger: Trigger;
  strategy: Pick<Strategy, 'id' | 'name'>;
  browserSessionId: string;
  now: number;
  ids: () => string;
};

export type RestoreGroup = {
  key: string;
  windowId: number | 'new';
  records: ClosedTabRecord[];
  groups: Array<{
    key: string;
    groupId: number;
    groupTitle: string;
    groupColor: string;
    groupCollapsed: boolean;
    records: ClosedTabRecord[];
  }>;
};

export function buildClosedRecords(plan: CleanupPlan, input: BuildHistoryInput): ClosedTabRecord[] {
  return plan.matched.map((tab) => ({
    id: input.ids(),
    url: tab.url,
    title: tab.title,
    domain: tab.domain,
    closedAt: input.now,
    trigger: input.trigger,
    status: 'pending',
    restoredAt: null,
    strategyId: input.strategy.id,
    strategyName: input.strategy.name,
    browserSessionId: input.browserSessionId,
    windowId: tab.windowId,
    groupId: tab.groupId,
    groupTitle: tab.groupTitle,
    groupColor: tab.groupColor,
    groupCollapsed: tab.groupCollapsed,
    pinned: tab.pinned,
    index: tab.index,
    sessionId: tab.sessionId,
    recovered: false,
  }));
}

export function toSummary(record: ClosedTabRecord): ClosedTabSummary {
  return {
    id: record.id,
    url: record.url,
    title: record.title,
    domain: record.domain,
    closedAt: record.closedAt,
    trigger: record.trigger,
    status: record.status,
    restoredAt: record.restoredAt,
  };
}

export function planRestore(
  records: ClosedTabRecord[],
  options: RestoreOptions,
  currentWindowId: number,
): RestoreGroup[] {
  if (options.mode === 'current-window') {
    return [makeGroup('current-window', currentWindowId, records)];
  }

  const byWindow = new Map<string, ClosedTabRecord[]>();
  for (const record of records) {
    const key = `${record.browserSessionId}:${record.windowId}`;
    const list = byWindow.get(key) ?? [];
    list.push(record);
    byWindow.set(key, list);
  }

  return [...byWindow.entries()]
    .sort(([left], [right]) => left.localeCompare(right))
    .map(([key, groupRecords]) => makeGroup(key, 'new', groupRecords));
}

function makeGroup(key: string, windowId: number | 'new', records: ClosedTabRecord[]): RestoreGroup {
  const grouped = new Map<string, ClosedTabRecord[]>();
  for (const record of records) {
    if (record.groupId === TAB_GROUP_ID_NONE) continue;
    const groupKey = `${record.browserSessionId}:${record.groupId}`;
    const list = grouped.get(groupKey) ?? [];
    list.push(record);
    grouped.set(groupKey, list);
  }

  return {
    key,
    windowId,
    records,
    groups: [...grouped.entries()].map(([groupKey, groupRecords]) => ({
      key: groupKey,
      groupId: groupRecords[0]?.groupId ?? TAB_GROUP_ID_NONE,
      groupTitle: groupRecords[0]?.groupTitle ?? '',
      groupColor: groupRecords[0]?.groupColor ?? '',
      groupCollapsed: groupRecords[0]?.groupCollapsed ?? false,
      records: groupRecords,
    })),
  };
}

export function markRestored(index: ClosedTabSummary[], ids: string[], now: number): ClosedTabSummary[] {
  const set = new Set(ids);
  return index.map((item) => (set.has(item.id) ? { ...item, restoredAt: now } : item));
}
