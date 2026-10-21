import { describe, expect, it } from 'vitest';
import { evaluateExpr } from '../../src/core/rules/evaluate';
import type { Capabilities, Expr, FactKey, FactValue, Operator, TabFacts } from '../../src/shared/types';

const caps: Capabilities = { chromeMajor: 132, lastAccessed: true, frozen: true, tabGroups: true, sessions: true };

const facts: TabFacts = {
  tabId: 1,
  windowId: 10,
  url: 'https://mail.google.com/mail/u/0',
  title: 'Inbox',
  domain: 'mail.google.com',
  lastActiveMinutes: 120,
  totalTabCount: 8,
  windowTabCount: 3,
  pinned: false,
  audible: false,
  active: false,
  muted: false,
  discarded: false,
  frozen: false,
  grouped: true,
  groupCollapsed: false,
  windowFocused: true,
  onlyTabInWindow: false,
  groupTitle: '工作',
};

const condition = (id: string, fact: FactKey, op: Operator, value?: FactValue): Expr => ({
  type: 'condition',
  id,
  fact,
  op,
  value,
});

const all = (id: string, children: Expr[]): Expr => ({ type: 'all', id, children });
const any = (id: string, children: Expr[]): Expr => ({ type: 'any', id, children });
const not = (id: string, child: Expr): Expr => ({ type: 'not', id, child });

describe('evaluateExpr', () => {
  it('evaluates nested groups', () => {
    const expr = all('root', [
      condition('time', 'lastActiveMinutes', 'gt', 60),
      any('or', [condition('pin', 'pinned', 'is', true), condition('group', 'groupCollapsed', 'is', false)]),
      not('not-audible', condition('audible', 'audible', 'is', true)),
    ]);
    expect(evaluateExpr(expr, facts, caps).matched).toBe(true);
  });

  it('treats unknown time as not matched', () => {
    const unknown = { ...facts, lastActiveMinutes: null };
    const result = evaluateExpr(condition('time', 'lastActiveMinutes', 'gt', 60), unknown, caps);
    expect(result.matched).toBe(false);
    expect(result.trace[0]?.reason).toBe('unknown');
  });

  it('does not match facts the browser cannot provide', () => {
    const limited = { ...caps, frozen: false };
    const result = evaluateExpr(condition('frozen', 'frozen', 'is', false), facts, limited);
    expect(result.matched).toBe(false);
    expect(result.trace[0]?.reason).toBe('unsupported');
  });

  it('compares text case-insensitively and supports domain/glob matching', () => {
    expect(evaluateExpr(condition('t', 'title', 'contains', 'inbox'), facts, caps).matched).toBe(true);
    expect(evaluateExpr(condition('d', 'domain', 'matchesDomain', 'google.com'), facts, caps).matched).toBe(true);
    expect(
      evaluateExpr(condition('l', 'domain', 'inDomainList', ['example.com', 'google.com']), facts, caps).matched,
    ).toBe(true);
    expect(evaluateExpr(condition('g', 'url', 'matchesGlob', '*://mail.google.com/*'), facts, caps).matched).toBe(true);
  });

  it('returns a flat trace for every node', () => {
    const expr = all('root', [
      condition('time', 'lastActiveMinutes', 'gt', 60),
      condition('pin', 'pinned', 'is', true),
    ]);
    const trace = evaluateExpr(expr, facts, caps).trace;
    expect(trace.map((node) => node.nodeId)).toEqual(['root', 'time', 'pin']);
    expect(trace.find((node) => node.nodeId === 'pin')?.result).toBe(false);
  });
});
