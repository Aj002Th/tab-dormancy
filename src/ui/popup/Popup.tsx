import { useEffect, useReducer } from 'preact/hooks';
import { formatRelativeTime } from '../../shared/time';
import type { CleanupPreview, CleanupResult, StateSnapshot } from '../../shared/types';
import { messageOf, openDashboard, send } from '../api';
import { Banner } from '../components/Banner';
import { Button } from '../components/Button';
import { Spinner } from '../components/Spinner';
import { initialPopupState, popupReducer } from './state';

export function Popup() {
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
        error: '无法获取清理预览，请稍后重试。',
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

  return (
    <main class="popup">
      <header class="popup-head">
        <div>
          <h1>Tab Dormancy</h1>
          <p class="muted popup-subtitle">{snapshot?.activeStrategy.name ?? '正在读取策略'}</p>
        </div>
        <Button class="icon-button" onClick={openDashboard} data-testid="open-dashboard" aria-label="打开控制台">
          ⚙
        </Button>
      </header>

      {state.phase === 'loading' && <Spinner />}
      {state.phase === 'error' && (
        <>
          <Banner tone="error">{state.error}</Banner>
          <Button onClick={() => void load()}>重试</Button>
        </>
      )}

      {snapshot && !preview && state.phase === 'ready' && (
        <>
          {snapshot.warnings.map((warning) => (
            <Banner key={warning}>{warning}</Banner>
          ))}
          <Banner tone="error">{state.error}</Banner>
          <Button onClick={() => void load()}>重试</Button>

          <p class="muted popup-footnote">
            {snapshot.lastCleanup
              ? `上次清理：${formatRelativeTime(Date.now(), snapshot.lastCleanup.at)}，关闭 ${snapshot.lastCleanup.closed} 个`
              : '还没有清理记录'}
          </p>
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
            <span class="muted">个标签可清理</span>
          </section>
          <p class="muted">
            当前策略「{preview.strategyName}」，共 {preview.totalManagedTabs} 个可管理标签。
          </p>

          {state.phase === 'ready' ? (
            <Button
              variant="primary"
              disabled={preview.matched === 0}
              onClick={() => dispatch({ type: 'confirm' })}
              data-testid="cleanup-button"
            >
              {preview.matched === 0 ? '没有可清理的标签' : `清理 ${preview.matched} 个标签`}
            </Button>
          ) : (
            <div class="confirm-box">
              <p>将关闭 {preview.matched} 个标签，关闭后可在控制台恢复。</p>
              <div class="row">
                <Button variant="danger" onClick={() => void run()} data-testid="confirm-cleanup">
                  确认清理
                </Button>
                <Button onClick={() => dispatch({ type: 'cancel' })} data-testid="cancel-cleanup">
                  取消
                </Button>
              </div>
            </div>
          )}

          <p class="muted popup-footnote">
            {snapshot.lastCleanup
              ? `上次清理：${formatRelativeTime(Date.now(), snapshot.lastCleanup.at)}，关闭 ${snapshot.lastCleanup.closed} 个`
              : '还没有清理记录'}
          </p>
        </>
      )}

      {state.phase === 'running' && <Spinner label="正在清理…" />}

      {state.phase === 'done' && state.result && (
        <section class="done-box">
          <h2>已关闭 {state.result.closed} 个标签</h2>
          {state.result.failed > 0 && <p class="muted">{state.result.failed} 个失败</p>}
          {state.result.skipped > 0 && <p class="muted">{state.result.skipped} 个因页面变化跳过</p>}
          <div class="row">
            {state.result.recordIds.length > 0 && (
              <Button onClick={() => void undo()} data-testid="undo-button">
                撤销
              </Button>
            )}
            <Button
              variant="primary"
              onClick={() => {
                dispatch({ type: 'reset' });
                void load();
              }}
            >
              完成
            </Button>
          </div>
        </section>
      )}
    </main>
  );
}
