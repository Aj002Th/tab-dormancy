import type {
  Capabilities,
  Evaluation,
  Expr,
  FactValue,
  Operator,
  Strategy,
  TabFacts,
  TraceNode,
} from '../../shared/types';
import { domainMatches, globMatches } from '../../shared/url';
import { FACT_BY_KEY, isFactAvailable } from './registry';

export function evaluateExpr(expr: Expr, facts: TabFacts, caps?: Capabilities): Evaluation {
  const trace: TraceNode[] = [];

  const visit = (node: Expr): boolean => {
    if (node.type === 'condition') {
      return evaluateCondition(node, facts, caps, trace);
    }

    const entry: TraceNode = { nodeId: node.id, type: node.type, result: false, reason: 'not-matched' };
    trace.push(entry);

    if (node.type === 'not') {
      entry.result = !visit(node.child);
    } else {
      const results = node.children.map(visit);
      entry.result = node.type === 'all' ? results.every(Boolean) : results.some(Boolean);
    }
    entry.reason = entry.result ? 'matched' : 'not-matched';
    return entry.result;
  };

  return { matched: visit(expr), trace };
}

export function evaluateStrategy(strategy: Strategy, facts: TabFacts, caps?: Capabilities): Evaluation {
  return evaluateExpr(strategy.expression, facts, caps);
}

function evaluateCondition(
  node: Extract<Expr, { type: 'condition' }>,
  facts: TabFacts,
  caps: Capabilities | undefined,
  trace: TraceNode[],
): boolean {
  const definition = FACT_BY_KEY.get(node.fact);
  const entry: TraceNode = {
    nodeId: node.id,
    type: 'condition',
    result: false,
    fact: node.fact,
    expected: node.value,
    reason: 'not-matched',
  };
  trace.push(entry);

  if (!definition) {
    entry.reason = 'unsupported';
    return false;
  }

  if (caps && !isFactAvailable(definition, caps)) {
    entry.reason = 'unsupported';
    return false;
  }

  const actual = facts[node.fact] as FactValue | null | undefined;
  entry.actual = actual ?? null;

  if (actual === null || actual === undefined) {
    entry.reason = 'unknown';
    return false;
  }

  entry.result = compare(actual, node.op, node.value);
  entry.reason = entry.result ? 'matched' : 'not-matched';
  return entry.result;
}

function compare(actual: FactValue, op: Operator, expected: FactValue | undefined): boolean {
  if (op === 'is') {
    return typeof actual === 'boolean' && actual === expected;
  }

  if (op === 'gt' || op === 'gte' || op === 'lt' || op === 'lte' || op === 'eq' || op === 'neq') {
    if (typeof actual !== 'number' || typeof expected !== 'number') return false;
    switch (op) {
      case 'gt':
        return actual > expected;
      case 'gte':
        return actual >= expected;
      case 'lt':
        return actual < expected;
      case 'lte':
        return actual <= expected;
      case 'eq':
        return actual === expected;
      case 'neq':
        return actual !== expected;
    }
  }

  if (typeof actual !== 'string') return false;

  if (op === 'inDomainList') {
    return Array.isArray(expected) && expected.some((pattern) => domainMatches(actual, pattern));
  }

  if (typeof expected !== 'string') return false;

  if (op === 'matchesDomain') return domainMatches(actual, expected);
  if (op === 'matchesGlob') return globMatches(actual, expected);

  const left = actual.toLowerCase();
  const right = expected.toLowerCase();
  switch (op) {
    case 'equals':
      return left === right;
    case 'contains':
      return left.includes(right);
    case 'startsWith':
      return left.startsWith(right);
    case 'endsWith':
      return left.endsWith(right);
    default:
      return false;
  }
}
