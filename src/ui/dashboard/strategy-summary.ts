import { FACT_BY_KEY } from '../../core/rules/registry';
import { factLabel, getLocale, type MessageKey, type MessageParams, translate } from '../../shared/i18n';
import type { Expr, FactKey, Locale } from '../../shared/types';
import { effectiveBooleanNegated, formatFactValue, operatorLabel, unwrapNot } from './expr-edit';

const CARD_TAG_LIMIT = 4;

export type StrategyCardTagGroup = {
  label: 'together' | 'exclude' | 'branch';
  tags: string[];
  hidden: number;
};

export type StrategyCardSummary = {
  primary: string;
  groups: StrategyCardTagGroup[];
  full: string;
};

const COMPACT_BOOLEAN_KEYS: Partial<Record<FactKey, MessageKey>> = {
  pinned: 'summary.boolean.pinned',
  audible: 'summary.boolean.audible',
  active: 'summary.boolean.active',
  muted: 'summary.boolean.muted',
  discarded: 'summary.boolean.discarded',
  frozen: 'summary.boolean.frozen',
  grouped: 'summary.boolean.grouped',
  groupCollapsed: 'summary.boolean.groupCollapsed',
  windowFocused: 'summary.boolean.windowFocused',
  onlyTabInWindow: 'summary.boolean.onlyTabInWindow',
};

function tr(locale: Locale | undefined, key: MessageKey, params: MessageParams = {}): string {
  return translate(locale ?? getLocale(), key, params);
}

export function expressionSummary(expression: Expr, locale?: Locale): string {
  const { inner, negated } = unwrapNot(expression);

  if (inner.type === 'condition') {
    const definition = FACT_BY_KEY.get(inner.fact);
    if (!definition) return inner.fact;
    if (definition.type === 'boolean') {
      const label = factLabel(inner.fact, locale);
      return effectiveBooleanNegated(inner.value, negated) ? tr(locale, 'summary.not', { value: label }) : label;
    }
    const summary = conditionSummary(inner, locale);
    return negated ? tr(locale, 'summary.not', { value: summary }) : summary;
  }

  const summary = inner.children
    .map((child) => expressionSummary(child, locale))
    .join(tr(locale, inner.type === 'all' ? 'summary.and' : 'summary.or'));
  return negated ? tr(locale, 'summary.not', { value: summary }) : summary;
}

export function strategyCardSummary(expression: Expr, locale?: Locale): StrategyCardSummary {
  const full = expressionSummary(expression, locale);
  const { inner, negated } = unwrapNot(expression);

  if (negated) return { primary: full, groups: [], full };
  if (inner.type === 'condition') return { primary: conditionCardSummary(inner, locale), groups: [], full };

  if (inner.type === 'any') {
    return {
      primary: tr(locale, 'summary.anyCount', { count: inner.children.length }),
      groups: buildTagGroups([
        { label: 'branch', tags: inner.children.map((child) => expressionSummary(child, locale)) },
      ]),
      full,
    };
  }

  const clauses = inner.children.map((child) => classifyClause(child, locale));
  const requirements = clauses.filter((clause) => !clause.exclusion);
  const exclusions = clauses.filter((clause) => clause.exclusion);

  if (requirements.length === 0) {
    return {
      primary: tr(locale, 'summary.allExcluded', { count: exclusions.length }),
      groups: buildTagGroups([{ label: 'exclude', tags: exclusions.map((clause) => clause.summary) }]),
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
      ...(otherRequirements.length > 0 ? [{ label: 'together' as const, tags: otherRequirements }] : []),
      ...(exclusions.length > 0
        ? [{ label: 'exclude' as const, tags: exclusions.map((clause) => clause.summary) }]
        : []),
    ]),
    full,
  };
}

type CardClause = {
  summary: string;
  exclusion: boolean;
  score: number;
};

