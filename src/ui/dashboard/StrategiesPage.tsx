import { useEffect, useState } from 'preact/hooks';
import { cloneStrategy, createCustomStrategy } from '../../core/rules/presets';
import { validateExpr } from '../../core/rules/validate';
import type { StrategyPreview } from '../../shared/messages';
import type { Expr, StateSnapshot, Strategy } from '../../shared/types';
import { messageOf, send } from '../api';
import { Banner } from '../components/Banner';
import { Button } from '../components/Button';
import { newCondition, newGroup } from './expr-edit';
import { RuleEditor } from './RuleEditor';

const newId = () => crypto.randomUUID();

export function StrategiesPage() {
  const [state, setState] = useState<StateSnapshot | null>(null);
  const [editing, setEditing] = useState<Strategy | null>(null);
  const [preview, setPreview] = useState<StrategyPreview | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [saving, setSaving] = useState(false);

  async function load() {
    try {
      setState(await send<StateSnapshot>({ type: 'state.get' }));
    } catch (error) {
      setError(messageOf(error));
    }
  }

  useEffect(() => {
    void load();
  }, []);

  useEffect(() => {
    if (!editing || editing.builtin) return;
    const timer = setTimeout(() => {
      void send<StrategyPreview>({ type: 'strategy.preview', strategy: editing })
        .then((next) => setPreview(next))
        .catch((error) => {
          setPreview(null);
          setError(messageOf(error));
        });
    }, 250);
    return () => clearTimeout(timer);
  }, [editing]);

  const startNew = () => {
    const expression = newGroup('all', newId(), newCondition(newId()));
    setEditing(createCustomStrategy('新策略', expression, Date.now(), ''));
    setPreview(null);
    setError(null);
  };

  const duplicate = (strategy: Strategy) => {
    setEditing(cloneStrategy(strategy, Date.now(), ''));
    setPreview(null);
    setError(null);
  };

  const save = async () => {
    if (!editing) return;
    setSaving(true);
    try {
      const saved = await send<Strategy>({
        type: 'strategy.save',
        strategy: editing,
        previewSignature: preview?.signature,
      });
      setEditing(saved);
      setPreview(null);
      await load();
    } catch (error) {
      setError(messageOf(error));
    } finally {
      setSaving(false);
    }
  };

  const activate = async (id: string) => {
    try {
      await send({ type: 'strategy.activate', id });
      await load();
    } catch (error) {
      setError(messageOf(error));
    }
  };

  const remove = async (id: string) => {
    try {
      await send({ type: 'strategy.delete', id });
      await load();
    } catch (error) {
      setError(messageOf(error));
    }
  };

  const validation = editing && state ? validateExpr(editing.expression, state.capabilities) : null;

  return (
    <section class="page">
      <header class="page-head">
        <div>
          <h2>策略</h2>
          <p class="muted">内置策略不可修改；自定义策略必须先预览，才能启用自动清理。</p>
        </div>
        <Button variant="primary" onClick={startNew} data-testid="new-strategy">
          新建策略
        </Button>
      </header>

      {error && <Banner tone="error">{error}</Banner>}

      <div class="strategy-layout">
        <div class="strategy-list">
          {state?.strategies.map((strategy) => (
            <article class="strategy-card" key={strategy.id} data-testid={`strategy-card-${strategy.id}`}>
              <div class="strategy-card-head">
                <strong>{strategy.name}</strong>
                {strategy.builtin && <span class="badge">内置</span>}
                {state.activeStrategy.id === strategy.id && <span class="badge active">启用中</span>}
              </div>
              <p class="muted small">{expressionSummary(strategy.expression)}</p>
              <div class="row">
                <Button onClick={() => void activate(strategy.id)} data-testid={`strategy-activate-${strategy.id}`}>
                  启用
                </Button>
                <Button onClick={() => duplicate(strategy)} data-testid={`strategy-duplicate-${strategy.id}`}>
                  复制
                </Button>
                <Button onClick={() => setEditing(strategy)} data-testid={`strategy-edit-${strategy.id}`}>
                  编辑
                </Button>
                {!strategy.builtin && state.activeStrategy.id !== strategy.id && (
                  <Button
                    variant="danger"
                    onClick={() => void remove(strategy.id)}
                    data-testid={`strategy-delete-${strategy.id}`}
                  >
                    删除
                  </Button>
                )}
              </div>
            </article>
          ))}
        </div>

        {editing && state && (
          <div class="editor-panel">
            <div class="editor-head">
              <input
                class="input"
                value={editing.name}
                disabled={editing.builtin}
                onInput={(event) => setEditing({ ...editing, name: (event.currentTarget as HTMLInputElement).value })}
                aria-label="策略名称"
              />
              <span class="grow" />
              {editing.builtin && <span class="badge">只读</span>}
            </div>

            <RuleEditor
              expression={editing.expression}
              capabilities={state.capabilities}
              disabled={editing.builtin}
              onChange={(expression) => {
                setEditing({ ...editing, expression });
                setPreview(null);
              }}
            />

            <div class="editor-foot">
              {validation && !validation.valid && <Banner tone="error">{validation.issues[0]?.message}</Banner>}
              {preview && (
                <p class="muted" data-testid="rule-preview-count">
                  预览：将关闭 {preview.matched} 个标签（共 {preview.totalManagedTabs} 个可管理标签）
                </p>
              )}
              <div class="row">
                <Button
                  variant="primary"
                  disabled={saving || editing.builtin || !validation?.valid}
                  onClick={() => void save()}
                  data-testid="save-strategy"
                >
                  {saving ? '保存中…' : '保存'}
                </Button>
                {editing.id && !editing.builtin && (
                  <Button disabled={!preview} onClick={() => void activate(editing.id)} data-testid="activate-strategy">
                    保存并启用
                  </Button>
                )}
                <Button onClick={() => setEditing(null)}>关闭</Button>
              </div>
            </div>
          </div>
        )}
      </div>
    </section>
  );
}

function expressionSummary(expression: Expr): string {
  if (expression.type === 'condition') {
    const definition = FACT_BY_KEY_LABEL(expression.fact);
    return `${definition} ${expression.op} ${String(expression.value ?? '')}`;
  }
  if (expression.type === 'not') return `非（${expressionSummary(expression.child)}）`;
  return expression.children.map(expressionSummary).join(expression.type === 'all' ? ' 且 ' : ' 或 ');
}

function FACT_BY_KEY_LABEL(fact: string): string {
  return (
    (
      {
        lastActiveMinutes: '距最后访问',
        totalTabCount: '总标签数',
        windowTabCount: '窗口标签数',
        pinned: '已固定',
        audible: '有声',
        active: '当前激活',
        muted: '已静音',
        discarded: '已丢弃',
        frozen: '已冻结',
        grouped: '在标签组中',
        groupCollapsed: '组已折叠',
        windowFocused: '窗口有焦点',
        onlyTabInWindow: '窗口唯一标签',
        domain: '域名',
        url: 'URL',
        title: '标题',
        groupTitle: '标签组名称',
      } as Record<string, string>
    )[fact] ?? fact
  );
}
