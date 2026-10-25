import { useEffect, useReducer } from 'preact/hooks';
import { t } from '../../shared/i18n';
import { formatRelativeTime } from '../../shared/time';
import type { CleanupPreview, CleanupResult, StateSnapshot } from '../../shared/types';
import { messageOf, openDashboard, send } from '../api';
import { Banner } from '../components/Banner';
import { Button } from '../components/Button';
import { Spinner } from '../components/Spinner';
import { strategyDisplayName } from '../dashboard/strategy-name';
import { useLocale } from '../i18n';
import { initialPopupState, popupReducer } from './state';

export function Popup() {
  const locale = useLocale();
  const [state, dispatch] = useReducer(popupReducer, undefined, initialPopupState);

  useEffect(() => {
    void load();
  }, []);

  async function load() {
    let snapshot: StateSnapshot;
    try {
      snapshot = await send<StateSnapshot>({ type: 'state.get' });
    } catch (error) {
      dispatch({ type: 'error', message: messageOf(error) });
      return;
    }

    try {
      const preview = await send<CleanupPreview>({ type: 'cleanup.preview', source: 'popup' });
      dispatch({ type: 'loaded', snapshot, preview });
    } catch (_error) {
      dispatch({
        type: 'loaded',
        snapshot,
        preview: null,
        error: t('popup.previewError'),
      });
    }
  }

  async function run() {
    dispatch({ type: 'run-start' });
    try {
      const result = await send<CleanupResult>({ type: 'cleanup.run', source: 'popup' });
      dispatch({ type: 'run-done', result });
    } catch (error) {
      dispatch({ type: 'error', message: messageOf(error) });
    }
  }

  async function undo() {
    const ids = state.result?.recordIds ?? state.snapshot?.lastCleanup?.recordIds ?? [];
    if (ids.length === 0) return;
    try {
      await send({ type: 'history.restore', ids, options: { mode: 'current-window', complete: true } });
      dispatch({ type: 'reset' });
      await load();
    } catch (error) {
      dispatch({ type: 'error', message: messageOf(error) });
    }
  }

  const snapshot = state.snapshot;
  const preview = state.preview;
  const hasPreview = snapshot && preview;

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
          <p class="muted popup-subtitle">
            {snapshot ? strategyDisplayName(snapshot.activeStrategy, locale) : t('popup.readingStrategy')}
          </p>
        </div>
        <Button
          class="icon-button"
          onClick={openDashboard}
          data-testid="open-dashboard"
          aria-label={t('popup.openDashboard')}
          title={t('popup.openDashboard')}
        >
          ⚙
        </Button>
      </header>

      {state.phase === 'loading' && <Spinner />}
      {state.phase === 'error' && (
        <>
          <Banner tone="error">{state.error}</Banner>
          <Button onClick={() => void load()}>{t('app.retry')}</Button>
        </>
      )}

      {snapshot && !preview && state.phase === 'ready' && (
        <>
          {snapshot.warnings.map((warning) => (
            <Banner key={warning}>{warning}</Banner>
          ))}
          <Banner tone="error">{state.error}</Banner>
          <Button onClick={() => void load()}>{t('app.retry')}</Button>

          <p class="muted popup-footnote">{lastCleanup}</p>
        </>
      )}

      {hasPreview && (state.phase === 'ready' || state.phase === 'confirm') && (
        <>
          {snapshot.warnings.map((warning) => (
            <Banner key={warning}>{warning}</Banner>
          ))}
          {state.error && <Banner tone="error">{state.error}</Banner>}
          <section class="popup-count">
            <span class="popup-number" data-testid="popup-preview-count">
              {preview.matched}
            </span>
            <span class="muted">{t('popup.tabsToClean', { count: preview.matched })}</span>
          </section>
          <p class="muted">
            {t('popup.activeStrategy', {
              name: strategyDisplayName(snapshot.activeStrategy, locale),
              total: preview.totalManagedTabs,
            })}
          </p>

          {state.phase === 'ready' ? (
            <Button
              variant="primary"
              disabled={preview.matched === 0}
              onClick={() => dispatch({ type: 'confirm' })}
              data-testid="cleanup-button"
            >
              {preview.matched === 0 ? t('popup.nothingToClean') : t('popup.cleanCount', { count: preview.matched })}
            </Button>
          ) : (
            <div class="confirm-box">
              <p>{t('popup.confirmClean', { count: preview.matched })}</p>
              <div class="row">
                <Button variant="danger" onClick={() => void run()} data-testid="confirm-cleanup">
                  {t('popup.confirmCleanup')}
                </Button>
                <Button onClick={() => dispatch({ type: 'cancel' })} data-testid="cancel-cleanup">
                  {t('common.cancel')}
                </Button>
              </div>
            </div>
          )}

          <p class="muted popup-footnote">{lastCleanup}</p>
        </>
      )}

      {state.phase === 'running' && <Spinner label={t('popup.cleaning')} />}

      {state.phase === 'done' && state.result && (
        <section class="done-box">
          <h2>{t('popup.closedCount', { count: state.result.closed })}</h2>
          {state.result.failed > 0 && <p class="muted">{t('popup.failed', { count: state.result.failed })}</p>}
          {state.result.skipped > 0 && <p class="muted">{t('popup.skipped', { count: state.result.skipped })}</p>}
          <div class="row">
            {state.result.recordIds.length > 0 && (
              <Button onClick={() => void undo()} data-testid="undo-button">
                {t('popup.undo')}
              </Button>
            )}
            <Button
              variant="primary"
              onClick={() => {
                dispatch({ type: 'reset' });
                void load();
              }}
            >
              {t('popup.done')}
            </Button>
          </div>
        </section>
      )}
    </main>
  );
}
