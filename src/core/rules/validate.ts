import { LIMITS } from '../../shared/constants';
import type { Capabilities, Expr, Operator, Strategy } from '../../shared/types';
import { normalizeDomain } from '../../shared/url';
import { FACT_BY_KEY, type FactDefinition, isFactAvailable } from './registry';

export type ValidationIssue = {
  nodeId?: string;
  code:
    | 'BAD_ID'
    | 'DUPLICATE_ID'
    | 'EMPTY_GROUP'
    | 'TOO_DEEP'
    | 'TOO_MANY_NODES'
    | 'TOO_MANY_CHILDREN'
    | 'UNKNOWN_FACT'
    | 'FACT_UNAVAILABLE'
    | 'BAD_OPERATOR'
    | 'BAD_VALUE'
    | 'BAD_NAME';
  message: string;
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
      issues.push({ code: 'BAD_ID', message: '节点缺少 ID' });
    } else if (seen.has(node.id)) {
      issues.push({ nodeId: node.id, code: 'DUPLICATE_ID', message: `节点 ID 重复：${node.id}` });
    } else {
      seen.add(node.id);
    }

    if (level > LIMITS.maxDepth) {
      issues.push({ nodeId: node.id, code: 'TOO_DEEP', message: `表达式深度不能超过 ${LIMITS.maxDepth}` });
    }

    switch (node.type) {
      case 'all':
      case 'any': {
        if (node.children.length === 0) {
          issues.push({ nodeId: node.id, code: 'EMPTY_GROUP', message: '规则组至少需要一个子条件' });
        }
        if (node.children.length > LIMITS.maxChildren) {
          issues.push({
            nodeId: node.id,
            code: 'TOO_MANY_CHILDREN',
            message: `每组最多 ${LIMITS.maxChildren} 个直接子条件`,
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
          issues.push({ nodeId: node.id, code: 'UNKNOWN_FACT', message: `未知事实：${node.fact}` });
          break;
        }
        if (!definition.operators.includes(node.op)) {
          issues.push({ nodeId: node.id, code: 'BAD_OPERATOR', message: `事实 ${node.fact} 不支持操作符 ${node.op}` });
          break;
        }
        if (caps && !isFactAvailable(definition, caps)) {
          issues.push({
            nodeId: node.id,
            code: 'FACT_UNAVAILABLE',
            message: `当前浏览器不支持事实：${definition.label}`,
          });
        }
        validateValue(node.value, node.op, definition, issues);
        break;
      }
    }
  };

  visit(expr, 0);

  if (nodeCount > LIMITS.maxNodes) {
    issues.push({ code: 'TOO_MANY_NODES', message: `表达式节点不能超过 ${LIMITS.maxNodes}` });
  }

  return { valid: issues.length === 0, issues, nodeCount, depth };
}

function validateValue(value: unknown, op: Operator, definition: FactDefinition, issues: ValidationIssue[]): void {
  if (definition.type === 'number') {
    if (typeof value !== 'number' || !Number.isFinite(value) || value < 0 || value > LIMITS.maxNumber) {
      issues.push({ code: 'BAD_VALUE', message: `数字必须是 0–${LIMITS.maxNumber} 之间的有限值` });
    }
    return;
  }

  if (definition.type === 'boolean') {
    if (typeof value !== 'boolean') issues.push({ code: 'BAD_VALUE', message: '布尔条件必须使用 true 或 false' });
    return;
  }

  if (op === 'inDomainList') {
    if (!Array.isArray(value) || value.length === 0 || value.length > LIMITS.maxDomainList) {
      issues.push({ code: 'BAD_VALUE', message: `域名列表必须包含 1–${LIMITS.maxDomainList} 项` });
      return;
    }
    if (
      value.some((item) => typeof item !== 'string' || item.length > LIMITS.maxStringLength || !normalizeDomain(item))
    ) {
      issues.push({ code: 'BAD_VALUE', message: '域名列表包含无效域名' });
    }
    return;
  }

  if (typeof value !== 'string' || value.length > LIMITS.maxStringLength) {
    issues.push({ code: 'BAD_VALUE', message: `文本长度不能超过 ${LIMITS.maxStringLength}` });
  }
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
      message: `策略名称需为 1–${LIMITS.strategyNameLength} 个字符`,
    });
  }
  return { ...result, valid: result.issues.length === 0 };
}
