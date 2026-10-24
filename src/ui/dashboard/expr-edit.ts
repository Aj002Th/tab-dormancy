import { FACT_BY_KEY } from '../../core/rules/registry';
import { operatorLabel, t } from '../../shared/i18n';
import type { Expr, FactKey, FactValue, Operator } from '../../shared/types';

export { operatorLabel };

export function defaultOperator(fact: FactKey): Operator {
  if (fact === 'domain') return 'matchesDomain';
  return FACT_BY_KEY.get(fact)?.operators[0] ?? 'is';
}

export function defaultValue(fact: FactKey): FactValue {
  const definition = FACT_BY_KEY.get(fact);
  if (!definition) return '';
  if (definition.type === 'number') return fact === 'lastActiveMinutes' ? 4_320 : 20;
  if (definition.type === 'boolean') return true;
  if (definition.type === 'domain') return 'example.com';
  return '';
}

export function formatFactValue(value: FactValue | undefined): string {
  if (value === undefined) return '';
  if (typeof value === 'boolean') return value ? t('app.yes') : t('app.no');
  if (Array.isArray(value)) return value.join(t('listSeparator'));
  return String(value);
}

export function newCondition(id: string, fact: FactKey = 'lastActiveMinutes'): Expr {
  return { type: 'condition', id, fact, op: defaultOperator(fact), value: defaultValue(fact) };
}

export function newGroup(type: 'all' | 'any', id: string, child: Expr): Expr {
  return { type, id, children: [child] };
}

export function replaceNode(expr: Expr, id: string, replacer: (node: Expr) => Expr): Expr {
  if (expr.id === id) return replacer(expr);
  if (expr.type === 'not') return { ...expr, child: replaceNode(expr.child, id, replacer) };
  if (expr.type === 'all' || expr.type === 'any') {
    return { ...expr, children: expr.children.map((child) => replaceNode(child, id, replacer)) };
  }
  return expr;
}

export function addChild(expr: Expr, groupId: string, child: Expr): Expr {
  return replaceNode(expr, groupId, (node) =>
    node.type === 'all' || node.type === 'any' ? { ...node, children: [...node.children, child] } : node,
  );
}

export function removeNode(expr: Expr, id: string): Expr {
  if (expr.type === 'all' || expr.type === 'any') {
    return {
      ...expr,
      children: expr.children.filter((child) => !containsNode(child, id)).map((child) => removeNode(child, id)),
    };
  }
  if (expr.type === 'not') return { ...expr, child: removeNode(expr.child, id) };
  return expr;
}

function containsNode(expr: Expr, id: string): boolean {
  if (expr.id === id) return true;
  if (expr.type === 'not') return containsNode(expr.child, id);
  if (expr.type === 'all' || expr.type === 'any') return expr.children.some((child) => containsNode(child, id));
  return false;
}

export function toggleNot(expr: Expr, id: string, nextId: () => string): Expr {
  return replaceNode(expr, id, (node) =>
    node.type === 'not' ? node.child : { type: 'not', id: nextId(), child: node },
  );
}

export function unwrapNot(expr: Expr): { inner: Exclude<Expr, { type: 'not' }>; negated: boolean } {
  let inner = expr;
  let negated = false;
  while (inner.type === 'not') {
    negated = !negated;
    inner = inner.child;
  }
  return { inner: inner as Exclude<Expr, { type: 'not' }>, negated };
}

export function effectiveBooleanNegated(value: FactValue | undefined, negated: boolean): boolean {
  return (value === false) !== negated;
}

export function countNodes(expr: Expr): number {
  if (expr.type === 'condition') return 1;
  if (expr.type === 'not') return 1 + countNodes(expr.child);
  return 1 + expr.children.reduce((sum, child) => sum + countNodes(child), 0);
}
