import { useEffect, useState } from 'preact/hooks';
import { t, translate } from '../../shared/i18n';
import { formatRelativeTime } from '../../shared/time';
import type {
  HistoryQuery,
  HistoryQueryResult,
  Locale,
  RestoreOptions,
  RestoreResult,
  Trigger,
} from '../../shared/types';
import { messageOf, send } from '../api';
import { Banner } from '../components/Banner';
import { Button } from '../components/Button';
import { Spinner } from '../components/Spinner';
import { useLocale } from '../i18n';
import { toggleSelection } from './history-selection';
import { strategyDisplayName } from './strategy-name';

const PAGE_SIZE = 50;

export function HistoryPage() {
  const locale = useLocale();
  const [query, setQuery] = useState('');
  const [trigger, setTrigger] = useState<Trigger | 'all'>('all');
  const [restored, setRestored] = useState<'all' | 'yes' | 'no'>('all');
  const [page, setPage] = useState(1);
  const [result, setResult] = useState<HistoryQueryResult | null>(null);
  const [selected, setSelected] = useState<Set<string>>(new Set());
  const [mode, setMode] = useState<RestoreOptions['mode']>('current-window');
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
        options: { mode, complete: true },
      });
      setFailures(response.failed);
      setNotice(
        response.failed.length > 0
          ? translate(locale, 'history.restored', {
              restored: response.restored,
              failed: response.failed.length,
            })
          : translate(locale, 'history.restoredOnly', { restored: response.restored }),
      );
      setSelected(new Set());
      await load();
    } catch (error) {
      setError(messageOf(error));
    }
  }

  async function remove() {
    if (selected.size === 0) return;
    if (!window.confirm(translate(locale, 'history.deleteConfirm', { count: selected.size }))) return;
    try {
      await send({ type: 'history.delete', ids: [...selected] });
      setSelected(new Set());
      await load();
    } catch (error) {
      setError(messageOf(error));
    }
  }

  async function clear() {
    if (!window.confirm(t('history.clearConfirm'))) return;
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
          <h2>{t('history.title')}</h2>
          <p class="muted">
            {result ? (
              <>
                <span data-testid="history-retention">
                  {translate(locale, 'history.retention', {
                    days: result.retention.days,
                    max: result.retention.maxRecords,
                  })}
                </span>{' '}
                <a class="text-link" href="#/settings">
                  {t('history.adjust')}
                </a>
                {locale === 'en' ? '. ' : ''}
                {t('history.retentionTail')}
              </>
            ) : (
              t('history.loadingRetention')
            )}
          </p>
        </div>
        <span class="muted" data-testid="history-total">
          {translate(locale, 'history.total', { count: result?.total ?? 0 })}
        </span>
      </header>

      {error && <Banner tone="error">{error}</Banner>}
      {notice && <Banner>{notice}</Banner>}
      {failures.length > 0 && (
        <Banner tone="error">
          <div>{t('history.restoreFailed')}</div>
          <ul class="restore-failures">
            {failures.map((failure) => (
              <li key={failure.id}>
                {failure.url}
                {t('history.failureSeparator')}
                {failure.reason}
              </li>
            ))}
          </ul>
        </Banner>
      )}

      <div class="toolbar">
        <input
          class="input"
          type="search"
          placeholder={t('tabs.searchPlaceholder')}
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
          <option value="all">{t('history.triggerAll')}</option>
          <option value="idle">{t('history.triggerIdle')}</option>
          <option value="locked">{t('history.triggerLocked')}</option>
          <option value="manual">{t('history.triggerManual')}</option>
        </select>
        <select
          class="input"
          value={restored}
          onChange={(event) => {
            setRestored((event.currentTarget as HTMLSelectElement).value as 'all' | 'yes' | 'no');
            setPage(1);
          }}
        >
          <option value="all">{t('history.statusAll')}</option>
          <option value="no">{t('history.statusNotRestored')}</option>
          <option value="yes">{t('history.statusRestored')}</option>
        </select>
      </div>

      <div class="history-actions">
        <select
          class="input"
          value={mode}
          data-testid="history-restore-mode"
          onChange={(event) => setMode((event.currentTarget as HTMLSelectElement).value as RestoreOptions['mode'])}
        >
          <option value="current-window">{t('history.restoreCurrent')}</option>
          <option value="original-window-groups">{t('history.restoreOriginal')}</option>
        </select>
        <span class="grow" />
        <Button disabled={selected.size === 0} onClick={() => void restore()} data-testid="history-restore">
          {t('history.restoreSelected')}
        </Button>
        <Button
          variant="danger"
          disabled={selected.size === 0}
          onClick={() => void remove()}
          data-testid="history-delete"
        >
          {t('history.deleteSelected')}
        </Button>
        <Button variant="danger" onClick={() => void clear()} data-testid="history-clear">
          {t('history.clear')}
        </Button>
      </div>
      <p class="muted small history-restore-note">{t('history.restoreNote')}</p>

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
              aria-label={translate(locale, 'history.select', { title: item.title })}
            />
            <div class="history-main">
              <div class="history-title">{item.title || item.url}</div>
              <div class="muted small history-url">{item.url}</div>
            </div>
            <div class="history-meta">
              <span>{item.domain || t('app.localFile')}</span>
              <span>{formatRelativeTime(Date.now(), item.closedAt, locale)}</span>
              <span>{triggerLabel(item.trigger, locale)}</span>
              <span>{item.restoredAt === null ? t('history.statusNotRestored') : t('history.statusRestored')}</span>
              {item.strategyName && (
                <span class="muted small history-strategy">
                  {strategyDisplayName({ id: item.strategyId ?? '', name: item.strategyName }, locale)}
                </span>
              )}
            </div>
          </div>
        ))}
        {!loading && items.length === 0 && <p class="muted empty">{t('history.empty')}</p>}
      </div>

      <div class="pager">
        <Button disabled={page <= 1} onClick={() => setPage((value) => Math.max(1, value - 1))}>
          {t('history.prev')}
        </Button>
        <span class="muted">{translate(locale, 'history.page', { page, total: totalPages })}</span>
        <Button disabled={page >= totalPages} onClick={() => setPage((value) => value + 1)}>
          {t('history.next')}
        </Button>
      </div>
    </section>
  );
}

function triggerLabel(trigger: Trigger, locale: Locale): string {
  return trigger === 'idle'
    ? translate(locale, 'history.triggerIdle')
    : trigger === 'locked'
      ? translate(locale, 'history.triggerLocked')
      : translate(locale, 'history.triggerManual');
}
