import { describe, expect, it } from 'vitest';
import type { CleanupPreview, CleanupResult, StateSnapshot } from '../../src/shared/types';
import { initialPopupState, popupReducer } from '../../src/ui/popup/state';

const snapshot: StateSnapshot = {
  settings: {
    idleThresholdMinutes: 15,
    lockCleanupEnabled: true,
    lockDelayMinutes: 15,
    historyRetentionDays: 30,
    historyMaxRecords: 5_000,
    activeStrategyId: 'preset:standard',
  },
  strategies: [],
  activeStrategy: {
    id: 'preset:standard',
    name: '标准',
    builtin: true,
    expression: {} as never,
    createdAt: 0,
    updatedAt: 0,
    lastPreviewHash: null,
    lastPreviewAt: null,
  },
  lastCleanup: { at: 1000, trigger: 'manual', closed: 3, failed: 0, skipped: 0, durationMs: 5, recordIds: ['a'] },
  capabilities: { chromeMajor: 121, lastAccessed: true, frozen: true, tabGroups: true, sessions: true },
  warnings: ['测试警告'],
};
const preview: CleanupPreview = { matched: 3, sample: [], totalManagedTabs: 10, strategyName: '标准' };
const result: CleanupResult = {
  runId: 'r',
  trigger: 'manual',
  closed: 3,
  failed: 0,
  skipped: 0,
  durationMs: 5,
  recordIds: ['a'],
  failures: [],
};

describe('popupReducer', () => {
  it('moves from loading to ready', () => {
    const state = popupReducer(initialPopupState(), { type: 'loaded', snapshot, preview });
    expect(state.phase).toBe('ready');
    expect(state.preview?.matched).toBe(3);
  });

  it('requires confirmation before running', () => {
    const ready = popupReducer(initialPopupState(), { type: 'loaded', snapshot, preview });
    const confirm = popupReducer(ready, { type: 'confirm' });
    expect(confirm.phase).toBe('confirm');
    const running = popupReducer(confirm, { type: 'run-start' });
    expect(running.phase).toBe('running');
    const done = popupReducer(running, { type: 'run-done', result });
    expect(done.phase).toBe('done');
    expect(done.result?.closed).toBe(3);
  });

  it('cancels confirmation and handles errors', () => {
    const ready = popupReducer(initialPopupState(), { type: 'loaded', snapshot, preview });
    const confirm = popupReducer(ready, { type: 'confirm' });
    expect(popupReducer(confirm, { type: 'cancel' }).phase).toBe('ready');
    const error = popupReducer(ready, { type: 'error', message: '失败' });
    expect(error.phase).toBe('error');
    expect(error.error).toBe('失败');
  });

  it('handles preview unavailable: stays ready, retains snapshot, preview null, error set', () => {
    const state = popupReducer(initialPopupState(), {
      type: 'loaded',
      snapshot,
      preview: null,
      error: '无法获取清理预览，请稍后重试。',
    });
    expect(state.phase).toBe('ready');
    expect(state.snapshot).toBe(snapshot);
    expect(state.preview).toBeNull();
    expect(state.error).toBe('无法获取清理预览，请稍后重试。');
  });

  it('successful reload after preview failure clears error and restores preview', () => {
    const withError = popupReducer(initialPopupState(), {
      type: 'loaded',
      snapshot,
      preview: null,
      error: '无法获取清理预览，请稍后重试。',
    });
    expect(withError.error).not.toBeNull();

    const recovered = popupReducer(withError, { type: 'loaded', snapshot, preview });
    expect(recovered.phase).toBe('ready');
    expect(recovered.preview).toBe(preview);
    expect(recovered.error).toBeNull();
  });
});
