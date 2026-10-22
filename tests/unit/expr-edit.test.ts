import { describe, expect, it } from 'vitest';
import type { Expr } from '../../src/shared/types';
import {
  addChild,
  countNodes,
  defaultOperator,
  defaultValue,
  newCondition,
  newGroup,
  removeNode,
  replaceNode,
  toggleNot,
  unwrapNot,
} from '../../src/ui/dashboard/expr-edit';

describe('expr-edit', () => {
  it('creates sensible defaults', () => {
    expect(defaultOperator('lastActiveMinutes')).toBe('gt');
    expect(defaultOperator('domain')).toBe('matchesDomain');
    expect(defaultValue('lastActiveMinutes')).toBe(4320);
    expect(defaultValue('pinned')).toBe(true);
    const condition = newCondition('a') as Extract<Expr, { type: 'condition' }>;
    expect(condition.fact).toBe('lastActiveMinutes');
    expect(condition.op).toBe('gt');
  });

  it('adds and removes children without mutating the original', () => {
    const group = newGroup('all', 'g', newCondition('a'));
    const added = addChild(group, 'g', newCondition('b'));
    expect(countNodes(group)).toBe(2);
    expect(countNodes(added)).toBe(3);
    expect(countNodes(removeNode(added, 'b'))).toBe(2);
  });

  it('replaces a node', () => {
    const group = newGroup('all', 'g', newCondition('a'));
    const next = replaceNode(group, 'a', (node) => (node.type === 'condition' ? { ...node, value: 99 } : node));
    expect((next as Extract<Expr, { type: 'all' }>).children[0]).toMatchObject({ value: 99 });
  });

  it('wraps and unwraps NOT', () => {
    const condition = newCondition('a');
    let next = toggleNot(condition, 'a', () => 'not-1');
    expect(unwrapNot(next).negated).toBe(true);
    next = toggleNot(next, 'a', () => 'not-2');
    expect(unwrapNot(next).negated).toBe(false);
  });
});
