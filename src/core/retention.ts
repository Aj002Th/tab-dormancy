import type { ClosedTabSummary } from '../shared/types';

export type RetentionResult = {
  kept: ClosedTabSummary[];
  removedIds: string[];
};

export function selectExpired(
  index: ClosedTabSummary[],
  now: number,
  retentionDays: number,
  maxRecords: number,
): RetentionResult {
  const cutoff = now - retentionDays * 24 * 60 * 60_000;
  const removed = new Set<string>();
  const kept: ClosedTabSummary[] = [];

  for (const item of index) {
    if (item.closedAt < cutoff) removed.add(item.id);
    else kept.push(item);
  }

  kept.sort((a, b) => b.closedAt - a.closedAt);
  for (const item of kept.slice(maxRecords)) removed.add(item.id);

  return {
    kept: kept.slice(0, maxRecords),
    removedIds: [...removed],
  };
}
