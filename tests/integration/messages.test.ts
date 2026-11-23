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
    historyMaxRecords: 5_000,
    activeStrategyId: 'preset:standard',
    quickStrategyIds: [],
    quickCleanupLimit: 4,
    theme: 'system',
    language: 'system',
    cleanInternalPages: false,
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

  it('routes configuration export and import', async () => {
    const exported = {
      app: 'tab-dormancy',
      schemaVersion: 1,
      exportedAt: 1,
      settings: snapshot.settings,
      strategies: [],
    };
    const service = stub({
      exportConfig: vi.fn().mockResolvedValue(exported),
      importConfig: vi.fn().mockResolvedValue({ imported: 2, activeStrategyId: 'preset:standard' }),
    } as Partial<TabDormancyService>);

    await expect(handleRequest({ type: 'config.export' }, service)).resolves.toEqual({
      ok: true,
      data: exported,
    });
    await expect(handleRequest({ type: 'config.import', bundle: exported }, service)).resolves.toEqual({
      ok: true,
      data: { imported: 2, activeStrategyId: 'preset:standard' },
    });
  });

  it('routes quick.set to the service', async () => {
    const setQuickStrategies = vi.fn().mockResolvedValue(['preset:standard']);
    const response = await handleRequest(
      { type: 'quick.set', ids: ['preset:standard'] },
      stub({ setQuickStrategies } as Partial<TabDormancyService>),
    );
    expect(setQuickStrategies).toHaveBeenCalledWith(['preset:standard']);
    expect(response).toEqual({ ok: true, data: ['preset:standard'] });
  });

  it('forwards strategyId from cleanup.run', async () => {
    const runCleanup = vi.fn().mockResolvedValue({
      runId: 'r',
      trigger: 'manual',
      closed: 0,
      failed: 0,
      skipped: 0,
      durationMs: 1,
      recordIds: [],
      failures: [],
    });
    await handleRequest(
      { type: 'cleanup.run', source: 'popup', strategyId: 'preset:gentle' },
      stub({ runCleanup } as Partial<TabDormancyService>),
    );
    expect(runCleanup).toHaveBeenCalledWith('manual', 'preset:gentle');
  });

  it('returns true for async sendResponse handling', async () => {
    const sendResponse = vi.fn();
    const handler = createMessageHandler(stub());
    expect(handler({ type: 'state.get' }, {} as chrome.runtime.MessageSender, sendResponse)).toBe(true);
    await vi.waitFor(() => expect(sendResponse).toHaveBeenCalledWith({ ok: true, data: snapshot }));
  });
});
