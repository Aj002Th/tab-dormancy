import { describe, expect, it, vi } from 'vitest';
import { createMessageHandler, handleRequest } from '../../src/background/messages';
import type { TabDormancyService } from '../../src/background/service';
import { AppError } from '../../src/shared/errors';
import type { StateSnapshot } from '../../src/shared/types';

const snapshot: StateSnapshot = {
  settings: {
    idleThresholdMinutes: 15,
    lockCleanupEnabled: true,
    lockDelayMinutes: 15,
    historyRetentionDays: 30,
    activeStrategyId: 'preset:standard',
  },
  strategies: [],
  activeStrategy: {} as StateSnapshot['activeStrategy'],
  lastCleanup: null,
  capabilities: { chromeMajor: 132, lastAccessed: true, frozen: true, tabGroups: true, sessions: true },
  warnings: [],
};

function stub(overrides: Partial<TabDormancyService> = {}) {
  return {
    getState: vi.fn().mockResolvedValue(snapshot),
    runCleanup: vi.fn().mockResolvedValue({
      runId: 'r',
      trigger: 'manual',
      closed: 0,
      failed: 0,
      skipped: 0,
      durationMs: 1,
      recordIds: [],
      failures: [],
    }),
    ...overrides,
  } as unknown as TabDormancyService;
}

describe('message router', () => {
  it('wraps successful responses', async () => {
    const response = await handleRequest({ type: 'state.get' }, stub());
    expect(response).toEqual({ ok: true, data: snapshot });
  });

  it('maps AppError codes', async () => {
    const response = await handleRequest(
      { type: 'state.get' },
      stub({ getState: vi.fn().mockRejectedValue(new AppError('BUSY', '正在清理')) }),
    );
    expect(response).toEqual({ ok: false, error: 'BUSY', message: '正在清理' });
  });

  it('rejects unknown messages', async () => {
    const response = await handleRequest({ type: 'nope' }, stub());
    expect(response.ok).toBe(false);
  });

  it('returns true for async sendResponse handling', async () => {
    const sendResponse = vi.fn();
    const handler = createMessageHandler(stub());
    expect(handler({ type: 'state.get' }, {} as chrome.runtime.MessageSender, sendResponse)).toBe(true);
    await vi.waitFor(() => expect(sendResponse).toHaveBeenCalledWith({ ok: true, data: snapshot }));
  });
});
