import { beforeEach, describe, expect, it } from 'vitest';
import { setLocale } from '../../src/shared/i18n';
import {
  formatTraceExpected,
  formatTraceValue,
  traceFactLabel,
  traceResultLabel,
} from '../../src/ui/dashboard/trace-format';

describe('trace formatting', () => {
  beforeEach(() => setLocale('zh'));

  it('uses Chinese fact labels', () => {
    expect(traceFactLabel('lastActiveMinutes')).toBe('距最后访问');
    expect(traceFactLabel('grouped')).toBe('在标签组中');
  });

  it('formats actual values for reading', () => {
    expect(formatTraceValue('lastActiveMinutes', 2_977)).toBe('2977 分钟（2 天前）');
    expect(formatTraceValue('pinned', false)).toBe('否');
    expect(formatTraceValue('domain', ['a.com', 'b.com'])).toBe('a.com、b.com');
    expect(formatTraceValue('title', '')).toBe('（空）');
    expect(formatTraceValue('lastActiveMinutes', null)).toBe('未知');
    expect(formatTraceValue('totalTabCount', 1)).toBe('1 个');
    expect(formatTraceValue('windowTabCount', 3)).toBe('3 个');
  });

  it('formats expected values without relative wording', () => {
    expect(formatTraceExpected('lastActiveMinutes', 4_320)).toBe('4320 分钟');
    expect(formatTraceExpected('pinned', true)).toBe('是');
    expect(formatTraceExpected('title', undefined)).toBe('未设置');
    expect(formatTraceExpected('totalTabCount', 2)).toBe('2 个');
  });

  it('labels results', () => {
    expect(traceResultLabel({ result: true })).toBe('命中');
    expect(traceResultLabel({ result: false, reason: 'not-matched' })).toBe('未命中');
    expect(traceResultLabel({ result: false, reason: 'unknown' })).toBe('未知');
    expect(traceResultLabel({ result: false, reason: 'unsupported' })).toBe('不支持');
  });

  it('formats in English when a locale is passed', () => {
    expect(traceFactLabel('lastActiveMinutes', 'en')).toBe('Time since last visit');
    expect(formatTraceValue('lastActiveMinutes', 2_977, 'en')).toBe('2977 min (2 days ago)');
    expect(formatTraceValue('pinned', false, 'en')).toBe('No');
    expect(formatTraceValue('domain', ['a.com', 'b.com'], 'en')).toBe('a.com, b.com');
    expect(formatTraceValue('title', '', 'en')).toBe('(empty)');
    expect(formatTraceValue('lastActiveMinutes', null, 'en')).toBe('Unknown');
    expect(formatTraceValue('totalTabCount', 1, 'en')).toBe('1 tab');
    expect(formatTraceValue('windowTabCount', 3, 'en')).toBe('3 tabs');
    expect(formatTraceExpected('lastActiveMinutes', 4_320, 'en')).toBe('4320 min');
    expect(formatTraceExpected('pinned', true, 'en')).toBe('Yes');
    expect(formatTraceExpected('title', undefined, 'en')).toBe('Not set');
    expect(formatTraceExpected('totalTabCount', 2, 'en')).toBe('2 tabs');
    expect(traceResultLabel({ result: true }, 'en')).toBe('Match');
    expect(traceResultLabel({ result: false, reason: 'not-matched' }, 'en')).toBe('No match');
    expect(traceResultLabel({ result: false, reason: 'unknown' }, 'en')).toBe('Unknown');
    expect(traceResultLabel({ result: false, reason: 'unsupported' }, 'en')).toBe('Unsupported');
  });

  it('follows the active locale by default', () => {
    setLocale('en');
    expect(traceFactLabel('grouped')).toBe('In a tab group');
    expect(formatTraceValue('pinned', true)).toBe('Yes');
    expect(traceResultLabel({ result: false, reason: 'not-matched' })).toBe('No match');
  });
});
