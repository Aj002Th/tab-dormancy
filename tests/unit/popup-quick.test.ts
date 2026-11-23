// @vitest-environment happy-dom
import { h, render } from 'preact';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { setLocale } from '../../src/shared/i18n';
import type { CleanupResult, StateSnapshot } from '../../src/shared/types';
import { Popup } from '../../src/ui/popup/Popup';

const snapshot = {
  settings: {
    idleThresholdMinutes: 15,
    lockCleanupEnabled: true,
    lockDelayMinutes: 15,
    historyRetentionDays: 30,
    historyMaxRecords: 5_000,
    activeStrategyId: 'preset:standard',
    quickStrategyIds: ['q1'],
    theme: 'system',
    language: 'zh',
    cleanInternalPages: false,
  },
  strategies: [
    {
      id: 'preset:standard',
      name: '标准',
      builtin: true,
      expression: { type: 'all', id: 'root', children: [] },
      createdAt: 0,
      updatedAt: 0,
      lastPreviewHash: null,
      lastPreviewAt: null,
    },
  ],
  activeStrategy: {
    id: 'preset:standard',
    name: '标准',
    builtin: true,
    expression: { type: 'all', id: 'root', children: [] },
    createdAt: 0,
    updatedAt: 0,
    lastPreviewHash: null,
    lastPreviewAt: null,
  },
  lastCleanup: null,
  capabilities: { chromeMajor: 121, lastAccessed: true, frozen: true, tabGroups: true, sessions: true },
  warnings: [],
} as StateSnapshot;

const result: CleanupResult = {
  runId: 'run-1',
  trigger: 'manual',
  closed: 3,
  failed: 0,
  skipped: 0,
  durationMs: 4,
  recordIds: [],
  failures: [],
};

let container: HTMLDivElement | null = null;

function installChrome(): void {
  vi.stubGlobal('chrome', {
    runtime: {
      getManifest: () => ({ version: '0.0.0-test' }),
      sendMessage: vi.fn(async (request: { type: string; strategyId?: string }) => {
        if (request.type === 'state.get') return { ok: true, data: snapshot };
        if (request.type === 'cleanup.preview') {
          return { ok: false, error: 'UNSUPPORTED_FACT', message: 'paused' };
        }
        if (request.type === 'quick.preview') {
          return { ok: true, data: [{ strategyId: 'q1', name: 'Work', matched: 3, status: 'ready' }] };
        }
        if (request.type === 'cleanup.run') return { ok: true, data: result };
        return { ok: false, error: 'NOT_FOUND', message: 'unknown' };
      }),
    },
  });
}

function mount(): void {
  container = document.createElement('div');
  document.body.append(container);
  render(h(Popup, {}), container);
}

function click(testId: string): void {
  const node = container?.querySelector(`[data-testid="${testId}"]`);
  if (!(node instanceof HTMLElement)) throw new Error(`missing ${testId}`);
  node.click();
}

afterEach(() => {
  if (container) {
    render(null, container);
    container.remove();
    container = null;
  }
  document.body.replaceChildren();
  vi.unstubAllGlobals();
});

describe('popup quick cleanup', () => {
  it('renders quick cleanup even when the active preview fails', async () => {
    setLocale('zh');
    installChrome();
    mount();

    await vi.waitFor(() => {
      expect(container?.querySelector('[data-testid="popup-quick-q1"]')).not.toBeNull();
    });
    expect(container?.querySelector('[data-testid="popup-quick-count-q1"]')?.textContent).toBe('3 个');
  });

  it('runs the clicked strategy and names it in the result', async () => {
    setLocale('zh');
    installChrome();
    mount();

    await vi.waitFor(() => expect(container?.querySelector('[data-testid="popup-quick-q1"]')).not.toBeNull());
    click('popup-quick-q1');

    await vi.waitFor(() => {
      expect(container?.textContent).toContain('已用「Work」关闭 3 个标签');
    });
    expect(chrome.runtime.sendMessage).toHaveBeenCalledWith(
      expect.objectContaining({ type: 'cleanup.run', strategyId: 'q1' }),
    );
  });
});
