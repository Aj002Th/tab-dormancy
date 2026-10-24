import { AppError } from '../shared/errors';
import { t } from '../shared/i18n';
import type { Capabilities, Expr, FactKey, Strategy } from '../shared/types';
import { FACT_BY_KEY, isFactAvailable } from './rules/registry';

export function findStrategy(strategies: Strategy[], id: string): Strategy | undefined {
  return strategies.find((strategy) => strategy.id === id);
}

export function requireStrategy(strategies: Strategy[], id: string): Strategy {
  const strategy = findStrategy(strategies, id);
  if (!strategy) throw new AppError('NOT_FOUND', t('errors.strategyNotFound'));
  return strategy;
}

export function unsupportedFacts(expr: Expr, caps: Capabilities): FactKey[] {
  const missing = new Set<FactKey>();
  const visit = (node: Expr): void => {
    if (node.type === 'condition') {
      const definition = FACT_BY_KEY.get(node.fact);
      if (definition && !isFactAvailable(definition, caps)) missing.add(node.fact);
      return;
    }
    if (node.type === 'not') {
      visit(node.child);
      return;
    }
    for (const child of node.children) visit(child);
  };
  visit(expr);
  return [...missing];
}

export function strategyUsable(strategy: Strategy, caps: Capabilities): boolean {
  return unsupportedFacts(strategy.expression, caps).length === 0;
}
