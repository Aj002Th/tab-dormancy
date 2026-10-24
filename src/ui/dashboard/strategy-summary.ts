import { FACT_BY_KEY } from '../../core/rules/registry';
import { factLabel } from '../../shared/i18n';
import type { Expr, FactKey } from '../../shared/types';
import { effectiveBooleanNegated, formatFactValue, operatorLabel, unwrapNot } from './expr-edit';

const CARD_TAG_LIMIT = 4;

export type StrategyCardTagGroup = {
  label: '同时' | '排除' | '分支';
  tags: string[];
  hidden: number;
};

export type StrategyCardSummary = {
  primary: string;
  groups: StrategyCardTagGroup[];
  full: string;
};

const COMPACT_BOOLEAN_LABELS: Partial<Record<FactKey, string>> = {
  pinned: '已固定',
  audible: '播放中',
  active: '当前激活',
  muted: '已静音',
  discarded: '已丢弃',
  frozen: '已冻结',
  grouped: '标签组中',
  groupCollapsed: '折叠组',
  windowFocused: '窗口聚焦',
  onlyTabInWindow: '窗口唯一',
};

export function expressionSummary(expression: Expr): string {
  const { inner, negated } = unwrapNot(expression);

  if (inner.type === 'condition') {
    const definition = FACT_BY_KEY.get(inner.fact);
    if (!definition) return inner.fact;
    if (definition.type === 'boolean') {
      return effectiveBooleanNegated(inner.value, negated) ? `非（${factLabel(inner.fact)}）` : factLabel(inner.fact);
    }
    const summary = conditionSummary(inner);
    return negated ? `非（${summary}）` : summary;
  }

  const summary = inner.children.map(expressionSummary).join(inner.type === 'all' ? ' 且 ' : ' 或 ');
  return negated ? `非（${summary}）` : summary;
}

export function strategyCardSummary(expression: Expr): StrategyCardSummary {
  const full = expressionSummary(expression);
  const { inner, negated } = unwrapNot(expression);

  if (negated) return { primary: full, groups: [], full };
  if (inner.type === 'condition') return { primary: conditionCardSummary(inner), groups: [], full };

  if (inner.type === 'any') {
    return {
      primary: `任一满足 · ${inner.children.length} 个条件`,
      groups: buildTagGroups([{ label: '分支', tags: inner.children.map(expressionSummary) }]),
      full,
    };
  }

  const clauses = inner.children.map(classifyClause);
  const requirements = clauses.filter((clause) => !clause.exclusion);
  const exclusions = clauses.filter((clause) => clause.exclusion);

  if (requirements.length === 0) {
    return {
      primary: `全部满足 · ${exclusions.length} 个排除条件`,
      groups: buildTagGroups([{ label: '排除', tags: exclusions.map((clause) => clause.summary) }]),
      full,
    };
  }

  const primaryIndex = requirements.reduce(
    (best, clause, index) => (clause.score < requirements[best].score ? index : best),
    0,
  );
  const primary = requirements[primaryIndex].summary;
  const otherRequirements = requirements.filter((_, index) => index !== primaryIndex).map((clause) => clause.summary);

  return {
    primary,
    groups: buildTagGroups([
      ...(otherRequirements.length > 0 ? [{ label: '同时' as const, tags: otherRequirements }] : []),
      ...(exclusions.length > 0 ? [{ label: '排除' as const, tags: exclusions.map((clause) => clause.summary) }] : []),
    ]),
    full,
  };
}

type CardClause = {
  summary: string;
  exclusion: boolean;
  score: number;
};

function classifyClause(expression: Expr): CardClause {
  const { inner, negated } = unwrapNot(expression);
  if (inner.type !== 'condition') {
    return { summary: expressionSummary(expression), exclusion: false, score: 3 };
  }

  const definition = FACT_BY_KEY.get(inner.fact);
  if (definition?.type === 'boolean') {
    if (effectiveBooleanNegated(inner.value, negated)) {
      return {
        summary: compactBooleanLabel(inner.fact, factLabel(inner.fact)),
        exclusion: true,
        score: 4,
      };
    }
    return { summary: factLabel(inner.fact), exclusion: false, score: 2 };
  }

  const base = naturalConditionSummary(inner);
  return {
    summary: negated ? `非（${base}）` : base,
    exclusion: false,
    score: conditionScore(inner),
  };
}

function conditionCardSummary(condition: Extract<Expr, { type: 'condition' }>): string {
  const definition = FACT_BY_KEY.get(condition.fact);
  if (definition?.type === 'boolean') {
    return effectiveBooleanNegated(condition.value, false)
      ? `非（${factLabel(condition.fact)}）`
      : factLabel(condition.fact);
  }
  return naturalConditionSummary(condition);
}

function naturalConditionSummary(condition: Extract<Expr, { type: 'condition' }>): string {
  if (condition.fact === 'lastActiveMinutes' && typeof condition.value === 'number') {
    const duration = formatDurationMinutes(condition.value);
    switch (condition.op) {
      case 'gt':
        return `超过 ${duration}未访问`;
      case 'gte':
        return `至少 ${duration}未访问`;
      case 'lt':
      case 'lte':
        return `${duration}内访问过`;
      case 'eq':
        return `正好 ${duration}未访问`;
      case 'neq':
        return `不是 ${duration}未访问`;
      default:
        return conditionSummary(condition);
    }
  }
  return conditionSummary(condition);
}

function conditionScore(condition: Extract<Expr, { type: 'condition' }>): number {
  if (condition.fact === 'lastActiveMinutes') return 0;
  if (condition.fact === 'totalTabCount' || condition.fact === 'windowTabCount') return 1;
  return 2;
}

function compactBooleanLabel(fact: FactKey, fallback: string): string {
  return COMPACT_BOOLEAN_LABELS[fact] ?? fallback;
}

function buildTagGroups(
  groups: Array<{ label: StrategyCardTagGroup['label']; tags: string[] }>,
): StrategyCardTagGroup[] {
  return groups
    .map((group) => ({
      label: group.label,
      tags: group.tags.slice(0, CARD_TAG_LIMIT),
      hidden: Math.max(0, group.tags.length - CARD_TAG_LIMIT),
    }))
    .filter((group) => group.tags.length > 0);
}

function conditionSummary(condition: Extract<Expr, { type: 'condition' }>): string {
  const label = factLabel(condition.fact);
  return `${label} ${operatorLabel(condition.op)} ${formatConditionValue(condition)}`.trim();
}

function formatConditionValue(condition: Extract<Expr, { type: 'condition' }>): string {
  if (condition.fact === 'lastActiveMinutes' && typeof condition.value === 'number') {
    return formatDurationMinutes(condition.value);
  }
  if (
    (condition.fact === 'totalTabCount' || condition.fact === 'windowTabCount') &&
    typeof condition.value === 'number'
  ) {
    return `${condition.value} 个`;
  }
  return formatFactValue(condition.value);
}

export function formatDurationMinutes(minutes: number): string {
  if (minutes > 0 && minutes % 1_440 === 0) return `${minutes / 1_440} 天`;
  if (minutes > 0 && minutes % 60 === 0) return `${minutes / 60} 小时`;
  return `${minutes} 分钟`;
}
