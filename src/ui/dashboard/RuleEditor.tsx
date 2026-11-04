import { useState } from 'preact/hooks';
import { FACT_BY_KEY, isFactAvailable } from '../../core/rules/registry';
import { factLabel, translate } from '../../shared/i18n';
import type { Capabilities, Expr, FactKey, Locale, Operator } from '../../shared/types';
import { Select } from '../components/Select';
import { useLocale } from '../i18n';
import {
  addChild,
  defaultOperator,
  defaultValue,
  effectiveBooleanNegated,
  newCondition,
  newGroup,
  operatorLabel,
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
  const locale = useLocale();
  return (
    <div class="rule-editor" data-testid="rule-editor">
      <NodeView
        root={expression}
        node={expression}
        locale={locale}
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
  locale: Locale;
  depth: number;
};

function NodeView({ root, node, locale, capabilities, disabled, onChange, depth }: NodeViewProps) {
  const { inner, negated } = unwrapNot(node);
  if (inner.type === 'condition') {
    return (
      <ConditionRow
        root={root}
        node={inner}
        locale={locale}
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
        locale={locale}
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
  locale,
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
        <Select
          compact
          value={node.type}
          disabled={disabled}
          aria-label={translate(locale, 'editor.groupType')}
          options={[
            { value: 'all', label: translate(locale, 'editor.matchAll') },
            { value: 'any', label: translate(locale, 'editor.matchAny') },
          ]}
          onChange={toggleType}
        />
        <label class="checkbox">
          <input
            type="checkbox"
            checked={negated}
            disabled={disabled}
            onChange={() => onChange(toggleNot(root, node.id, newId))}
          />
          {translate(locale, 'editor.negate')}
        </label>
        <span class="grow" />
        {depth > 0 && (
          <button
            type="button"
            class="text-button danger"
            disabled={disabled}
            onClick={() => onChange(removeNode(root, node.id))}
          >
            {translate(locale, 'editor.deleteGroup')}
          </button>
        )}
      </div>

      <div class="group-children">
        {node.children.map((child) => (
          <NodeView
            key={child.id}
            root={root}
            node={child}
            locale={locale}
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
          {translate(locale, 'editor.addCondition')}
        </button>
        <button
          type="button"
          class="text-button"
          disabled={disabled}
          onClick={() => onChange(addChild(root, node.id, newGroup('any', newId(), newCondition(newId()))))}
        >
          {translate(locale, 'editor.addGroup')}
        </button>
      </div>
    </div>
  );
}

function ConditionRow({
  root,
  node,
  locale,
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
  const isBoolean = definition.type === 'boolean';
  const booleanNegated = effectiveBooleanNegated(node.value, negated);

  const update = (patch: Partial<Extract<Expr, { type: 'condition' }>>) => {
    onChange(
      replaceNode(root, node.id, (current) => (current.type === 'condition' ? { ...current, ...patch } : current)),
    );
  };

  const changeFact = (fact: FactKey) => {
    update({ fact, op: defaultOperator(fact), value: defaultValue(fact) });
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

  const toggleNegation = () => {
    if (isBoolean) {
      const next = !booleanNegated;
      update({ value: next === negated });
      return;
    }
    onChange(toggleNot(root, node.id, newId));
  };

  const factor = unit === 'days' ? 1_440 : unit === 'hours' ? 60 : 1;
  const numberValue = typeof node.value === 'number' ? node.value : 0;

  return (
    <div class={`condition-row ${unavailable ? 'unavailable' : ''}`}>
      <label class="checkbox">
        <input type="checkbox" checked={booleanNegated} disabled={disabled} onChange={toggleNegation} />
        {translate(locale, 'editor.negate')}
      </label>

      <Select
        compact
        class="fact-select"
        value={node.fact}
        disabled={disabled}
        options={[...FACT_BY_KEY.values()].map((item) => ({
          value: item.key,
          label: `${factLabel(item.key, locale)}${isFactAvailable(item, capabilities) ? '' : translate(locale, 'editor.unavailable')}`,
          disabled: !isFactAvailable(item, capabilities),
        }))}
        onChange={(value) => changeFact(value as FactKey)}
      />

      {!isBoolean && (
        <>
          <Select
            compact
            value={node.op}
            disabled={disabled || unavailable}
            options={definition.operators.map((operator) => ({
              value: operator,
              label: operatorLabel(operator, locale),
            }))}
            onChange={(value) => changeOperator(value as Operator)}
          />

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
              <Select
                compact
                value={unit}
                disabled={disabled}
                options={[
                  { value: 'minutes', label: translate(locale, 'editor.minutes') },
                  { value: 'hours', label: translate(locale, 'editor.hours') },
                  { value: 'days', label: translate(locale, 'editor.days') },
                ]}
                onChange={(value) => setUnit(value as typeof unit)}
              />
            </span>
          ) : node.op === 'inDomainList' ? (
            <textarea
              class="input domain-list"
              value={Array.isArray(node.value) ? node.value.join('\n') : ''}
              disabled={disabled}
              placeholder={translate(locale, 'editor.domainPlaceholder')}
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
              placeholder={definition.type === 'domain' ? 'example.com' : translate(locale, 'editor.text')}
              onInput={(event) => update({ value: (event.currentTarget as HTMLInputElement).value })}
            />
          )}
        </>
      )}

      {unavailable && <span class="unavailable-note">{translate(locale, 'editor.unavailableNote')}</span>}
      {depth > 0 && (
        <button
          type="button"
          class="text-button danger"
          disabled={disabled}
          onClick={() => onChange(removeNode(root, node.id))}
        >
          {translate(locale, 'editor.delete')}
        </button>
      )}
    </div>
  );
}

function bestUnit(value: number): 'minutes' | 'hours' | 'days' {
  if (value >= 1_440 && value % 1_440 === 0) return 'days';
  if (value >= 60 && value % 60 === 0) return 'hours';
  return 'minutes';
}
