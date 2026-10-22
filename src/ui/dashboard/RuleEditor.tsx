import { useState } from 'preact/hooks';
import { FACT_BY_KEY, isFactAvailable } from '../../core/rules/registry';
import type { Capabilities, Expr, FactKey, Operator } from '../../shared/types';
import {
  addChild,
  defaultValue,
  newCondition,
  newGroup,
  removeNode,
  replaceNode,
  toggleNot,
  unwrapNot,
} from './expr-edit';

type RuleEditorProps = {
  expression: Expr;
  capabilities: Capabilities;
  disabled?: boolean;
  onChange: (expression: Expr) => void;
};

const newId = () => crypto.randomUUID();

export function RuleEditor({ expression, capabilities, disabled, onChange }: RuleEditorProps) {
  return (
    <div class="rule-editor" data-testid="rule-editor">
      <NodeView
        root={expression}
        node={expression}
        capabilities={capabilities}
        disabled={disabled}
        onChange={onChange}
        depth={0}
      />
    </div>
  );
}

type NodeViewProps = Pick<RuleEditorProps, 'capabilities' | 'disabled' | 'onChange'> & {
  root: Expr;
  node: Expr;
  depth: number;
};

function NodeView({ root, node, capabilities, disabled, onChange, depth }: NodeViewProps) {
  const { inner, negated } = unwrapNot(node);
  if (inner.type === 'condition') {
    return (
      <ConditionRow
        root={root}
        node={inner}
        negated={negated}
        capabilities={capabilities}
        disabled={disabled}
        onChange={onChange}
        depth={depth}
      />
    );
  }
  if (inner.type === 'all' || inner.type === 'any') {
    return (
      <GroupCard
        root={root}
        node={inner}
        negated={negated}
        capabilities={capabilities}
        disabled={disabled}
        onChange={onChange}
        depth={depth}
      />
    );
  }
  return null;
}

function GroupCard({
  root,
  node,
  negated,
  capabilities,
  disabled,
  onChange,
  depth,
}: NodeViewProps & { node: Extract<Expr, { type: 'all' | 'any' }>; negated: boolean }) {
  const toggleType = () => {
    onChange(
      replaceNode(root, node.id, (current) =>
        current.type === 'all' || current.type === 'any'
          ? { ...current, type: current.type === 'all' ? 'any' : 'all' }
          : current,
      ),
    );
  };

  return (
    <div class={`group-card depth-${Math.min(depth, 4)}`}>
      <div class="group-head">
        <select
          class="input compact"
          value={node.type}
          disabled={disabled}
          onChange={toggleType}
          aria-label="规则组类型"
        >
          <option value="all">全部满足 (AND)</option>
          <option value="any">任一满足 (OR)</option>
        </select>
        <label class="checkbox">
          <input
            type="checkbox"
            checked={negated}
            disabled={disabled}
            onChange={() => onChange(toggleNot(root, node.id, newId))}
          />
          取反
        </label>
        <span class="grow" />
        {depth > 0 && (
          <button
            type="button"
            class="text-button danger"
            disabled={disabled}
            onClick={() => onChange(removeNode(root, node.id))}
          >
            删除组
          </button>
        )}
      </div>

      <div class="group-children">
        {node.children.map((child) => (
          <NodeView
            key={child.id}
            root={root}
            node={child}
            capabilities={capabilities}
            disabled={disabled}
            onChange={onChange}
            depth={depth + 1}
          />
        ))}
      </div>

      <div class="group-actions">
        <button
          type="button"
          class="text-button"
          disabled={disabled}
          onClick={() => onChange(addChild(root, node.id, newCondition(newId())))}
        >
          + 条件
        </button>
        <button
          type="button"
          class="text-button"
          disabled={disabled}
          onClick={() => onChange(addChild(root, node.id, newGroup('any', newId(), newCondition(newId()))))}
        >
          + 子组
        </button>
      </div>
    </div>
  );
}

