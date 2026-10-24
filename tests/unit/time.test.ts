import { beforeEach, describe, expect, it } from 'vitest';
import { setLocale } from '../../src/shared/i18n';
import { formatMinutesAgo, formatRelativeTime } from '../../src/shared/time';

const now = new Date('2026-10-22T12:00:00Z').getTime();

describe('formatRelativeTime', () => {
  beforeEach(() => setLocale('zh'));

  it('formats recent timestamps in Chinese', () => {
    expect(formatRelativeTime(now, now - 10_000)).toBe('刚刚');
    expect(formatRelativeTime(now, now - 5 * 60_000)).toBe('5 分钟前');
    expect(formatRelativeTime(now, now - 3 * 60 * 60_000)).toBe('3 小时前');
    expect(formatRelativeTime(now, now - 2 * 24 * 60 * 60_000)).toBe('2 天前');
  });

  it('formats relative time in English', () => {
    setLocale('en');
    expect(formatRelativeTime(now, now - 10_000)).toBe('Just now');
    expect(formatRelativeTime(now, now - 5 * 60_000)).toBe('5 minutes ago');
    expect(formatRelativeTime(now, now - 1 * 60_000)).toBe('1 minute ago');
    expect(formatRelativeTime(now, now - 3 * 60 * 60_000)).toBe('3 hours ago');
    expect(formatRelativeTime(now, now - 2 * 24 * 60 * 60_000)).toBe('2 days ago');
  });

  it('falls back to a date after 30 days', () => {
    expect(formatRelativeTime(now, new Date('2026-09-01T00:00:00Z').getTime())).toBe('2026-09-01');
  });

  it('formats minute ages in Chinese', () => {
    expect(formatMinutesAgo(0, now)).toBe('刚刚');
    expect(formatMinutesAgo(5, now)).toBe('5 分钟前');
    expect(formatMinutesAgo(90, now)).toBe('1 小时前');
    expect(formatMinutesAgo(2_977, now)).toBe('2 天前');
    expect(formatMinutesAgo(31 * 24 * 60, now)).toBe('2026-09-21');
  });
});
