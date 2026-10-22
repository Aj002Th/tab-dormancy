import { describe, expect, it } from 'vitest';
import type { CleanupResult } from '../../src/shared/types';
import { initialPopupState, popupReducer } from '../../src/ui/popup/state';

const snapshot = {
  settings: {},
  strategies: [],
  activeStrategy: {},
  lastCleanup: null,
  capabilities: {},
  warnings: [],
} as never;
const preview = { matched: 3, sample: [], totalManagedTabs: 10, strategyName: '标准' };
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
});
