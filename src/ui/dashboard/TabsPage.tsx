import { useEffect, useState } from 'preact/hooks';
import type { CleanupPreview, CleanupResult, TabListItem, TraceNode } from '../../shared/types';
import { messageOf, send } from '../api';
import { Banner } from '../components/Banner';
import { Button } from '../components/Button';
import { Spinner } from '../components/Spinner';
import { filterTabs } from './tabs-filter';

export function TabsPage() {
  const [items, setItems] = useState<TabListItem[]>([]);
  const [preview, setPreview] = useState<CleanupPreview | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [query, setQuery] = useState('');
  const [windowId, setWindowId] = useState<number | 'all'>('all');
  const [confirming, setConfirming] = useState(false);

  async function load() {
    try {
      const [nextItems, nextPreview] = await Promise.all([
        send<TabListItem[]>({ type: 'tabs.list' }),
        send<CleanupPreview>({ type: 'cleanup.preview', source: 'dashboard' }),
      ]);
      setItems(nextItems);
      setPreview(nextPreview);
      setError(null);
    } catch (error) {
      setError(messageOf(error));
    } finally {
      setLoading(false);
    }
  }

  useEffect(() => {
    void load();
    const reload = () => void load();
    chrome.tabs.onActivated.addListener(reload);
    chrome.tabs.onRemoved.addListener(reload);
    chrome.tabs.onUpdated.addListener(reload);
    return () => {
      chrome.tabs.onActivated.removeListener(reload);
      chrome.tabs.onRemoved.removeListener(reload);
      chrome.tabs.onUpdated.removeListener(reload);
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

  const visible = filterTabs(items, query, windowId);
  const windows = [...new Set(items.map((item) => item.facts.windowId))].sort((a, b) => a - b);

  return (
    <section class="page">
      <header class="page-head">
        <div>
          <h2>标签页</h2>
          <p class="muted">预览当前策略会关闭哪些标签；绿色标记表示命中。</p>
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
          placeholder="搜索标题、URL 或域名"
          value={query}
          onInput={(event) => setQuery((event.currentTarget as HTMLInputElement).value)}
        />
        <select
          class="input"
          value={windowId}
          onChange={(event) => {
            const value = (event.currentTarget as HTMLSelectElement).value;
            setWindowId(value === 'all' ? 'all' : Number(value));
          }}
        >
          <option value="all">全部窗口</option>
          {windows.map((id) => (
            <option key={id} value={id}>
              窗口 {id}
            </option>
          ))}
        </select>
        <span class="muted" data-testid="tabs-count">
          {visible.length} / {items.length}
        </span>
      </div>

      <div class="tab-list">
        {visible.map((item) => (
          <details key={item.facts.tabId} class="tab-row" data-testid={`tab-row-${item.facts.tabId}`}>
            <summary class="tab-summary">
              <span class={item.matched ? 'status-dot matched' : 'status-dot'} />
              <span class="tab-title">{item.facts.title || item.facts.url}</span>
              <span class="muted tab-domain">{item.facts.domain || '本地文件'}</span>
              <span class="muted tab-window">窗口 {item.facts.windowId}</span>
            </summary>
            <div class="tab-detail">
              <p class="tab-url">{item.facts.url}</p>
              <dl class="fact-grid">
                <div>
                  <dt>最后访问</dt>
                  <dd>{item.facts.lastActiveMinutes === null ? '未知' : `${item.facts.lastActiveMinutes} 分钟前`}</dd>
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
      <span>{node.fact}</span>
      <span class="muted">
        实际 {String(node.actual ?? '未知')} · 期望 {String(node.expected ?? '')}
      </span>
      <span>{node.result ? '命中' : node.reason === 'unknown' ? '未知' : '未命中'}</span>
    </div>
  );
}
