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
import { Select } from '../components/Select';
import { Spinner } from '../components/Spinner';
import { useLocale } from '../i18n';
import { toggleSelection } from './history-selection';
import { strategyDisplayName } from './strategy-name';

const PAGE_SIZE = 50;

type ConfirmAction = { type: 'delete'; ids: string[]; count: number } | { type: 'clear' };
type BusyAction = 'restore' | 'delete' | 'clear' | null;

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
  const [busy, setBusy] = useState<BusyAction>(null);
  const [confirmAction, setConfirmAction] = useState<ConfirmAction | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [notice, setNotice] = useState<string | null>(null);
  const [failures, setFailures] = useState<RestoreResult['failed']>([]);

  async function load() {
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
    const timer = setTimeout(() => void load(), 300);
    return () => clearTimeout(timer);
  }, [query, trigger, restored, page]);

  useEffect(() => {
    if (!confirmAction) return;
    requestAnimationFrame(() => document.getElementById('history-confirm-action')?.focus());
  }, [confirmAction]);

  async function restore() {
    if (selected.size === 0 || busy) return;
    setBusy('restore');
    setNotice(null);
    setError(null);
    setFailures([]);
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
    } finally {
      setBusy(null);
    }
  }

  function requestDelete() {
    if (selected.size === 0 || busy) return;
    setConfirmAction({ type: 'delete', ids: [...selected], count: selected.size });
  }

  function requestClear() {
    if (busy) return;
    setConfirmAction({ type: 'clear' });
  }

  async function runConfirm() {
    const action = confirmAction;
    if (!action) return;
    setConfirmAction(null);
    if (action.type === 'delete') {
      await removeSelected(action.ids, action.count);
      return;
    }
    await clearAll();
  }

  async function removeSelected(ids: string[], count: number) {
    setBusy('delete');
    setNotice(null);
    setError(null);
    try {
      await send({ type: 'history.delete', ids });
      setSelected(new Set());
      await load();
      setNotice(translate(locale, 'history.deleted', { count }));
    } catch (error) {
      setError(messageOf(error));
    } finally {
      setBusy(null);
    }
  }

  async function clearAll() {
    setBusy('clear');
    setNotice(null);
    setError(null);
    setFailures([]);
    try {
      await send({ type: 'history.clear' });
      setSelected(new Set());
      await load();
      setNotice(t('history.cleared'));
    } catch (error) {
      setError(messageOf(error));
    } finally {
      setBusy(null);
    }
  }

  const items = result?.items ?? [];
  const totalPages = result ? Math.max(1, Math.ceil(result.total / PAGE_SIZE)) : 1;
  const hasFilters = query.trim() !== '' || trigger !== 'all' || restored !== 'all';

  useEffect(() => {
    if (result && page > totalPages) setPage(totalPages);
  }, [result, page, totalPages]);

  function clearFilters() {
    setQuery('');
    setTrigger('all');
    setRestored('all');
    setPage(1);
  }

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

      {confirmAction && (
        <div
          class="history-confirm"
          role="alert"
          onKeyDown={(event) => {
            if (event.key === 'Escape') setConfirmAction(null);
          }}
        >
          <p>
            {confirmAction.type === 'delete'
              ? translate(locale, 'history.deleteConfirm', { count: confirmAction.count })
              : t('history.clearConfirm')}
          </p>
          <div class="row">
            <Button
              id="history-confirm-action"
              variant="danger"
              onClick={() => void runConfirm()}
              data-testid="history-confirm-action"
            >
              {confirmAction.type === 'delete' ? t('history.deleteSelected') : t('history.clear')}
            </Button>
            <Button onClick={() => setConfirmAction(null)} data-testid="history-confirm-cancel">
              {t('common.cancel')}
            </Button>
          </div>
        </div>
      )}

      <div class="toolbar history-toolbar">
        <label class="history-field history-search-field" for="history-search">
          <span class="history-field-label">{t('history.searchLabel')}</span>
          <input
            id="history-search"
            class="input"
            type="search"
            aria-label={t('history.searchLabel')}
            placeholder={t('tabs.searchPlaceholder')}
            value={query}
            data-testid="history-search"
            onInput={(event) => {
              setQuery((event.currentTarget as HTMLInputElement).value);
              setPage(1);
            }}
          />
        </label>
        <label class="history-field" for="history-trigger">
          <span class="history-field-label">{t('history.triggerFilter')}</span>
          <Select
            id="history-trigger"
            aria-label={t('history.triggerFilter')}
            value={trigger}
            options={[
              { value: 'all', label: t('history.triggerAll') },
              { value: 'idle', label: t('history.triggerIdle') },
              { value: 'locked', label: t('history.triggerLocked') },
              { value: 'manual', label: t('history.triggerManual') },
            ]}
            onChange={(value) => {
              setTrigger(value as Trigger | 'all');
              setPage(1);
            }}
          />
        </label>
        <label class="history-field" for="history-status">
          <span class="history-field-label">{t('history.statusFilter')}</span>
          <Select
            id="history-status"
            aria-label={t('history.statusFilter')}
            value={restored}
            options={[
              { value: 'all', label: t('history.statusAll') },
              { value: 'no', label: t('history.statusNotRestored') },
              { value: 'yes', label: t('history.statusRestored') },
            ]}
            onChange={(value) => {
              setRestored(value as 'all' | 'yes' | 'no');
              setPage(1);
            }}
          />
        </label>
      </div>

      <div class="history-actions">
        <label class="history-field" for="history-restore-mode">
          <span class="history-field-label">{t('history.restoreMode')}</span>
          <Select
            id="history-restore-mode"
            data-testid="history-restore-mode"
            aria-label={t('history.restoreMode')}
            value={mode}
            options={[
              { value: 'current-window', label: t('history.restoreCurrent') },
              { value: 'original-window-groups', label: t('history.restoreOriginal') },
            ]}
            onChange={(value) => setMode(value as RestoreOptions['mode'])}
          />
        </label>
        <span class="grow" />
        <Button
          disabled={selected.size === 0 || busy !== null || confirmAction !== null}
          onClick={() => void restore()}
          data-testid="history-restore"
        >
          {busy === 'restore' ? t('history.restoring') : t('history.restoreSelected')}
        </Button>
        <div class="history-danger-actions">
          <Button
            variant="danger"
            disabled={selected.size === 0 || busy !== null || confirmAction !== null}
            onClick={requestDelete}
            data-testid="history-delete"
          >
            {busy === 'delete' ? t('history.deleting') : t('history.deleteSelected')}
          </Button>
          <Button
            variant="danger"
            disabled={busy !== null || confirmAction !== null}
            onClick={requestClear}
            data-testid="history-clear"
          >
            {busy === 'clear' ? t('history.clearing') : t('history.clear')}
          </Button>
        </div>
      </div>
      <p class="muted small history-restore-note">{t('history.restoreNote')}</p>

      {loading && <Spinner />}
      <div class="history-list">
        {items.map((item) => (
          <div class="history-row" data-testid={`history-row-${item.id}`} key={item.id}>
            <label class="history-check">
              <input
                type="checkbox"
                checked={selected.has(item.id)}
                disabled={busy !== null || confirmAction !== null}
                data-testid={`history-select-${item.id}`}
                onChange={(event) =>
                  setSelected((current) =>
                    toggleSelection(current, item.id, (event.currentTarget as HTMLInputElement).checked),
                  )
                }
              />
              <span class="sr-only">{translate(locale, 'history.select', { title: item.title })}</span>
            </label>
            <div class="history-main">
              <div class="history-title" title={item.title || item.url}>
                {item.title || item.url}
              </div>
              <div class="muted small history-url" title={item.url}>
                {item.url}
              </div>
            </div>
            <div class="history-meta">
              <span>{item.domain || t('app.localFile')}</span>
              <span>{formatRelativeTime(Date.now(), item.closedAt, locale)}</span>
              <span>{triggerLabel(item.trigger, locale)}</span>
              <span class={item.restoredAt === null ? 'history-state' : 'history-state restored'}>
                {item.restoredAt === null ? t('history.statusNotRestored') : t('history.statusRestored')}
              </span>
              {item.strategyName && (
                <span class="muted small history-strategy">
                  {strategyDisplayName({ id: item.strategyId ?? '', name: item.strategyName }, locale)}
                </span>
              )}
            </div>
          </div>
        ))}
        {!loading && items.length === 0 && (
          <div class="history-empty empty">
            <p class="muted">{t('history.empty')}</p>
            {hasFilters && (
              <Button onClick={clearFilters} data-testid="history-clear-filters">
                {t('history.clearFilters')}
              </Button>
            )}
          </div>
        )}
      </div>

      <div class="pager">
        <Button disabled={page <= 1 || busy !== null} onClick={() => setPage((value) => Math.max(1, value - 1))}>
          {t('history.prev')}
        </Button>
        <span class="muted">{translate(locale, 'history.page', { page, total: totalPages })}</span>
        <Button disabled={page >= totalPages || busy !== null} onClick={() => setPage((value) => value + 1)}>
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
