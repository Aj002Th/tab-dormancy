import { useEffect, useRef, useState } from 'preact/hooks';
import { formatMinutesAgo } from '../../shared/time';
import type { CleanupPreview, CleanupResult, TabListItem, TraceNode } from '../../shared/types';
import { messageOf, send } from '../api';
import { Banner } from '../components/Banner';
import { Button } from '../components/Button';
import { Spinner } from '../components/Spinner';
import { filterTabs } from './tabs-filter';
import { windowLabelFor, windowLabels, windowSelectionAvailable } from './tabs-window';
import { formatTraceExpected, formatTraceValue, traceFactLabel, traceResultLabel } from './trace-format';

export function TabsPage() {
  const [items, setItems] = useState<TabListItem[]>([]);
  const [preview, setPreview] = useState<CleanupPreview | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [query, setQuery] = useState('');
  const [windowId, setWindowId] = useState<number | 'all'>('all');
  const [confirming, setConfirming] = useState(false);
  const requestId = useRef(0);

  async function load() {
    const id = ++requestId.current;
    try {
      const [nextItems, nextPreview] = await Promise.all([
        send<TabListItem[]>({ type: 'tabs.list' }),
        send<CleanupPreview>({ type: 'cleanup.preview', source: 'dashboard' }),
      ]);
      if (id !== requestId.current) return;
      setItems(nextItems);
      setPreview(nextPreview);
      setWindowId((current) => (windowSelectionAvailable(current, windowLabels(nextItems)) ? current : 'all'));
      setError(null);
    } catch (error) {
      if (id !== requestId.current) return;
      setError(messageOf(error));
    } finally {
      if (id === requestId.current) setLoading(false);
    }
  }

  useEffect(() => {
    void load();

    let timer: ReturnType<typeof setTimeout> | undefined;
    const schedule = () => {
      if (timer !== undefined) clearTimeout(timer);
      timer = setTimeout(() => {
        timer = undefined;
        void load();
      }, 150);
    };

    chrome.tabs.onActivated.addListener(schedule);
    chrome.tabs.onCreated.addListener(schedule);
    chrome.tabs.onRemoved.addListener(schedule);
    chrome.tabs.onUpdated.addListener(schedule);
    chrome.windows.onFocusChanged.addListener(schedule);
    return () => {
      if (timer !== undefined) clearTimeout(timer);
      requestId.current += 1;
      chrome.tabs.onActivated.removeListener(schedule);
      chrome.tabs.onCreated.removeListener(schedule);
      chrome.tabs.onRemoved.removeListener(schedule);
      chrome.tabs.onUpdated.removeListener(schedule);
      chrome.windows.onFocusChanged.removeListener(schedule);
    };
  }, []);

  async function runCleanup() {
    setConfirming(false);
    try {
      await send<CleanupResult>({ type: 'cleanup.run', source: 'dashboard' });
      await load();
    } catch (error) {
      setError(messageOf(error));
    }
  }

  const labels = windowLabels(items);
  const showWindowLabels = labels.length > 1;
  const effectiveWindowId = windowSelectionAvailable(windowId, labels) ? windowId : 'all';
  const visible = filterTabs(items, query, effectiveWindowId);

  return (
    <section class="page">
      <header class="page-head">
        <div>
          <h2>标签页</h2>
          <p class="muted">
            当前策略：
            <strong data-testid="tabs-strategy">{preview?.strategyName ?? (loading ? '读取中…' : '未知')}</strong>
            {' · '}预览当前策略会关闭哪些标签；绿色“命中”标记表示将被关闭。
          </p>
        </div>
        <Button
          variant="primary"
          onClick={() => setConfirming(true)}
          disabled={(preview?.matched ?? 0) === 0}
          data-testid="dashboard-cleanup"
        >
          {preview ? `清理 ${preview.matched} 个` : '清理'}
        </Button>
      </header>

      {error && <Banner tone="error">{error}</Banner>}
      {loading && <Spinner />}
      {confirming && preview && (
        <div class="confirm-bar">
          <span>确认关闭 {preview.matched} 个标签？历史会保留，可随时恢复。</span>
          <div class="row">
            <Button variant="danger" onClick={() => void runCleanup()} data-testid="dashboard-confirm-cleanup">
              确认
            </Button>
            <Button onClick={() => setConfirming(false)}>取消</Button>
          </div>
        </div>
      )}

      <div class="toolbar">
        <input
          class="input"
          type="search"
          aria-label="搜索标签页"
          placeholder="搜索标题、URL 或域名"
          value={query}
          onInput={(event) => setQuery((event.currentTarget as HTMLInputElement).value)}
        />
        {showWindowLabels && (
          <select
            class="input"
            aria-label="按窗口筛选"
            data-testid="tabs-window-filter"
            value={effectiveWindowId}
            onChange={(event) => {
              const value = (event.currentTarget as HTMLSelectElement).value;
              setWindowId(value === 'all' ? 'all' : Number(value));
            }}
          >
            <option value="all">全部窗口</option>
            {labels.map((window) => (
              <option key={window.id} value={window.id}>
                {window.label}
              </option>
            ))}
          </select>
        )}
        <span class="muted" data-testid="tabs-count">
          {visible.length} / {items.length}
        </span>
      </div>

      <div class="tab-list">
        {visible.map((item) => (
          <details key={item.facts.tabId} class="tab-row" data-testid={`tab-row-${item.facts.tabId}`}>
            <summary class="tab-summary">
              <span class={item.matched ? 'tab-match matched' : 'tab-match'}>{item.matched ? '命中' : '保留'}</span>
              <span class="tab-title">{item.facts.title || item.facts.url}</span>
              <span class="muted tab-domain">{item.facts.domain || '本地文件'}</span>
              {showWindowLabels && <span class="muted tab-window">{windowLabelFor(item.facts.windowId, labels)}</span>}
            </summary>
            <div class="tab-detail">
              <p class="tab-url">{item.facts.url}</p>
              <dl class="fact-grid">
                <div>
                  <dt>最后访问</dt>
                  <dd>
                    {item.facts.lastActiveMinutes === null ? '未知' : formatMinutesAgo(item.facts.lastActiveMinutes)}
                  </dd>
                </div>
                <div>
                  <dt>固定 / 声音</dt>
                  <dd>
                    {item.facts.pinned ? '固定' : '未固定'} / {item.facts.audible ? '有声' : '无声'}
                  </dd>
                </div>
                <div>
                  <dt>标签组</dt>
                  <dd>{item.facts.grouped ? item.facts.groupTitle || '未命名组' : '未分组'}</dd>
                </div>
                <div>
                  <dt>窗口内标签</dt>
                  <dd>{item.facts.windowTabCount}</dd>
                </div>
              </dl>
              {item.trace.length > 0 && (
                <div class="trace">
                  <h4>规则判断</h4>
                  {item.trace.map((node) => (
                    <TraceRow key={node.nodeId} node={node} />
                  ))}
                </div>
              )}
            </div>
          </details>
        ))}
        {!loading && visible.length === 0 && <p class="muted empty">没有匹配的标签。</p>}
      </div>
    </section>
  );
}

function TraceRow({ node }: { node: TraceNode }) {
  if (!node.fact) return null;
  return (
    <div class={node.result ? 'trace-row pass' : 'trace-row'}>
      <span class="trace-fact">{traceFactLabel(node.fact)}</span>
      <span class="trace-compare">
        <span class="trace-value trace-actual">
          <span class="trace-key">实际</span>
          {formatTraceValue(node.fact, node.actual)}
        </span>
        <span class="trace-value trace-expected">
          <span class="trace-key">期望</span>
          {formatTraceExpected(node.fact, node.expected)}
        </span>
      </span>
      <span class="trace-result">{traceResultLabel(node)}</span>
    </div>
  );
}
