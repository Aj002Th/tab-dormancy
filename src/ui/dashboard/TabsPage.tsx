import { useEffect, useRef, useState } from 'preact/hooks';
import { t } from '../../shared/i18n';
import { formatMinutesAgo } from '../../shared/time';
import type { CleanupPreview, CleanupResult, Locale, TabListItem, TraceNode } from '../../shared/types';
import { messageOf, send } from '../api';
import { Banner } from '../components/Banner';
import { Button } from '../components/Button';
import { Select } from '../components/Select';
import { Spinner } from '../components/Spinner';
import { useLocale } from '../i18n';
import { strategyDisplayName } from './strategy-name';
import { filterTabs } from './tabs-filter';
import { windowLabelFor, windowLabels, windowSelectionAvailable } from './tabs-window';
import { formatTraceExpected, formatTraceValue, traceFactLabel, traceResultLabel } from './trace-format';

export function TabsPage() {
  const locale = useLocale();
  const [items, setItems] = useState<TabListItem[]>([]);
  const [preview, setPreview] = useState<CleanupPreview | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [query, setQuery] = useState('');
  const [windowId, setWindowId] = useState<number | 'all'>('all');
  const [confirming, setConfirming] = useState(false);
  const [cleaning, setCleaning] = useState(false);
  const [notice, setNotice] = useState<string | null>(null);
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
      }, 300);
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

  useEffect(() => {
    if (!confirming) return;
    requestAnimationFrame(() => document.getElementById('tabs-confirm-cleanup')?.focus());
  }, [confirming]);

  async function runCleanup() {
    setCleaning(true);
    setError(null);
    setNotice(null);
    try {
      const result = await send<CleanupResult>({ type: 'cleanup.run', source: 'dashboard' });
      await load();
      const parts = [t('popup.closedCount', { count: result.closed })];
      if (result.failed > 0) parts.push(t('popup.failed', { count: result.failed }));
      if (result.skipped > 0) parts.push(t('popup.skipped', { count: result.skipped }));
      setNotice(parts.join('; '));
    } catch (error) {
      setError(messageOf(error));
    } finally {
      setCleaning(false);
      setConfirming(false);
    }
  }

  const labels = windowLabels(items, locale);
  const showWindowLabels = labels.length > 1;
  const effectiveWindowId = windowSelectionAvailable(windowId, labels) ? windowId : 'all';
  const visible = filterTabs(items, query, effectiveWindowId);
  const hasFilters = query.trim() !== '' || effectiveWindowId !== 'all';
  const strategyName = preview
    ? strategyDisplayName({ id: preview.strategyId, name: preview.strategyName }, locale)
    : loading
      ? t('app.reading')
      : t('app.unknown');

  return (
    <section class="page">
      <header class="page-head">
        <div>
          <h2>{t('tabs.title')}</h2>
          <p class="muted tabs-subtitle">
            <span>
              {t('tabs.activeStrategy')}
              {locale === 'en' ? ' ' : ''}
              <strong data-testid="tabs-strategy">{strategyName}</strong>
            </span>
            <span class="tabs-description">{t('tabs.description')}</span>
          </p>
        </div>
        <Button
          variant="primary"
          onClick={() => {
            setNotice(null);
            setConfirming(true);
          }}
          disabled={cleaning || (preview?.matched ?? 0) === 0}
          data-testid="dashboard-cleanup"
        >
          {cleaning
            ? t('popup.cleaning')
            : preview
              ? t('tabs.cleanCount', { count: preview.matched })
              : t('tabs.clean')}
        </Button>
      </header>

      {error && <Banner tone="error">{error}</Banner>}
      {notice && (
        <output class="tabs-notice" aria-live="polite">
          {notice}
        </output>
      )}
      {loading && <Spinner />}
      {confirming && preview && (
        <div
          class="confirm-bar"
          role="alert"
          onKeyDown={(event) => {
            if (!cleaning && event.key === 'Escape') setConfirming(false);
          }}
        >
          {cleaning ? (
            <Spinner label={t('popup.cleaning')} />
          ) : (
            <>
              <span>{t('tabs.confirm', { count: preview.matched })}</span>
              <div class="row">
                <Button
                  id="tabs-confirm-cleanup"
                  variant="danger"
                  onClick={() => void runCleanup()}
                  data-testid="dashboard-confirm-cleanup"
                >
                  {t('common.confirm')}
                </Button>
                <Button onClick={() => setConfirming(false)}>{t('common.cancel')}</Button>
              </div>
            </>
          )}
        </div>
      )}

      <div class="toolbar">
        <label class="tabs-search-field" for="tabs-search">
          <span class="tabs-field-label">{t('tabs.searchLabel')}</span>
          <input
            id="tabs-search"
            class="input"
            type="search"
            aria-label={t('tabs.searchLabel')}
            placeholder={t('tabs.searchPlaceholder')}
            value={query}
            onInput={(event) => setQuery((event.currentTarget as HTMLInputElement).value)}
          />
        </label>
        {showWindowLabels && (
          <label class="tabs-window-field" for="tabs-window-filter">
            <span class="tabs-field-label">{t('tabs.windowFilter')}</span>
            <Select
              id="tabs-window-filter"
              aria-label={t('tabs.windowFilter')}
              data-testid="tabs-window-filter"
              value={String(effectiveWindowId)}
              options={[
                { value: 'all', label: t('tabs.allWindows') },
                ...labels.map((window) => ({ value: String(window.id), label: window.label })),
              ]}
              onChange={(value) => setWindowId(value === 'all' ? 'all' : Number(value))}
            />
          </label>
        )}
        <span class="muted tabs-count" data-testid="tabs-count">
          {visible.length} / {items.length}
        </span>
      </div>

      <div class="tab-list">
        {visible.map((item) => (
          <details key={item.facts.tabId} class="tab-row" data-testid={`tab-row-${item.facts.tabId}`}>
            <summary class="tab-summary">
              <span class={item.matched ? 'tab-match matched' : 'tab-match'}>
                {item.matched ? t('tabs.match') : t('tabs.keep')}
              </span>
              <span class="tab-title">{item.facts.title || item.facts.url}</span>
              <span class="muted tab-domain">{item.facts.domain || t('app.localFile')}</span>
              {showWindowLabels && (
                <span class="muted tab-window">{windowLabelFor(item.facts.windowId, labels, locale)}</span>
              )}
            </summary>
            <div class="tab-detail">
              <p class="tab-url">{item.facts.url}</p>
              <dl class="fact-grid">
                <div>
                  <dt>{t('tabs.lastActive')}</dt>
                  <dd>
                    {item.facts.lastActiveMinutes === null
                      ? t('trace.unknown')
                      : formatMinutesAgo(item.facts.lastActiveMinutes, Date.now(), locale)}
                  </dd>
                </div>
                <div>
                  <dt>{t('tabs.pinnedSound')}</dt>
                  <dd>
                    {item.facts.pinned ? t('tabs.pinned') : t('tabs.notPinned')} /{' '}
                    {item.facts.audible ? t('tabs.audible') : t('tabs.silent')}
                  </dd>
                </div>
                <div>
                  <dt>{t('tabs.group')}</dt>
                  <dd>{item.facts.grouped ? item.facts.groupTitle || t('tabs.unnamedGroup') : t('tabs.ungrouped')}</dd>
                </div>
                <div>
                  <dt>{t('tabs.windowTabs')}</dt>
                  <dd>{item.facts.windowTabCount}</dd>
                </div>
              </dl>
              {item.trace.length > 0 && (
                <div class="trace">
                  <h4>{t('tabs.rules')}</h4>
                  {item.trace.map((node) => (
                    <TraceRow key={node.nodeId} node={node} locale={locale} />
                  ))}
                </div>
              )}
            </div>
          </details>
        ))}
        {!loading && visible.length === 0 && (
          <div class="tabs-empty empty">
            <p class="muted">{t('tabs.empty')}</p>
            {hasFilters && (
              <Button
                onClick={() => {
                  setQuery('');
                  setWindowId('all');
                }}
                data-testid="tabs-clear-filters"
              >
                {t('tabs.clearFilters')}
              </Button>
            )}
          </div>
        )}
      </div>
    </section>
  );
}

function TraceRow({ node, locale }: { node: TraceNode; locale: Locale }) {
  if (!node.fact) return null;
  return (
    <div class={node.result ? 'trace-row pass' : 'trace-row'}>
      <span class="trace-fact">{traceFactLabel(node.fact, locale)}</span>
      <span class="trace-compare">
        <span class="trace-value trace-actual">
          <span class="trace-key">{t('tabs.actual')}</span>
          {formatTraceValue(node.fact, node.actual, locale)}
        </span>
        <span class="trace-value trace-expected">
          <span class="trace-key">{t('tabs.expected')}</span>
          {formatTraceExpected(node.fact, node.expected, locale)}
        </span>
      </span>
      <span class="trace-result">{traceResultLabel(node, locale)}</span>
    </div>
  );
}
