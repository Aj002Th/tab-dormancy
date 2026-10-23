import { useEffect, useState } from 'preact/hooks';
import { cloneStrategy, createCustomStrategy } from '../../core/rules/presets';
import { canonicalExpr } from '../../core/rules/signature';
import { validateExpr } from '../../core/rules/validate';
import type { StrategyPreview } from '../../shared/messages';
import type { StateSnapshot, Strategy } from '../../shared/types';
import { ApiError, messageOf, send } from '../api';
import { Banner } from '../components/Banner';
import { Button } from '../components/Button';
import { newCondition, newGroup } from './expr-edit';
import { RuleEditor } from './RuleEditor';
import { expressionSummary } from './strategy-summary';

const newId = () => crypto.randomUUID();

export function StrategiesPage() {
  const [state, setState] = useState<StateSnapshot | null>(null);
  const [editing, setEditing] = useState<Strategy | null>(null);
  const [preview, setPreview] = useState<StrategyPreview | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [saving, setSaving] = useState(false);

  async function load() {
    try {
      const next = await send<StateSnapshot>({ type: 'state.get' });
      setState(next);
      setEditing((current) => {
        if (!current) return next.activeStrategy;
        if (!current.id) return current;
        return next.strategies.find((strategy) => strategy.id === current.id) ?? next.activeStrategy;
      });
      setError(null);
    } catch (error) {
      setError(messageOf(error));
    }
  }

  useEffect(() => {
    void load();
  }, []);

  useEffect(() => {
    if (!editing || editing.builtin) return;
    let cancelled = false;
    const timer = setTimeout(() => {
      void send<StrategyPreview>({ type: 'strategy.preview', strategy: editing })
        .then((next) => {
          if (cancelled) return;
          setPreview(next);
          setError(null);
        })
        .catch((error: unknown) => {
          if (cancelled) return;
          setPreview(null);
          setError(error instanceof ApiError && error.code === 'INVALID_EXPRESSION' ? null : messageOf(error));
        });
    }, 250);
    return () => {
      cancelled = true;
      clearTimeout(timer);
    };
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

  const selectStrategy = (strategy: Strategy) => {
    if (editing?.id === strategy.id) return;
    setEditing(strategy);
    setPreview(null);
    setError(null);
  };

  const cancelDraft = () => {
    setEditing(state?.activeStrategy ?? null);
    setPreview(null);
    setError(null);
  };

  const save = async () => {
    if (!editing) return;
    setSaving(true);
    setError(null);
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
    setError(null);
    try {
      await send({ type: 'strategy.activate', id });
      await load();
    } catch (error) {
      setError(messageOf(error));
    }
  };

  const saveAndActivate = async () => {
    if (!editing) return;
    setSaving(true);
    setError(null);
    try {
      const saved = await send<Strategy>({
        type: 'strategy.save',
        strategy: editing,
        previewSignature: preview?.signature,
      });
      await send({ type: 'strategy.activate', id: saved.id });
      setEditing(saved);
      setPreview(null);
      await load();
    } catch (error) {
      setError(messageOf(error));
    } finally {
      setSaving(false);
    }
  };

  const remove = async (id: string) => {
    setError(null);
    try {
      await send({ type: 'strategy.delete', id });
      await load();
    } catch (error) {
      setError(messageOf(error));
    }
  };

  const validation = editing && state ? validateExpr(editing.expression, state.capabilities) : null;
  const strategies = state?.strategies ?? [];
  const visibleStrategies = editing && !editing.id ? [...strategies, editing] : strategies;
  const persistedEditing = editing ? strategies.find((strategy) => strategy.id === editing.id) : undefined;
  const activeUnchanged =
    editing !== null &&
    state !== null &&
    persistedEditing !== undefined &&
    editing.id === state.activeStrategy.id &&
    editing.name.trim() === persistedEditing.name &&
    canonicalExpr(editing.expression) === canonicalExpr(persistedEditing.expression);

  return (
    <section class="page">
      <header class="page-head">
        <div>
          <h2>策略</h2>
          <p class="muted">点击左侧策略卡片查看和编辑规则；内置策略不可修改，自定义策略必须先预览才能启用自动清理。</p>
        </div>
        <Button variant="primary" onClick={startNew} data-testid="new-strategy">
          新建策略
        </Button>
      </header>

      {error && <Banner tone="error">{error}</Banner>}

      <div class="strategy-layout">
        <div class="strategy-list">
          {visibleStrategies.map((strategy) => {
            const draft = !strategy.id;
            const active = state?.activeStrategy.id === strategy.id;
            const selected = editing?.id === strategy.id;
            const title = draft ? strategy.name.trim() || '未命名策略' : strategy.name;
            return (
              <div
                class={`strategy-card${selected ? ' selected' : ''}${draft ? ' draft' : ''}`}
                key={draft ? 'draft' : strategy.id}
                data-testid={draft ? 'strategy-card-draft' : `strategy-card-${strategy.id}`}
              >
                {!draft && (
                  <button
                    type="button"
                    class="strategy-card-hitbox"
                    aria-pressed={selected}
                    aria-label={`选择策略 ${strategy.name}`}
                    onClick={() => selectStrategy(strategy)}
                  />
                )}
                <div class="strategy-card-content">
                  <div class="strategy-card-head">
                    <strong>{title}</strong>
                    {strategy.builtin && <span class="badge">内置</span>}
                    {draft && <span class="badge draft">草稿</span>}
                  </div>
                  <p class="muted small">{expressionSummary(strategy.expression)}</p>
                  {!draft && (
                    <div class="row strategy-card-actions">
                      <Button
                        class={active ? 'btn-active' : ''}
                        disabled={active}
                        onClick={active ? undefined : () => void activate(strategy.id)}
                        data-testid={`strategy-activate-${strategy.id}`}
                      >
                        {active ? '启用中' : '启用'}
                      </Button>
                      <Button onClick={() => duplicate(strategy)} data-testid={`strategy-duplicate-${strategy.id}`}>
                        复制
                      </Button>
                      {!strategy.builtin && !active && (
                        <Button
                          variant="danger"
                          onClick={() => void remove(strategy.id)}
                          data-testid={`strategy-delete-${strategy.id}`}
                        >
                          删除
                        </Button>
                      )}
                    </div>
                  )}
                </div>
              </div>
            );
          })}
        </div>

        {editing && state ? (
          <div class="editor-panel">
            <div class="editor-head">
              <input
                class="input"
                value={editing.name}
                disabled={editing.builtin}
                onInput={(event) => {
                  setError(null);
                  setEditing({ ...editing, name: (event.currentTarget as HTMLInputElement).value });
                }}
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
                setError(null);
                setEditing({ ...editing, expression });
                setPreview(null);
              }}
            />

            <div class="editor-foot">
              {validation && !validation.valid && validation.issues[0] && (
                <Banner tone="error">{validation.issues[0].message}</Banner>
              )}
              {preview && (
                <div class="preview-status" data-testid="rule-preview-count">
                  <button type="button" class="preview-trigger" aria-describedby="strategy-preview-sample">
                    预览：将关闭 {preview.matched} 个标签（共 {preview.totalManagedTabs} 个可管理标签）
                  </button>
                  <div
                    class="preview-sample"
                    id="strategy-preview-sample"
                    role="tooltip"
                    data-testid="rule-preview-sample"
                  >
                    <strong>命中示例</strong>
                    {preview.sample.length > 0 ? (
                      <ul class="preview-sample-list">
                        {preview.sample.map((tab) => (
                          <li key={tab.tabId}>
                            <span class="preview-sample-title">{tab.title.trim() || tab.url}</span>
                            <span class="preview-sample-url">{tab.url}</span>
                          </li>
                        ))}
                      </ul>
                    ) : (
                      <p class="preview-sample-note">当前没有命中的标签。</p>
                    )}
                    {preview.matched > preview.sample.length && (
                      <p class="preview-sample-note">仅展示前 {preview.sample.length} 条。</p>
                    )}
                  </div>
                </div>
              )}
              {!editing.builtin && (
                <div class="row">
                  <Button
                    variant="primary"
                    disabled={saving || activeUnchanged || !validation?.valid}
                    onClick={() => void save()}
                    data-testid="save-strategy"
                  >
                    {saving ? '保存中…' : '保存'}
                  </Button>
                  <Button
                    disabled={saving || activeUnchanged || !preview || !validation?.valid}
                    onClick={() => void saveAndActivate()}
                    data-testid="activate-strategy"
                  >
                    保存并启用
                  </Button>
                  {!editing.id && (
                    <Button disabled={saving} onClick={cancelDraft} data-testid="cancel-strategy">
                      取消创建
                    </Button>
                  )}
                </div>
              )}
            </div>
          </div>
        ) : (
          <div class="editor-panel editor-placeholder">
            <p class="muted">从左侧选择一个策略查看规则。</p>
          </div>
        )}
      </div>
    </section>
  );
}
