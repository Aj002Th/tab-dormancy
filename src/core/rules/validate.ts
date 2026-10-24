import { LIMITS } from '../../shared/constants';
import { factLabel, getLocale, type MessageKey, translate } from '../../shared/i18n';
import type { Capabilities, Expr, Locale, Operator, Strategy } from '../../shared/types';
import { normalizeDomain } from '../../shared/url';
import { FACT_BY_KEY, type FactDefinition, isFactAvailable } from './registry';

export type ValidationIssueCode =
  | 'BAD_ID'
  | 'DUPLICATE_ID'
  | 'TOO_DEEP'
  | 'EMPTY_GROUP'
  | 'TOO_MANY_CHILDREN'
  | 'UNKNOWN_FACT'
  | 'BAD_OPERATOR'
  | 'FACT_UNAVAILABLE'
  | 'TOO_MANY_NODES'
  | 'BAD_VALUE_NUMBER'
  | 'BAD_VALUE_BOOLEAN'
  | 'BAD_VALUE_DOMAIN_LIST'
  | 'BAD_VALUE_DOMAIN_INVALID'
  | 'BAD_VALUE_TEXT'
  | 'BAD_NAME';

export type ValidationIssue = {
  nodeId?: string;
  code: ValidationIssueCode;
  params?: Record<string, string | number>;
};

export type ValidationResult = {
  valid: boolean;
  issues: ValidationIssue[];
  nodeCount: number;
  depth: number;
};

export function validateExpr(expr: Expr, caps?: Capabilities): ValidationResult {
  const issues: ValidationIssue[] = [];
  const seen = new Set<string>();
  let nodeCount = 0;
  let depth = 0;

  const visit = (node: Expr, level: number): void => {
    nodeCount += 1;
    depth = Math.max(depth, level);

    if (!node.id) {
      issues.push({ code: 'BAD_ID' });
    } else if (seen.has(node.id)) {
      issues.push({ nodeId: node.id, code: 'DUPLICATE_ID', params: { id: node.id } });
    } else {
      seen.add(node.id);
    }

    if (level > LIMITS.maxDepth) {
      issues.push({ nodeId: node.id, code: 'TOO_DEEP', params: { max: LIMITS.maxDepth } });
    }

    switch (node.type) {
      case 'all':
      case 'any': {
        if (node.children.length === 0) {
          issues.push({ nodeId: node.id, code: 'EMPTY_GROUP' });
        }
        if (node.children.length > LIMITS.maxChildren) {
          issues.push({
            nodeId: node.id,
            code: 'TOO_MANY_CHILDREN',
            params: { max: LIMITS.maxChildren },
          });
        }
        for (const child of node.children) visit(child, level + 1);
        break;
      }
      case 'not':
        visit(node.child, level + 1);
        break;
      case 'condition': {
        const definition = FACT_BY_KEY.get(node.fact);
        if (!definition) {
          issues.push({ nodeId: node.id, code: 'UNKNOWN_FACT', params: { fact: node.fact } });
          break;
        }
        if (!definition.operators.includes(node.op)) {
          issues.push({
            nodeId: node.id,
            code: 'BAD_OPERATOR',
            params: { fact: factLabel(node.fact), op: node.op },
          });
          break;
        }
        if (caps && !isFactAvailable(definition, caps)) {
          issues.push({
            nodeId: node.id,
            code: 'FACT_UNAVAILABLE',
            params: { fact: factLabel(node.fact) },
          });
        }
        validateValue(node.value, node.op, definition, issues);
        break;
      }
    }
  };

  visit(expr, 0);

  if (nodeCount > LIMITS.maxNodes) {
    issues.push({ code: 'TOO_MANY_NODES', params: { max: LIMITS.maxNodes } });
  }

  return { valid: issues.length === 0, issues, nodeCount, depth };
}

function validateValue(value: unknown, op: Operator, definition: FactDefinition, issues: ValidationIssue[]): void {
  if (definition.type === 'number') {
    if (typeof value !== 'number' || !Number.isFinite(value) || value < 0 || value > LIMITS.maxNumber) {
      issues.push({ code: 'BAD_VALUE_NUMBER', params: { max: LIMITS.maxNumber } });
    }
    return;
  }

  if (definition.type === 'boolean') {
    if (typeof value !== 'boolean') issues.push({ code: 'BAD_VALUE_BOOLEAN' });
    return;
  }

  if (op === 'inDomainList') {
    if (!Array.isArray(value) || value.length === 0 || value.length > LIMITS.maxDomainList) {
      issues.push({ code: 'BAD_VALUE_DOMAIN_LIST', params: { max: LIMITS.maxDomainList } });
      return;
    }
    if (
      value.some((item) => typeof item !== 'string' || item.length > LIMITS.maxStringLength || !normalizeDomain(item))
    ) {
      issues.push({ code: 'BAD_VALUE_DOMAIN_INVALID' });
    }
    return;
  }

  if (typeof value !== 'string' || value.length > LIMITS.maxStringLength) {
    issues.push({ code: 'BAD_VALUE_TEXT', params: { max: LIMITS.maxStringLength } });
  }
}

export function validationMessage(issue: ValidationIssue, locale?: Locale): string {
  return translate(locale ?? getLocale(), `validation.${issue.code}` as MessageKey, issue.params ?? {});
}

export function validateStrategy(
  strategy: Pick<Strategy, 'name' | 'expression'>,
  caps?: Capabilities,
): ValidationResult {
  const result = validateExpr(strategy.expression, caps);
  const name = strategy.name.trim();
  if (name.length < 1 || name.length > LIMITS.strategyNameLength) {
    result.issues.push({
      code: 'BAD_NAME',
      params: { max: LIMITS.strategyNameLength },
    });
  }
  return { ...result, valid: result.issues.length === 0 };
}
