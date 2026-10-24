import { describe, expect, it } from 'vitest';
import { validateExpr, validateStrategy, validationMessage } from '../../src/core/rules/validate';
import { setLocale } from '../../src/shared/i18n';
import type { Expr, FactValue, Operator } from '../../src/shared/types';

const condition = (id: string, fact: string, op: Operator, value?: FactValue): Expr =>
  ({
    type: 'condition',
    id,
    fact,
    op,
    value,
  }) as Expr;

describe('validateExpr', () => {
  it('rejects empty groups', () => {
    const expr: Expr = { type: 'all', id: 'root', children: [] };
    expect(validateExpr(expr).valid).toBe(false);
    expect(validateExpr(expr).issues[0]?.code).toBe('EMPTY_GROUP');
  });

  it('rejects duplicate node ids', () => {
    const expr: Expr = {
      type: 'all',
      id: 'root',
      children: [condition('same', 'pinned', 'is', true), condition('same', 'audible', 'is', true)],
    };
    expect(validateExpr(expr).issues.some((issue) => issue.code === 'DUPLICATE_ID')).toBe(true);
  });

  it('rejects expressions deeper than 8', () => {
    let expr: Expr = condition('leaf', 'pinned', 'is', true);
    for (let i = 0; i < 9; i += 1) expr = { type: 'not', id: `n${i}`, child: expr };
    expect(validateExpr(expr).issues.some((issue) => issue.code === 'TOO_DEEP')).toBe(true);
  });

  it('rejects unknown facts, bad operators and bad values', () => {
    expect(validateExpr(condition('a', 'nope', 'is', true)).issues[0]?.code).toBe('UNKNOWN_FACT');
    expect(validateExpr(condition('a', 'pinned', 'gt', 1)).issues[0]?.code).toBe('BAD_OPERATOR');
    expect(validateExpr(condition('a', 'lastActiveMinutes', 'gt', '60')).issues[0]?.code).toBe('BAD_VALUE_NUMBER');
    expect(validateExpr(condition('a', 'domain', 'inDomainList', [])).issues[0]?.code).toBe('BAD_VALUE_DOMAIN_LIST');
  });

  it('disables facts that the browser cannot provide', () => {
    const caps = { chromeMajor: 121, lastAccessed: false, frozen: false, tabGroups: false, sessions: true };
    const result = validateExpr(condition('a', 'lastActiveMinutes', 'gt', 60), caps);
    expect(result.issues.some((issue) => issue.code === 'FACT_UNAVAILABLE')).toBe(true);
  });

  it('renders localized validation messages', () => {
    setLocale('zh');
    expect(validationMessage(validateExpr(condition('a', 'nope', 'is', true)).issues[0])).toContain('未知事实');
    setLocale('en');
    expect(validationMessage(validateExpr(condition('a', 'nope', 'is', true)).issues[0])).toContain('Unknown fact');
  });

  it('validates strategy names', () => {
    const result = validateStrategy({ name: '  ', expression: condition('a', 'pinned', 'is', true) });
    expect(result.valid).toBe(false);
    expect(result.issues.some((issue) => issue.code === 'BAD_NAME')).toBe(true);
  });
});