function classifyClause(expression: Expr, locale?: Locale): CardClause {
  const { inner, negated } = unwrapNot(expression);
  if (inner.type !== 'condition') {
    return { summary: expressionSummary(expression, locale), exclusion: false, score: 3 };
  }

  const definition = FACT_BY_KEY.get(inner.fact);
  if (definition?.type === 'boolean') {
    if (effectiveBooleanNegated(inner.value, negated)) {
      return {
        summary: compactBooleanLabel(inner.fact, factLabel(inner.fact, locale), locale),
        exclusion: true,
        score: 4,
      };
    }
    return { summary: factLabel(inner.fact, locale), exclusion: false, score: 2 };
  }

  const base = naturalConditionSummary(inner, locale);
  return {
    summary: negated ? tr(locale, 'summary.not', { value: base }) : base,
    exclusion: false,
    score: conditionScore(inner),
  };
}

function conditionCardSummary(condition: Extract<Expr, { type: 'condition' }>, locale?: Locale): string {
  const definition = FACT_BY_KEY.get(condition.fact);
  if (definition?.type === 'boolean') {
    const label = factLabel(condition.fact, locale);
    return effectiveBooleanNegated(condition.value, false) ? tr(locale, 'summary.not', { value: label }) : label;
  }
  return naturalConditionSummary(condition, locale);
}

function naturalConditionSummary(condition: Extract<Expr, { type: 'condition' }>, locale?: Locale): string {
  if (condition.fact === 'lastActiveMinutes' && typeof condition.value === 'number') {
    const duration = formatDurationMinutes(condition.value, locale);
    switch (condition.op) {
      case 'gt':
        return tr(locale, 'summary.visitOver', { duration });
      case 'gte':
        return tr(locale, 'summary.visitAtLeast', { duration });
      case 'lt':
      case 'lte':
        return tr(locale, 'summary.visitWithin', { duration });
      case 'eq':
        return tr(locale, 'summary.visitExactly', { duration });
      case 'neq':
        return tr(locale, 'summary.visitNot', { duration });
      default:
        return conditionSummary(condition, locale);
    }
  }
  return conditionSummary(condition, locale);
}

function conditionScore(condition: Extract<Expr, { type: 'condition' }>): number {
  if (condition.fact === 'lastActiveMinutes') return 0;
  if (condition.fact === 'totalTabCount' || condition.fact === 'windowTabCount') return 1;
  return 2;
}

function compactBooleanLabel(fact: FactKey, fallback: string, locale?: Locale): string {
  const key = COMPACT_BOOLEAN_KEYS[fact];
  return key ? tr(locale, key) : fallback;
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

function conditionSummary(condition: Extract<Expr, { type: 'condition' }>, locale?: Locale): string {
  const definition = FACT_BY_KEY.get(condition.fact);
  const label = definition ? factLabel(condition.fact, locale) : condition.fact;
  const operator = operatorLabel(condition.op, locale);
  const value = formatConditionValue(condition, locale);
  const separator = Array.isArray(condition.value) ? tr(locale, 'summary.listSeparator') : ' ';
  return `${label} ${operator}${separator}${value}`.trim();
}

function formatConditionValue(condition: Extract<Expr, { type: 'condition' }>, locale?: Locale): string {
  if (condition.fact === 'lastActiveMinutes' && typeof condition.value === 'number') {
    return formatDurationMinutes(condition.value, locale);
  }
  if (
    (condition.fact === 'totalTabCount' || condition.fact === 'windowTabCount') &&
    typeof condition.value === 'number'
  ) {
    return tr(locale, 'summary.count', { count: condition.value });
  }
  return formatFactValue(condition.value, locale);
}

export function formatDurationMinutes(minutes: number, locale?: Locale): string {
  if (minutes > 0 && minutes % 1_440 === 0) {
    return tr(locale, 'summary.durationDays', { count: minutes / 1_440 });
  }
  if (minutes > 0 && minutes % 60 === 0) {
    return tr(locale, 'summary.durationHours', { count: minutes / 60 });
  }
  return tr(locale, 'summary.durationMinutes', { count: minutes });
}
