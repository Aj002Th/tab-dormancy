import type { Expr, FactKey, FactValue, Operator, Strategy } from '../../shared/types';

const condition = (id: string, fact: FactKey, op: Operator, value?: FactValue): Expr => ({
  type: 'condition',
  id,
  fact,
  op,
  value,
});
const not = (id: string, child: Expr): Expr => ({ type: 'not', id, child });
const all = (id: string, children: Expr[]): Expr => ({ type: 'all', id, children });

export function createPresetStrategies(now: number): Strategy[] {
  return [
    {
      id: 'preset:mild',
      name: '温和',
      builtin: true,
      expression: all('preset:mild:root', [
        condition('preset:mild:time', 'lastActiveMinutes', 'gt', 10_080),
        not('preset:mild:pinned', condition('preset:mild:pinned:cond', 'pinned', 'is', true)),
        not('preset:mild:audible', condition('preset:mild:audible:cond', 'audible', 'is', true)),
        not('preset:mild:active', condition('preset:mild:active:cond', 'active', 'is', true)),
        not('preset:mild:grouped', condition('preset:mild:grouped:cond', 'grouped', 'is', true)),
      ]),
      createdAt: now,
      updatedAt: now,
      lastPreviewHash: null,
      lastPreviewAt: null,
    },
    {
      id: 'preset:standard',
      name: '标准',
      builtin: true,
      expression: all('preset:standard:root', [
        condition('preset:standard:time', 'lastActiveMinutes', 'gt', 4_320),
        not('preset:standard:pinned', condition('preset:standard:pinned:cond', 'pinned', 'is', true)),
        not('preset:standard:audible', condition('preset:standard:audible:cond', 'audible', 'is', true)),
        not('preset:standard:active', condition('preset:standard:active:cond', 'active', 'is', true)),
        not('preset:standard:grouped', condition('preset:standard:grouped:cond', 'grouped', 'is', true)),
      ]),
      createdAt: now,
      updatedAt: now,
      lastPreviewHash: null,
      lastPreviewAt: null,
    },
    {
      id: 'preset:aggressive',
      name: '激进',
      builtin: true,
      expression: all('preset:aggressive:root', [
        condition('preset:aggressive:time', 'lastActiveMinutes', 'gt', 1_440),
        not('preset:aggressive:pinned', condition('preset:aggressive:pinned:cond', 'pinned', 'is', true)),
        not('preset:aggressive:audible', condition('preset:aggressive:audible:cond', 'audible', 'is', true)),
        not('preset:aggressive:active', condition('preset:aggressive:active:cond', 'active', 'is', true)),
      ]),
      createdAt: now,
      updatedAt: now,
      lastPreviewHash: null,
      lastPreviewAt: null,
    },
  ];
}

export function regenerateNodeIds(expr: Expr, nextId: () => string): Expr {
  switch (expr.type) {
    case 'condition':
      return { ...expr, id: nextId() };
    case 'not':
      return { ...expr, id: nextId(), child: regenerateNodeIds(expr.child, nextId) };
    case 'all':
    case 'any':
      return { ...expr, id: nextId(), children: expr.children.map((child) => regenerateNodeIds(child, nextId)) };
  }
}

export function cloneStrategy(source: Strategy, now: number, id: string, name: string): Strategy {
  return {
    id,
    name: name.trim().slice(0, 80),
    builtin: false,
    expression: regenerateNodeIds(source.expression, () => `node:${Math.random().toString(36).slice(2)}`),
    createdAt: now,
    updatedAt: now,
    lastPreviewHash: null,
    lastPreviewAt: null,
  };
}

export function createCustomStrategy(name: string, expression: Expr, now: number, id: string): Strategy {
  return {
    id,
    name: name.trim(),
    builtin: false,
    expression,
    createdAt: now,
    updatedAt: now,
    lastPreviewHash: null,
    lastPreviewAt: null,
  };
}
