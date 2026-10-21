import type { Expr } from '../../shared/types';

function sortKeys(value: unknown): unknown {
  if (Array.isArray(value)) return value.map(sortKeys);
  if (value && typeof value === 'object') {
    const input = value as Record<string, unknown>;
    const output: Record<string, unknown> = {};
    for (const key of Object.keys(input).sort()) output[key] = sortKeys(input[key]);
    return output;
  }
  return value;
}

function stripIds(node: Expr): unknown {
  switch (node.type) {
    case 'all':
    case 'any':
      return { type: node.type, children: node.children.map(stripIds) };
    case 'not':
      return { type: 'not', child: stripIds(node.child) };
    case 'condition':
      return { type: 'condition', fact: node.fact, op: node.op, value: node.value ?? null };
  }
}

export function canonicalExpr(expr: Expr): string {
  return JSON.stringify(sortKeys(stripIds(expr)));
}

export async function signatureOf(expr: Expr): Promise<string> {
  const data = new TextEncoder().encode(canonicalExpr(expr));
  const digest = await crypto.subtle.digest('SHA-256', data);
  return [...new Uint8Array(digest)].map((byte) => byte.toString(16).padStart(2, '0')).join('');
}
