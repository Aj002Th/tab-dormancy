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
    expect(formatDurationMinutes(10_080, 'zh')).toBe('7 天');
    expect(formatDurationMinutes(4_320, 'zh')).toBe('3 天');
    expect(formatDurationMinutes(120, 'zh')).toBe('2 小时');
    expect(formatDurationMinutes(90, 'zh')).toBe('90 分钟');
    expect(formatDurationMinutes(0, 'zh')).toBe('0 分钟');
    expect(formatDurationMinutes(10_080, 'en')).toBe('7 days');
    expect(formatDurationMinutes(1_440, 'en')).toBe('1 day');
    expect(formatDurationMinutes(120, 'en')).toBe('2 hours');
    expect(formatDurationMinutes(60, 'en')).toBe('1 hour');
    expect(formatDurationMinutes(90, 'en')).toBe('90 minutes');
    expect(formatDurationMinutes(0, 'en')).toBe('0 minutes');
  });

  it('summarizes preset strategies without raw minutes or duplicated booleans', () => {
    const [mild, standard, aggressive] = createPresetStrategies(0);
    expect(expressionSummary(defined(mild).expression, 'zh')).toBe(
      '距最后访问 大于 7 天 且 非（已固定） 且 非（正在播放声音） 且 非（当前激活） 且 非（在标签组中）',
    );
    expect(expressionSummary(defined(standard).expression, 'zh')).toContain('距最后访问 大于 3 天');
    expect(expressionSummary(defined(aggressive).expression, 'zh')).toContain('距最后访问 大于 1 天');
  });

  it('localizes preset strategies in English', () => {
    const [mild, standard, aggressive] = createPresetStrategies(0);
    expect(expressionSummary(defined(mild).expression, 'en')).toBe(
      'Time since last visit is greater than 7 days and Not (Pinned) and Not (Playing audio) and Not (Active) and Not (In a tab group)',
    );
    expect(expressionSummary(defined(standard).expression, 'en')).toContain(
      'Time since last visit is greater than 3 days',
    );
    expect(expressionSummary(defined(aggressive).expression, 'en')).toContain(
      'Time since last visit is greater than 1 day',
    );
  });

  it('collapses boolean values and NOT wrappers into a single readable negation', () => {
    expect(expressionSummary(condition('a', 'pinned', 'is', true), 'zh')).toBe('已固定');
    expect(expressionSummary(condition('a', 'pinned', 'is', false), 'zh')).toBe('非（已固定）');
    expect(expressionSummary(not('n', condition('a', 'pinned', 'is', true)), 'zh')).toBe('非（已固定）');
    expect(expressionSummary(not('n', condition('a', 'pinned', 'is', false)), 'zh')).toBe('已固定');
    expect(expressionSummary(condition('a', 'pinned', 'is', true), 'en')).toBe('Pinned');
    expect(expressionSummary(condition('a', 'pinned', 'is', false), 'en')).toBe('Not (Pinned)');
    expect(expressionSummary(not('n', condition('a', 'pinned', 'is', true)), 'en')).toBe('Not (Pinned)');
    expect(expressionSummary(not('n', condition('a', 'pinned', 'is', false)), 'en')).toBe('Pinned');
  });

  it('adds units to numeric counts and keeps domain lists readable', () => {
    expect(expressionSummary(condition('a', 'totalTabCount', 'gt', 30), 'zh')).toBe('总标签数 大于 30 个');
    expect(expressionSummary(condition('a', 'windowTabCount', 'lte', 8), 'zh')).toBe('窗口标签数 小于等于 8 个');
    expect(expressionSummary(condition('a', 'domain', 'inDomainList', ['a.com', 'b.com']), 'zh')).toBe(
      '域名 在域名列表中 a.com、b.com',
    );
    expect(expressionSummary(condition('a', 'totalTabCount', 'gt', 30), 'en')).toBe(
      'Total tab count is greater than 30',
    );
    expect(expressionSummary(condition('a', 'windowTabCount', 'lte', 1), 'en')).toBe(
      'Tab count in window is at most 1',
    );
    expect(expressionSummary(condition('a', 'domain', 'inDomainList', ['a.com', 'b.com']), 'en')).toBe(
      'Domain is in the domain list: a.com, b.com',
    );
  });

  it('falls back to the raw fact key for unknown facts', () => {
    const unknown = condition('a', 'unknownFact' as FactKey, 'eq', 5);
    expect(strategyCardSummary(unknown, 'zh').primary).toBe('unknownFact 等于 5');
    expect(strategyCardSummary(unknown, 'en').primary).toBe('unknownFact equals 5');
  });
});

