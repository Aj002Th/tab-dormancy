import { useEffect, useState } from 'preact/hooks';
import { formatRelativeTime } from '../../shared/time';
import type { HistoryQuery, HistoryQueryResult, RestoreOptions, RestoreResult, Trigger } from '../../shared/types';
import { messageOf, send } from '../api';
import { Banner } from '../components/Banner';
import { Button } from '../components/Button';
import { Spinner } from '../components/Spinner';
import { toggleSelection } from './history-selection';

const PAGE_SIZE = 50;

export function HistoryPage() {
  const [query, setQuery] = useState('');
  const [trigger, setTrigger] = useState<Trigger | 'all'>('all');
  const [restored, setRestored] = useState<'all' | 'yes' | 'no'>('all');
  const [page, setPage] = useState(1);
  const [result, setResult] = useState<HistoryQueryResult | null>(null);
  const [selected, setSelected] = useState<Set<string>>(new Set());
  const [mode, setMode] = useState<RestoreOptions['mode']>('current-window');
  const [complete, setComplete] = useState(false);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [notice, setNotice] = useState<string | null>(null);
  const [failures, setFailures] = useState<RestoreResult['failed']>([]);

  async function load() {
    setLoading(true);
    try {
      const request: HistoryQuery = { page, pageSize: PAGE_SIZE };
      if (query.trim()) request.query = query.trim();
      if (trigger !== 'all') request.trigger = trigger;
      if (restored !== 'all') request.restored = restored === 'yes';
      const next = await send<HistoryQueryResult>({ type: 'history.query', query: request });
      setResult(next);
      setSelected((current) => new Set([...current].filter((id) => next.items.some((item) => item.id === id))));
      setError(null);
    } catch (error) {
      setError(messageOf(error));
    } finally {
      setLoading(false);
    }
  }

  useEffect(() => {
    const timer = setTimeout(() => void load(), 200);
    return () => clearTimeout(timer);
  }, [query, trigger, restored, page]);

  async function restore() {
    if (selected.size === 0) return;
    try {
      const response = await send<RestoreResult>({
        type: 'history.restore',
        ids: [...selected],
        options: { mode, complete },
      });
      setFailures(response.failed);
      setNotice(
        response.failed.length > 0
          ? `已恢复 ${response.restored} 个标签，${response.failed.length} 个失败`
          : `已恢复 ${response.restored} 个标签`,
      );
      setSelected(new Set());
      await load();
    } catch (error) {
      setError(messageOf(error));
    }
  }

  async function remove() {
    if (selected.size === 0) return;
    if (!window.confirm(`删除 ${selected.size} 条历史记录？`)) return;
    try {
      await send({ type: 'history.delete', ids: [...selected] });
      setSelected(new Set());
      await load();
    } catch (error) {
      setError(messageOf(error));
    }
  }

  async function clear() {
    if (!window.confirm('清空全部关闭历史？此操作不可撤销。')) return;
    try {
      await send({ type: 'history.clear' });
      setSelected(new Set());
      await load();
    } catch (error) {
      setError(messageOf(error));
    }
  }

  const items = result?.items ?? [];
  const totalPages = result ? Math.max(1, Math.ceil(result.total / PAGE_SIZE)) : 1;

  return (
    <section class="page">
      <header class="page-head">
        <div>
          <h2>关闭历史</h2>
          <p class="muted">默认保留 30 天或 5000 条。恢复不会删除记录。</p>
        </div>
        <span class="muted" data-testid="history-total">
          共 {result?.total ?? 0} 条
        </span>
      </header>

      {error && <Banner tone="error">{error}</Banner>}
      {notice && <Banner>{notice}</Banner>}
      {failures.length > 0 && (
        <Banner tone="error">
          <div>以下标签恢复失败：</div>
          <ul class="restore-failures">
            {failures.map((failure) => (
              <li key={failure.id}>
                {failure.url}：{failure.reason}
              </li>
            ))}
          </ul>
        </Banner>
      )}

      <div class="toolbar">
        <input
          class="input"
          type="search"
          placeholder="搜索标题、URL 或域名"
          value={query}
          data-testid="history-search"
          onInput={(event) => {
            setQuery((event.currentTarget as HTMLInputElement).value);
            setPage(1);
          }}
        />
        <select
          class="input"
          value={trigger}
          onChange={(event) => {
            setTrigger((event.currentTarget as HTMLSelectElement).value as Trigger | 'all');
            setPage(1);
          }}
        >
          <option value="all">全部触发方式</option>
          <option value="idle">空闲</option>
          <option value="locked">锁屏</option>
          <option value="manual">手动</option>
        </select>
        <select
          class="input"
          value={restored}
          onChange={(event) => {
            setRestored((event.currentTarget as HTMLSelectElement).value as 'all' | 'yes' | 'no');
            setPage(1);
          }}
        >
          <option value="all">全部状态</option>
          <option value="no">未恢复</option>
          <option value="yes">已恢复</option>
        </select>
      </div>

      <div class="history-actions">
        <select
          class="input"
          value={mode}
          data-testid="history-restore-mode"
          onChange={(event) => setMode((event.currentTarget as HTMLSelectElement).value as RestoreOptions['mode'])}
        >
          <option value="current-window">恢复到当前窗口</option>
          <option value="original-window-groups">按原窗口分组新建</option>
        </select>
        <label class="checkbox">
          <input
            type="checkbox"
            checked={complete}
            data-testid="history-complete"
            onChange={(event) => setComplete((event.currentTarget as HTMLInputElement).checked)}
          />
          尝试完整恢复
        </label>
        <span class="grow" />
        <Button disabled={selected.size === 0} onClick={() => void restore()} data-testid="history-restore">
          恢复所选
        </Button>
        <Button
          variant="danger"
          disabled={selected.size === 0}
          onClick={() => void remove()}
          data-testid="history-delete"
        >
          删除所选
        </Button>
        <Button variant="danger" onClick={() => void clear()} data-testid="history-clear">
          清空
        </Button>
      </div>

      {loading && <Spinner />}
      <div class="history-list">
        {items.map((item) => (
          <div class="history-row" data-testid={`history-row-${item.id}`} key={item.id}>
            <input
              type="checkbox"
              checked={selected.has(item.id)}
              data-testid={`history-select-${item.id}`}
              onChange={(event) =>
                setSelected((current) =>
                  toggleSelection(current, item.id, (event.currentTarget as HTMLInputElement).checked),
                )
              }
              aria-label={`选择 ${item.title}`}
            />
            <div class="history-main">
              <div class="history-title">{item.title || item.url}</div>
              <div class="muted small history-url">{item.url}</div>
            </div>
            <div class="history-meta">
              <span>{item.domain || '本地文件'}</span>
              <span>{formatRelativeTime(Date.now(), item.closedAt)}</span>
              <span>{triggerLabel(item.trigger)}</span>
              <span>{item.restoredAt === null ? '未恢复' : '已恢复'}</span>
            </div>
          </div>
        ))}
        {!loading && items.length === 0 && <p class="muted empty">没有关闭历史。</p>}
      </div>

      <div class="pager">
        <Button disabled={page <= 1} onClick={() => setPage((value) => Math.max(1, value - 1))}>
          上一页
        </Button>
        <span class="muted">
          第 {page} / {totalPages} 页
        </span>
        <Button disabled={page >= totalPages} onClick={() => setPage((value) => value + 1)}>
          下一页
        </Button>
      </div>
    </section>
  );
}

function triggerLabel(trigger: Trigger): string {
  return trigger === 'idle' ? '空闲' : trigger === 'locked' ? '锁屏' : '手动';
}
