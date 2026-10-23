import { describe, expect, it } from 'vitest';
import { createPresetStrategies } from '../../src/core/rules/presets';
import type { Expr, FactKey, FactValue, Operator } from '../../src/shared/types';
import { expressionSummary, formatDurationMinutes } from '../../src/ui/dashboard/strategy-summary';
import { defined } from '../helpers/assert-defined';

const condition = (id: string, fact: FactKey, op: Operator, value?: FactValue): Expr => ({
  type: 'condition',
  id,
  fact,
  op,
  value,
});

const not = (id: string, child: Expr): Expr => ({ type: 'not', id, child });

describe('strategy summary', () => {
  it('formats durations with the largest readable unit', () => {
    expect(formatDurationMinutes(10_080)).toBe('7 天');
    expect(formatDurationMinutes(4_320)).toBe('3 天');
    expect(formatDurationMinutes(120)).toBe('2 小时');
    expect(formatDurationMinutes(90)).toBe('90 分钟');
    expect(formatDurationMinutes(0)).toBe('0 分钟');
  });

  it('summarizes preset strategies without raw minutes or duplicated booleans', () => {
    const [mild, standard, aggressive] = createPresetStrategies(0);
    expect(expressionSummary(defined(mild).expression)).toBe(
      '距最后访问 大于 7 天 且 非（已固定） 且 非（正在播放声音） 且 非（当前激活） 且 非（在标签组中）',
    );
    expect(expressionSummary(defined(standard).expression)).toContain('距最后访问 大于 3 天');
    expect(expressionSummary(defined(aggressive).expression)).toContain('距最后访问 大于 1 天');
  });

  it('collapses boolean values and NOT wrappers into a single readable negation', () => {
    expect(expressionSummary(condition('a', 'pinned', 'is', true))).toBe('已固定');
    expect(expressionSummary(condition('a', 'pinned', 'is', false))).toBe('非（已固定）');
    expect(expressionSummary(not('n', condition('a', 'pinned', 'is', true)))).toBe('非（已固定）');
    expect(expressionSummary(not('n', condition('a', 'pinned', 'is', false)))).toBe('已固定');
  });

  it('adds units to numeric counts and keeps domain lists readable', () => {
    expect(expressionSummary(condition('a', 'totalTabCount', 'gt', 30))).toBe('总标签数 大于 30 个');
    expect(expressionSummary(condition('a', 'windowTabCount', 'lte', 8))).toBe('窗口标签数 小于等于 8 个');
    expect(expressionSummary(condition('a', 'domain', 'inDomainList', ['a.com', 'b.com']))).toBe(
      '域名 在域名列表中 a.com、b.com',
    );
  });
});