describe('strategy card summary', () => {
  beforeEach(() => setLocale('zh'));

  it('turns presets into a primary condition and exclusion tags', () => {
    const [mild, standard, aggressive] = createPresetStrategies(0);
    const standardSummary = strategyCardSummary(defined(standard).expression, 'zh');

    expect(standardSummary.primary).toBe('超过 3 天未访问');
    expect(standardSummary.groups).toEqual([
      { label: 'exclude', tags: ['已固定', '播放中', '当前激活', '标签组中'], hidden: 0 },
    ]);
    expect(standardSummary.full).toBe(expressionSummary(defined(standard).expression, 'zh'));
    expect(strategyCardSummary(defined(mild).expression, 'zh').primary).toBe('超过 7 天未访问');
    expect(strategyCardSummary(defined(aggressive).expression, 'zh').groups[0]?.tags).toEqual([
      '已固定',
      '播放中',
      '当前激活',
    ]);
  });

  it('turns presets into English primary conditions and exclusion tags', () => {
    const [mild, standard, aggressive] = createPresetStrategies(0);
    const standardSummary = strategyCardSummary(defined(standard).expression, 'en');

    expect(standardSummary.primary).toBe('Not visited for over 3 days');
    expect(standardSummary.groups).toEqual([
      { label: 'exclude', tags: ['Pinned', 'Playing', 'Active', 'Grouped'], hidden: 0 },
    ]);
    expect(strategyCardSummary(defined(mild).expression, 'en').primary).toBe('Not visited for over 7 days');
    expect(strategyCardSummary(defined(aggressive).expression, 'en').groups[0]?.tags).toEqual([
      'Pinned',
      'Playing',
      'Active',
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

    expect(strategyCardSummary(expression, 'zh')).toMatchObject({
      primary: '超过 3 天未访问',
      groups: [
        { label: 'together', tags: ['URL 包含 mail'], hidden: 0 },
        { label: 'exclude', tags: ['已固定'], hidden: 0 },
      ],
    });
    expect(strategyCardSummary(expression, 'en')).toMatchObject({
      primary: 'Not visited for over 3 days',
      groups: [
        { label: 'together', tags: ['URL contains mail'], hidden: 0 },
        { label: 'exclude', tags: ['Pinned'], hidden: 0 },
      ],
    });
  });

  it('falls back to a condition count for OR groups and shows branch tags', () => {
    const expression: Expr = {
      type: 'any',
      id: 'root',
      children: [condition('pinned', 'pinned', 'is', true), condition('audible', 'audible', 'is', true)],
    };

    expect(strategyCardSummary(expression, 'zh')).toMatchObject({
      primary: '任一满足 · 2 个条件',
      groups: [{ label: 'branch', tags: ['已固定', '正在播放声音'], hidden: 0 }],
    });
    expect(strategyCardSummary(expression, 'en')).toMatchObject({
      primary: 'Any · 2 conditions',
      groups: [{ label: 'branch', tags: ['Pinned', 'Playing audio'], hidden: 0 }],
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

    expect(strategyCardSummary(expression, 'zh')).toMatchObject({
      primary: '全部满足 · 6 个排除条件',
      groups: [{ label: 'exclude', tags: ['已固定', '播放中', '当前激活', '已静音'], hidden: 2 }],
    });
    expect(strategyCardSummary(condition('a', 'pinned', 'is', false), 'zh')).toMatchObject({
      primary: '非（已固定）',
      groups: [],
    });
    expect(strategyCardSummary(expression, 'en')).toMatchObject({
      primary: 'All · 6 exclusions',
      groups: [{ label: 'exclude', tags: ['Pinned', 'Playing', 'Active', 'Muted'], hidden: 2 }],
    });
    expect(strategyCardSummary(condition('a', 'pinned', 'is', false), 'en')).toMatchObject({
      primary: 'Not (Pinned)',
      groups: [],
    });
  });
});
