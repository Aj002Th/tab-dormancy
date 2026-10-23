import { FACT_BY_KEY } from '../../core/rules/registry';
import { formatMinutesAgo } from '../../shared/time';
import type { FactKey, FactValue, TraceNode } from '../../shared/types';

const COUNT_FACTS = new Set<FactKey>(['totalTabCount', 'windowTabCount']);

export function traceFactLabel(fact: FactKey): string {
  return FACT_BY_KEY.get(fact)?.label ?? fact;
}

function baseValue(value: FactValue | null | undefined): string {
  if (value === null || value === undefined) return '未知';
  if (typeof value === 'boolean') return value ? '是' : '否';
  if (Array.isArray(value)) return value.length > 0 ? value.join('、') : '（空）';
  if (typeof value === 'string') return value === '' ? '（空）' : value;
  return String(value);
}

export function formatTraceValue(fact: FactKey, value: FactValue | null | undefined): string {
  if (typeof value === 'number') {
    if (fact === 'lastActiveMinutes') return `${value} 分钟（${formatMinutesAgo(value)}）`;
    if (COUNT_FACTS.has(fact)) return `${value} 个`;
  }
  return baseValue(value);
}

export function formatTraceExpected(fact: FactKey, value: FactValue | null | undefined): string {
  if (value === null || value === undefined) return '未设置';
  if (typeof value === 'number' && COUNT_FACTS.has(fact)) return `${value} 个`;
  if (typeof value === 'number' && fact === 'lastActiveMinutes') return `${value} 分钟`;
  return baseValue(value);
}

export function traceResultLabel(node: Pick<TraceNode, 'result' | 'reason'>): string {
  if (node.result) return '命中';
  if (node.reason === 'unknown') return '未知';
  if (node.reason === 'unsupported') return '不支持';
  return '未命中';
}
