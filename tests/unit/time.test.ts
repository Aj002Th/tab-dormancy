import { describe, expect, it } from 'vitest';
import { formatRelativeTime } from '../../src/shared/time';

const now = new Date('2026-10-22T12:00:00Z').getTime();

describe('formatRelativeTime', () => {
  it('formats recent timestamps in Chinese', () => {
    expect(formatRelativeTime(now, now - 10_000)).toBe('刚刚');
    expect(formatRelativeTime(now, now - 5 * 60_000)).toBe('5 分钟前');
    expect(formatRelativeTime(now, now - 3 * 60 * 60_000)).toBe('3 小时前');
    expect(formatRelativeTime(now, now - 2 * 24 * 60 * 60_000)).toBe('2 天前');
  });

  it('falls back to a date after 30 days', () => {
    expect(formatRelativeTime(now, new Date('2026-09-01T00:00:00Z').getTime())).toBe('2026-09-01');
  });
});
