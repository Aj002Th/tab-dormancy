import { beforeEach, describe, expect, it } from 'vitest';
import { createPresetStrategies } from '../../src/core/rules/presets';
import { setLocale } from '../../src/shared/i18n';
import type { Expr, FactKey, FactValue, Operator } from '../../src/shared/types';
import { expressionSummary, formatDurationMinutes, strategyCardSummary } from '../../src/ui/dashboard/strategy-summary';
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
  beforeEach(() => setLocale('zh'));

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

describe('strategy card summary', () => {
  beforeEach(() => setLocale('zh'));

  it('turns presets into a primary condition and exclusion tags', () => {
    const [mild, standard, aggressive] = createPresetStrategies(0);
    const standardSummary = strategyCardSummary(defined(standard).expression);

    expect(standardSummary.primary).toBe('超过 3 天未访问');
    expect(standardSummary.groups).toEqual([
      { label: '排除', tags: ['已固定', '播放中', '当前激活', '标签组中'], hidden: 0 },
    ]);
    expect(standardSummary.full).toBe(expressionSummary(defined(standard).expression));
    expect(strategyCardSummary(defined(mild).expression).primary).toBe('超过 7 天未访问');
    expect(strategyCardSummary(defined(aggressive).expression).groups[0]?.tags).toEqual([
      '已固定',
      '播放中',
      '当前激活',
    ]);
  });

  it('keeps a time condition as the headline when other requirements exist', () => {
    const expression: Expr = {
      type: 'all',
      id: 'root',
      children: [
        condition('url', 'url', 'contains', 'mail'),
        condition('time', 'lastActiveMinutes', 'gt', 4_320),
        not('pinned', condition('pinned', 'pinned', 'is', true)),
      ],
    };

    expect(strategyCardSummary(expression)).toMatchObject({
      primary: '超过 3 天未访问',
      groups: [
        { label: '同时', tags: ['URL 包含 mail'], hidden: 0 },
        { label: '排除', tags: ['已固定'], hidden: 0 },
      ],
    });
  });

  it('falls back to a condition count for OR groups and shows branch tags', () => {
    const expression: Expr = {
      type: 'any',
      id: 'root',
      children: [condition('pinned', 'pinned', 'is', true), condition('audible', 'audible', 'is', true)],
    };

    expect(strategyCardSummary(expression)).toMatchObject({
      primary: '任一满足 · 2 个条件',
      groups: [{ label: '分支', tags: ['已固定', '正在播放声音'], hidden: 0 }],
    });
  });

  it('folds excess tags and handles a single negated boolean condition', () => {
    const expression: Expr = {
      type: 'all',
      id: 'root',
      children: [
        not('pinned', condition('pinned', 'pinned', 'is', true)),
        not('audible', condition('audible', 'audible', 'is', true)),
        not('active', condition('active', 'active', 'is', true)),
        not('muted', condition('muted', 'muted', 'is', true)),
        not('discarded', condition('discarded', 'discarded', 'is', true)),
        not('frozen', condition('frozen', 'frozen', 'is', true)),
      ],
    };

    expect(strategyCardSummary(expression)).toMatchObject({
      primary: '全部满足 · 6 个排除条件',
      groups: [{ label: '排除', tags: ['已固定', '播放中', '当前激活', '已静音'], hidden: 2 }],
    });
    expect(strategyCardSummary(condition('a', 'pinned', 'is', false))).toMatchObject({
      primary: '非（已固定）',
      groups: [],
    });
  });
});
