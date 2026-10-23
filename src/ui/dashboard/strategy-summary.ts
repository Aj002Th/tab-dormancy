import { FACT_BY_KEY } from '../../core/rules/registry';
import type { Expr } from '../../shared/types';
import { effectiveBooleanNegated, formatFactValue, operatorLabel, unwrapNot } from './expr-edit';

export function expressionSummary(expression: Expr): string {
  const { inner, negated } = unwrapNot(expression);

  if (inner.type === 'condition') {
    const definition = FACT_BY_KEY.get(inner.fact);
    if (!definition) return inner.fact;
    if (definition.type === 'boolean') {
      return effectiveBooleanNegated(inner.value, negated) ? `非（${definition.label}）` : definition.label;
    }
    const summary = conditionSummary(inner);
    return negated ? `非（${summary}）` : summary;
  }

  const summary = inner.children.map(expressionSummary).join(inner.type === 'all' ? ' 且 ' : ' 或 ');
  return negated ? `非（${summary}）` : summary;
}

function conditionSummary(condition: Extract<Expr, { type: 'condition' }>): string {
  const label = FACT_BY_KEY.get(condition.fact)?.label ?? condition.fact;
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
