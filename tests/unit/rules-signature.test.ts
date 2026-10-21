import { describe, expect, it } from 'vitest';
import { canonicalExpr, signatureOf } from '../../src/core/rules/signature';
import type { Expr } from '../../src/shared/types';

const exprA: Expr = {
  type: 'all',
  id: 'a',
  children: [
    { type: 'condition', id: 'b', fact: 'lastActiveMinutes', op: 'gt', value: 60 },
    { type: 'condition', id: 'c', fact: 'pinned', op: 'is', value: false },
  ],
};

const exprB: Expr = {
  type: 'all',
  id: 'x',
  children: [
    { type: 'condition', id: 'y', fact: 'lastActiveMinutes', op: 'gt', value: 60 },
    { type: 'condition', id: 'z', fact: 'pinned', op: 'is', value: false },
  ],
};

describe('rule signature', () => {
  it('ignores node ids', async () => {
    expect(await signatureOf(exprA)).toBe(await signatureOf(exprB));
    expect(canonicalExpr(exprA)).not.toContain('"id"');
  });

  it('changes when semantics change', async () => {
    const changed: Expr = {
      ...exprA,
      children: [exprA.children[0], { type: 'condition', id: 'c', fact: 'pinned', op: 'is', value: true }],
    };
    expect(await signatureOf(exprA)).not.toBe(await signatureOf(changed));
  });
});
