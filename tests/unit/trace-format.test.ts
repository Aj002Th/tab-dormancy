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
  });

  it('formats expected values without relative wording', () => {
    expect(formatTraceExpected('lastActiveMinutes', 4_320)).toBe('4320 分钟');
    expect(formatTraceExpected('pinned', true)).toBe('是');
    expect(formatTraceExpected('title', undefined)).toBe('未设置');
  });

  it('labels results', () => {
    expect(traceResultLabel({ result: true })).toBe('命中');
    expect(traceResultLabel({ result: false, reason: 'not-matched' })).toBe('未命中');
    expect(traceResultLabel({ result: false, reason: 'unknown' })).toBe('未知');
    expect(traceResultLabel({ result: false, reason: 'unsupported' })).toBe('不支持');
  });
});