function ConditionRow({
  root,
  node,
  negated,
  capabilities,
  disabled,
  onChange,
  depth,
}: NodeViewProps & { node: Extract<Expr, { type: 'condition' }>; negated: boolean }) {
  const definition = FACT_BY_KEY.get(node.fact);
  const [unit, setUnit] = useState<'minutes' | 'hours' | 'days'>(() => bestUnit(Number(node.value ?? 0)));

  if (!definition) return null;
  const unavailable = !isFactAvailable(definition, capabilities);

  const update = (patch: Partial<Extract<Expr, { type: 'condition' }>>) => {
    onChange(
      replaceNode(root, node.id, (current) => (current.type === 'condition' ? { ...current, ...patch } : current)),
    );
  };

  const changeFact = (fact: FactKey) => {
    update({ fact, op: defaultOperatorFor(fact), value: defaultValue(fact) });
  };

  const changeOperator = (op: Operator) => {
    if (op === 'inDomainList') {
      update({ op, value: [String(node.value ?? 'example.com')] });
    } else if (Array.isArray(node.value)) {
      update({ op, value: defaultValue(node.fact) });
    } else {
      update({ op });
    }
  };

  const factor = unit === 'days' ? 1_440 : unit === 'hours' ? 60 : 1;
  const numberValue = typeof node.value === 'number' ? node.value : 0;

  return (
    <div class={`condition-row ${unavailable ? 'unavailable' : ''}`}>
      <label class="checkbox">
        <input
          type="checkbox"
          checked={negated}
          disabled={disabled}
          onChange={() => onChange(toggleNot(root, node.id, newId))}
        />
        取反
      </label>

      <select
        class="input compact fact-select"
        value={node.fact}
        disabled={disabled}
        onChange={(event) => changeFact((event.currentTarget as HTMLSelectElement).value as FactKey)}
      >
        {[...FACT_BY_KEY.values()].map((item) => (
          <option key={item.key} value={item.key} disabled={!isFactAvailable(item, capabilities)}>
            {item.label}
            {!isFactAvailable(item, capabilities) ? '（不可用）' : ''}
          </option>
        ))}
      </select>

      <select
        class="input compact"
        value={node.op}
        disabled={disabled || unavailable}
        onChange={(event) => changeOperator((event.currentTarget as HTMLSelectElement).value as Operator)}
      >
        {definition.operators.map((operator) => (
          <option key={operator} value={operator}>
            {operatorLabel(operator)}
          </option>
        ))}
      </select>

      {definition.type === 'number' ? (
        <span class="value-row">
          <input
            class="input compact"
            type="number"
            min={0}
            step={1}
            value={Math.round(numberValue / factor)}
            disabled={disabled}
            onInput={(event) => update({ value: Number((event.currentTarget as HTMLInputElement).value) * factor })}
          />
          <select
            class="input compact"
            value={unit}
            disabled={disabled}
            onChange={(event) => setUnit((event.currentTarget as HTMLSelectElement).value as typeof unit)}
          >
            <option value="minutes">分钟</option>
            <option value="hours">小时</option>
            <option value="days">天</option>
          </select>
        </span>
      ) : definition.type === 'boolean' ? (
        <select
          class="input compact"
          value={String(node.value)}
          disabled={disabled}
          onChange={(event) => update({ value: (event.currentTarget as HTMLSelectElement).value === 'true' })}
        >
          <option value="true">是</option>
          <option value="false">否</option>
        </select>
      ) : node.op === 'inDomainList' ? (
        <textarea
          class="input domain-list"
          value={Array.isArray(node.value) ? node.value.join('\n') : ''}
          disabled={disabled}
          placeholder="每行一个域名，例如 google.com"
          onInput={(event) =>
            update({
              value: (event.currentTarget as HTMLTextAreaElement).value
                .split('\n')
                .map((line) => line.trim())
                .filter(Boolean),
            })
          }
        />
      ) : (
        <input
          class="input grow"
          type="text"
          value={typeof node.value === 'string' ? node.value : ''}
          disabled={disabled}
          placeholder={definition.type === 'domain' ? 'example.com' : '文本'}
          onInput={(event) => update({ value: (event.currentTarget as HTMLInputElement).value })}
        />
      )}

      {unavailable && <span class="unavailable-note">当前浏览器不可用</span>}
      {depth > 0 && (
        <button
          type="button"
          class="text-button danger"
          disabled={disabled}
          onClick={() => onChange(removeNode(root, node.id))}
        >
          删除
        </button>
      )}
    </div>
  );
}

function defaultOperatorFor(fact: FactKey): Operator {
  if (fact === 'domain') return 'matchesDomain';
  return FACT_BY_KEY.get(fact)?.operators[0] ?? 'is';
}

function bestUnit(value: number): 'minutes' | 'hours' | 'days' {
  if (value >= 1_440 && value % 1_440 === 0) return 'days';
  if (value >= 60 && value % 60 === 0) return 'hours';
  return 'minutes';
}

function operatorLabel(operator: Operator): string {
  const labels: Record<Operator, string> = {
    gt: '大于',
    gte: '大于等于',
    lt: '小于',
    lte: '小于等于',
    eq: '等于',
    neq: '不等于',
    is: '是',
    equals: '等于',
    contains: '包含',
    startsWith: '开头是',
    endsWith: '结尾是',
    matchesDomain: '匹配域名',
    inDomainList: '在域名列表中',
    matchesGlob: '匹配通配符',
  };
  return labels[operator];
}
