import { useEffect, useReducer, useRef } from 'preact/hooks';
import { t } from '../../shared/i18n';
import { formatRelativeTime } from '../../shared/time';
import type { CleanupPreview, CleanupResult, Locale, StateSnapshot } from '../../shared/types';
import { ApiError, messageOf, openDashboard, openDashboardRoute, send } from '../api';
import { Banner } from '../components/Banner';
import { Button } from '../components/Button';
import { Select } from '../components/Select';
import { Spinner } from '../components/Spinner';
import { strategyDisplayName } from '../dashboard/strategy-name';
import { strategyCardSummary } from '../dashboard/strategy-summary';
import { useLocale } from '../i18n';
import { popupSample } from './sample';
import { initialPopupState, popupReducer } from './state';

export function Popup() {
  const locale = useLocale();
  const [state, dispatch] = useReducer(popupReducer, undefined, initialPopupState);
  const request = useRef(0);

  useEffect(() => {
    void load();
  }, []);

  function nextRequest(): number {
    request.current += 1;
    return request.current;
  }

  async function reload() {
    const generation = nextRequest();
    dispatch({ type: 'reload', generation });
    await load(generation);
  }

  async function load(generation = request.current) {
    let snapshot: StateSnapshot;
    try {
      snapshot = await send<StateSnapshot>({ type: 'state.get' });
    } catch (error) {
      dispatch({ type: 'error', message: messageOf(error), generation });
      return;
    }
    if (generation !== request.current) return;

    try {
      const preview = await send<CleanupPreview>({ type: 'cleanup.preview', source: 'popup' });
      dispatch({ type: 'loaded', snapshot, preview, generation });
    } catch (_error) {
      dispatch({
        type: 'loaded',
        snapshot,
        preview: null,
        error: t('popup.previewError'),
        generation,
      });
    }
  }

  async function run() {
    dispatch({ type: 'run-start' });
    try {
      const result = await send<CleanupResult>({ type: 'cleanup.run', source: 'popup' });
      dispatch({ type: 'run-done', result });
    } catch (error) {
      dispatch({ type: 'error', message: messageOf(error), generation: request.current });
    }
  }

  async function undo() {
    const ids = state.result?.recordIds ?? state.snapshot?.lastCleanup?.recordIds ?? [];
    if (ids.length === 0) return;
    try {
      await send({ type: 'history.restore', ids, options: { mode: 'current-window', complete: true } });
      await reload();
    } catch (error) {
      dispatch({ type: 'error', message: messageOf(error), generation: request.current });
    }
  }

  async function activate(id: string) {
    if (!state.snapshot || id === state.snapshot.activeStrategy.id || state.phase !== 'ready') return;
    const generation = nextRequest();
    dispatch({ type: 'switch-start', generation });
    try {
      await send({ type: 'strategy.activate', id });
    } catch (error) {
      dispatch({
        type: 'switch-failed',
        message: messageOf(error),
        code: error instanceof ApiError ? error.code : undefined,
        generation,
      });
      return;
    }
    await load(generation);
  }

  const snapshot = state.snapshot;
  const preview = state.preview;
  const hasPreview = snapshot && preview;
  const sample = preview ? popupSample(preview) : null;
  const summary = snapshot ? strategyCardSummary(snapshot.activeStrategy.expression, locale).primary : '';

  const lastCleanup = snapshot?.lastCleanup
    ? t('popup.lastCleanup', {
        time: formatRelativeTime(Date.now(), snapshot.lastCleanup.at, locale),
        count: snapshot.lastCleanup.closed,
      })
    : t('popup.noCleanup');

  return (
    <main class="popup">
      <header class="popup-head">
        <div>
          <h1>Tab Dormancy</h1>
          {!snapshot && <p class="muted popup-subtitle">{t('popup.readingStrategy')}</p>}
        </div>
        <Button
          class="icon-button"
          onClick={openDashboard}
          data-testid="open-dashboard"
          aria-label={t('popup.openDashboard')}
          title={t('popup.openDashboard')}
        >
          <svg
            aria-hidden="true"
            width="20"
            height="20"
            viewBox="0 0 24 24"
            fill="none"
            stroke="currentColor"
            stroke-width="1.8"
            stroke-linecap="round"
            stroke-linejoin="round"
          >
            <path d="M12 15.5a3.5 3.5 0 1 0 0-7 3.5 3.5 0 0 0 0 7Z" />
            <path d="M19.4 15a1.65 1.65 0 0 0 .33 1.82l.06.06a2 2 0 1 1-2.83 2.83l-.06-.06a1.65 1.65 0 0 0-1.82-.33 1.65 1.65 0 0 0-1 1.51V21a2 2 0 1 1-4 0v-.09A1.65 1.65 0 0 0 9 19.4a1.65 1.65 0 0 0-1.82.33l-.06.06a2 2 0 1 1-2.83-2.83l.06-.06a1.65 1.65 0 0 0 .33-1.82 1.65 1.65 0 0 0-1.51-1H3a2 2 0 1 1 0-4h.09A1.65 1.65 0 0 0 4.6 9a1.65 1.65 0 0 0-.33-1.82l-.06-.06a2 2 0 1 1 2.83-2.83l.06.06a1.65 1.65 0 0 0 1.82.33H9a1.65 1.65 0 0 0 1-1.51V3a2 2 0 1 1 4 0v.09a1.65 1.65 0 0 0 1 1.51 1.65 1.65 0 0 0 1.82-.33l.06-.06a2 2 0 1 1 2.83 2.83l-.06.06a1.65 1.65 0 0 0-.33 1.82V9a1.65 1.65 0 0 0 1.51 1H21a2 2 0 1 1 0 4h-.09a1.65 1.65 0 0 0-1.51 1Z" />
          </svg>
        </Button>
      </header>

      {state.phase === 'loading' && <Spinner />}
      {state.phase === 'error' && (
        <>
          <Banner tone="error">{state.error}</Banner>
          <Button class="popup-action" onClick={() => void reload()}>
            {t('app.retry')}
          </Button>
        </>
      )}

      {snapshot && !preview && state.phase === 'ready' && (
        <>
          <section class="popup-card">
            <StrategySelect snapshot={snapshot} locale={locale} disabled={false} onChange={(id) => void activate(id)} />
          </section>
          {snapshot.warnings.map((warning) => (
            <Banner key={warning}>{warning}</Banner>
          ))}
          {state.error && <Banner tone="error">{state.error}</Banner>}
          <div class="row popup-actions">
            <Button onClick={() => void reload()}>{t('app.retry')}</Button>
            {state.switchErrorCode === 'PREVIEW_REQUIRED' && (
              <Button onClick={() => openDashboardRoute('strategies')} data-testid="preview-in-dashboard">
                {t('popup.previewInDashboard')}
              </Button>
            )}
          </div>
          <p class="muted popup-footnote">{lastCleanup}</p>
        </>
      )}

      {hasPreview && (state.phase === 'ready' || state.phase === 'confirm' || state.phase === 'switching') && (
        <>
          {snapshot.warnings.map((warning) => (
            <Banner key={warning}>{warning}</Banner>
          ))}
          {state.error && (
            <Banner tone="error">
              <span>{state.error}</span>
              {state.switchErrorCode === 'PREVIEW_REQUIRED' && (
                <Button onClick={() => openDashboardRoute('strategies')} data-testid="preview-in-dashboard">
                  {t('popup.previewInDashboard')}
                </Button>
              )}
            </Banner>
          )}
          <section class="popup-card">
            <StrategySelect
              snapshot={snapshot}
              locale={locale}
              disabled={state.phase !== 'ready'}
              onChange={(id) => void activate(id)}
            />
            {(summary || preview.totalManagedTabs > 0) && (
              <p class="muted popup-meta">
                {summary && (
                  <span class="popup-summary" title={summary}>
                    {summary}
                  </span>
                )}
                <span class="popup-managed">{t('popup.managedTabs', { total: preview.totalManagedTabs })}</span>
              </p>
            )}

            <div class="popup-body">
              <output
                class={`popup-status${preview.matched === 0 ? ' popup-empty' : ''}`}
                aria-live="polite"
                aria-atomic="true"
              >
                <span class="popup-number" data-testid="popup-preview-count">
                  {preview.matched}
                </span>
                <span class="popup-count-label" data-testid={preview.matched === 0 ? 'popup-empty' : undefined}>
                  {preview.matched === 0 ? t('popup.nothingToClean') : t('popup.tabsToClean')}
                </span>
              </output>
              {sample && sample.items.length > 0 && (
                <ul class="popup-sample" data-testid="popup-sample">
                  {sample.items.map((item) => (
                    <li key={item.tabId}>
                      <span class="popup-sample-title">{item.title}</span>
                      {item.domain && item.title !== item.domain && (
                        <span class="muted popup-sample-domain">{item.domain}</span>
                      )}
                    </li>
                  ))}
                </ul>
              )}
              {sample?.hasMore && (
                <button
                  type="button"
                  class="popup-view-all"
                  onClick={() => openDashboardRoute('tabs')}
                  data-testid="popup-view-all"
                >
                  {t('popup.viewAll')}
                </button>
              )}
              {state.phase === 'switching' && <Spinner label={t('popup.switching')} />}
              {state.phase === 'ready' && preview.matched > 0 && (
                <Button
                  class="popup-action"
                  variant="primary"
                  onClick={() => dispatch({ type: 'confirm' })}
                  data-testid="cleanup-button"
                >
                  {t('popup.cleanCount', { count: preview.matched })}
                </Button>
              )}
              {state.phase === 'confirm' && (
                <div class="confirm-box">
                  <p>{t('popup.confirmClean', { count: preview.matched })}</p>
                  <div class="row popup-actions">
                    <Button variant="danger" onClick={() => void run()} data-testid="confirm-cleanup">
                      {t('popup.confirmCleanup')}
                    </Button>
                    <Button onClick={() => dispatch({ type: 'cancel' })} data-testid="cancel-cleanup">
                      {t('common.cancel')}
                    </Button>
                  </div>
                </div>
              )}
            </div>
          </section>

          <p class="muted popup-footnote">{lastCleanup}</p>
        </>
      )}

      {state.phase === 'running' && <Spinner label={t('popup.cleaning')} />}

      {state.phase === 'done' && state.result && (
        <section class="done-box">
          <h2>{t('popup.closedCount', { count: state.result.closed })}</h2>
          {state.result.failed > 0 && <p class="muted">{t('popup.failed', { count: state.result.failed })}</p>}
          {state.result.skipped > 0 && <p class="muted">{t('popup.skipped', { count: state.result.skipped })}</p>}
          <div class="row popup-actions">
            {state.result.recordIds.length > 0 && (
              <Button onClick={() => void undo()} data-testid="undo-button">
                {t('popup.undo')}
              </Button>
            )}
            <Button variant="primary" onClick={() => void reload()}>
              {t('popup.done')}
            </Button>
          </div>
        </section>
      )}
    </main>
  );
}

function StrategySelect({
  snapshot,
  locale,
  disabled,
  onChange,
}: {
  snapshot: StateSnapshot;
  locale: Locale;
  disabled: boolean;
  onChange: (id: string) => void;
}) {
  return (
    <div class="popup-strategy-field">
      <span class="popup-field-label" id="popup-strategy-label">
        {t('popup.strategyLabel')}
      </span>
      <Select
        id="popup-strategy"
        data-testid="popup-strategy"
        aria-labelledby="popup-strategy-label"
        disabled={disabled}
        value={snapshot.activeStrategy.id}
        options={snapshot.strategies.map((strategy) => ({
          value: strategy.id,
          label: strategyDisplayName(strategy, locale),
        }))}
        onChange={onChange}
      />
    </div>
  );
}
