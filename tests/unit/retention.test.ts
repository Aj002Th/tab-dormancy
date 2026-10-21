import { describe, expect, it } from 'vitest';
import { selectExpired } from '../../src/core/retention';
import type { ClosedTabSummary } from '../../src/shared/types';

const summary = (id: string, closedAt: number): ClosedTabSummary => ({
  id,
  url: `https://example.com/${id}`,
  title: id,
  domain: 'example.com',
  closedAt,
  trigger: 'idle',
  status: 'closed',
  restoredAt: null,
});

describe('selectExpired', () => {
  it('removes entries older than the retention window', () => {
    const now = 100 * 24 * 60 * 60_000;
    const index = [summary('old', now - 31 * 24 * 60 * 60_000), summary('new', now - 2 * 24 * 60 * 60_000)];
    const result = selectExpired(index, now, 30, 5_000);
    expect(result.kept.map((item) => item.id)).toEqual(['new']);
    expect(result.removedIds).toEqual(['old']);
  });

  it('keeps only the newest records when over the cap', () => {
    const now = 1_000;
    const index = [summary('a', 1), summary('b', 2), summary('c', 3)];
    const result = selectExpired(index, now, 30, 2);
    expect(result.kept.map((item) => item.id)).toEqual(['c', 'b']);
    expect(result.removedIds).toEqual(['a']);
  });
});
