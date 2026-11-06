import { useState } from 'preact/hooks';
import { FACT_BY_KEY, isFactAvailable } from '../../core/rules/registry';
import { type ValidationIssue, validationMessage } from '../../core/rules/validate';
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
  issues?: ValidationIssue[];
};

const newId = () => crypto.randomUUID();

export function RuleEditor({ expression, capabilities, disabled, onChange, issues = [] }: RuleEditorProps) {
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
        issues={issues}
        depth={0}
      />
    </div>
  );
}

type NodeViewProps = Pick<RuleEditorProps, 'capabilities' | 'disabled' | 'onChange' | 'issues'> & {
  root: Expr;
  node: Expr;
  locale: Locale;
  depth: number;
  issues: ValidationIssue[];
};

const STRUCTURAL_ISSUES = new Set(['TOO_DEEP', 'TOO_MANY_NODES']);

function nodeIssuesFor(issues: ValidationIssue[], nodeId: string): ValidationIssue[] {
  return issues.filter((issue) => issue.nodeId === nodeId && !STRUCTURAL_ISSUES.has(issue.code));
}

function NodeView({ root, node, locale, capabilities, disabled, onChange, issues, depth }: NodeViewProps) {
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
        issues={issues}
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
        issues={issues}
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
  issues,
  depth,
}: NodeViewProps & { node: Extract<Expr, { type: 'all' | 'any' }>; negated: boolean }) {
  const nodeIssues = nodeIssuesFor(issues, node.id);
  const errorId = nodeIssues.length > 0 ? `rule-${node.id}-error` : undefined;
  const messages = nodeIssues.map((issue) => validationMessage(issue, locale));
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
    <fieldset class={`group-card depth-${Math.min(depth, 4)}`} aria-describedby={errorId}>
      <legend class="sr-only">{translate(locale, 'editor.group')}</legend>
      <div class="group-head">
        <Select
          id={`rule-${node.id}-group`}
          compact
          value={node.type}
          disabled={disabled}
          aria-label={translate(locale, 'editor.groupType')}
          aria-describedby={errorId}
          aria-invalid={nodeIssues.length > 0 ? 'true' : undefined}
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
            aria-describedby={errorId}
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

      {messages.length > 0 && (
        <span class="field-error group-error" id={errorId} role="alert">
          {messages.join('; ')}
        </span>
      )}

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
            issues={issues}
            depth={depth + 1}
          />
        ))}
      </div>

      <div class="group-actions">
        <button
          type="button"
          class="text-button add-button"
          disabled={disabled}
          onClick={() => onChange(addChild(root, node.id, newCondition(newId())))}
        >
          {translate(locale, 'editor.addCondition')}
        </button>
        <button
          type="button"
          class="text-button add-button"
          disabled={disabled}
          onClick={() => onChange(addChild(root, node.id, newGroup('any', newId(), newCondition(newId()))))}
        >
          {translate(locale, 'editor.addGroup')}
        </button>
      </div>
    </fieldset>
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
  issues,
  depth,
}: NodeViewProps & { node: Extract<Expr, { type: 'condition' }>; negated: boolean }) {
  const definition = FACT_BY_KEY.get(node.fact);
  const [unit, setUnit] = useState<'minutes' | 'hours' | 'days'>(() => bestUnit(Number(node.value ?? 0)));

  if (!definition) return null;
  const nodeIssues = nodeIssuesFor(issues, node.id);
  const errorId = nodeIssues.length > 0 ? `rule-${node.id}-error` : undefined;
  const messages = nodeIssues.map((issue) => validationMessage(issue, locale));
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
    <fieldset
      class={`condition-row ${unavailable ? 'unavailable' : ''}${isBoolean ? ' boolean' : ''}`}
      aria-describedby={errorId}
    >
      <legend class="sr-only">{translate(locale, 'editor.condition')}</legend>
      <label class="checkbox condition-negate">
        <input
          type="checkbox"
          checked={booleanNegated}
          disabled={disabled}
          aria-describedby={errorId}
          onChange={toggleNegation}
        />
        {translate(locale, 'editor.negate')}
      </label>

      <label class="condition-field condition-fact" for={`rule-${node.id}-fact`}>
        <span class="condition-label">{translate(locale, 'editor.fact')}</span>
        <Select
          id={`rule-${node.id}-fact`}
          compact
          class="fact-select"
          value={node.fact}
          disabled={disabled}
          aria-label={translate(locale, 'editor.fact')}
          aria-describedby={errorId}
          aria-invalid={nodeIssues.length > 0 ? 'true' : undefined}
          options={[...FACT_BY_KEY.values()].map((item) => ({
            value: item.key,
            label: `${factLabel(item.key, locale)}${isFactAvailable(item, capabilities) ? '' : translate(locale, 'editor.unavailable')}`,
            disabled: !isFactAvailable(item, capabilities),
          }))}
          onChange={(value) => changeFact(value as FactKey)}
        />
      </label>

      {!isBoolean && (
        <>
          <label class="condition-field condition-operator" for={`rule-${node.id}-operator`}>
            <span class="condition-label">{translate(locale, 'editor.operator')}</span>
            <Select
              id={`rule-${node.id}-operator`}
              compact
              value={node.op}
              disabled={disabled || unavailable}
              aria-label={translate(locale, 'editor.operator')}
              aria-describedby={errorId}
              aria-invalid={nodeIssues.length > 0 ? 'true' : undefined}
              options={definition.operators.map((operator) => ({
                value: operator,
                label: operatorLabel(operator, locale),
              }))}
              onChange={(value) => changeOperator(value as Operator)}
            />
          </label>

          {definition.type === 'number' ? (
            <div class="condition-field condition-value condition-value-number">
              <span class="condition-label">{translate(locale, 'editor.value')}</span>
              <span class="value-row">
                <input
                  id={`rule-${node.id}-value`}
                  class="input compact"
                  type="number"
                  min={0}
                  step={1}
                  value={Math.round(numberValue / factor)}
                  disabled={disabled}
                  aria-label={translate(locale, 'editor.value')}
                  aria-describedby={errorId}
                  aria-invalid={nodeIssues.length > 0 ? 'true' : undefined}
                  onInput={(event) =>
                    update({ value: Number((event.currentTarget as HTMLInputElement).value) * factor })
                  }
                />
                <Select
                  id={`rule-${node.id}-unit`}
                  compact
                  value={unit}
                  disabled={disabled}
                  aria-label={translate(locale, 'editor.unit')}
                  aria-describedby={errorId}
                  options={[
                    { value: 'minutes', label: translate(locale, 'editor.minutes') },
                    { value: 'hours', label: translate(locale, 'editor.hours') },
                    { value: 'days', label: translate(locale, 'editor.days') },
                  ]}
                  onChange={(value) => setUnit(value as typeof unit)}
                />
              </span>
            </div>
          ) : node.op === 'inDomainList' ? (
            <label class="condition-field condition-value" for={`rule-${node.id}-value`}>
              <span class="condition-label">{translate(locale, 'editor.value')}</span>
              <textarea
                id={`rule-${node.id}-value`}
                class="input domain-list"
                value={Array.isArray(node.value) ? node.value.join('\n') : ''}
                disabled={disabled}
                placeholder={translate(locale, 'editor.domainPlaceholder')}
                aria-label={translate(locale, 'editor.value')}
                aria-describedby={errorId}
                aria-invalid={nodeIssues.length > 0 ? 'true' : undefined}
                onInput={(event) =>
                  update({
                    value: (event.currentTarget as HTMLTextAreaElement).value
                      .split('\n')
                      .map((line) => line.trim())
                      .filter(Boolean),
                  })
                }
              />
            </label>
          ) : (
            <label class="condition-field condition-value" for={`rule-${node.id}-value`}>
              <span class="condition-label">{translate(locale, 'editor.value')}</span>
              <input
                id={`rule-${node.id}-value`}
                class="input grow"
                type="text"
                value={typeof node.value === 'string' ? node.value : ''}
                disabled={disabled}
                placeholder={definition.type === 'domain' ? 'example.com' : translate(locale, 'editor.text')}
                aria-label={translate(locale, 'editor.value')}
                aria-describedby={errorId}
                aria-invalid={nodeIssues.length > 0 ? 'true' : undefined}
                onInput={(event) => update({ value: (event.currentTarget as HTMLInputElement).value })}
              />
            </label>
          )}
        </>
      )}

      {unavailable && <span class="unavailable-note">{translate(locale, 'editor.unavailableNote')}</span>}
      {messages.length > 0 && (
        <span class="field-error condition-error" id={errorId} role="alert">
          {messages.join('; ')}
        </span>
      )}
      {depth > 0 && (
        <button
          type="button"
          class="text-button danger condition-delete"
          disabled={disabled}
          onClick={() => onChange(removeNode(root, node.id))}
        >
          {translate(locale, 'editor.delete')}
        </button>
      )}
    </fieldset>
  );
}

function bestUnit(value: number): 'minutes' | 'hours' | 'days' {
  if (value >= 1_440 && value % 1_440 === 0) return 'days';
  if (value >= 60 && value % 60 === 0) return 'hours';
  return 'minutes';
}
