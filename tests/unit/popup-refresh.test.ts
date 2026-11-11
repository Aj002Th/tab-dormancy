// @vitest-environment happy-dom
import { h, render } from 'preact';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { setLocale } from '../../src/shared/i18n';
import type { CleanupPreview, CleanupResult, StateSnapshot } from '../../src/shared/types';
import { Popup } from '../../src/ui/popup/Popup';

const snapshot = {
  settings: {
    idleThresholdMinutes: 15,
    lockCleanupEnabled: true,
    lockDelayMinutes: 15,
    historyRetentionDays: 30,
    historyMaxRecords: 5_000,
    activeStrategyId: 'preset:standard',
    theme: 'system',
    language: 'zh',
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

const preview: CleanupPreview = {
  matched: 5,
  sample: [],
  totalManagedTabs: 8,
  strategyId: 'preset:standard',
  strategyName: '标准',
};

const result: CleanupResult = {
  runId: 'run-1',
  trigger: 'manual',
  closed: 5,
  failed: 0,
  skipped: 0,
  durationMs: 4,
  recordIds: [],
  failures: [],
};

let container: HTMLDivElement | null = null;
let matched = 5;

function installChrome(): void {
  vi.stubGlobal('chrome', {
    runtime: {
      sendMessage: vi.fn(async (request: { type: string }) => {
        if (request.type === 'state.get') return { ok: true, data: snapshot };
        if (request.type === 'cleanup.preview') return { ok: true, data: { ...preview, matched } };
        if (request.type === 'cleanup.run') {
          matched = 0;
          return { ok: true, data: result };
        }
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
  matched = 5;
});

describe('popup cleanup refresh', () => {
  it('shows the remaining tabs after cleanup is dismissed', async () => {
    setLocale('zh');
    installChrome();
    mount();

    await vi.waitFor(() => {
      expect(container?.querySelector('[data-testid="popup-preview-count"]')?.textContent).toBe('5');
    });

    click('cleanup-button');
    await vi.waitFor(() => {
      expect(container?.querySelector('[data-testid="confirm-cleanup"]')).not.toBeNull();
    });
    click('confirm-cleanup');

    await vi.waitFor(() => {
      expect(container?.textContent).toContain('已关闭 5 个标签');
    });

    const done = [...(container?.querySelectorAll('button') ?? [])].find((button) => button.textContent === '完成');
    if (!(done instanceof HTMLElement)) throw new Error('missing done button');
    done.click();

    await vi.waitFor(() => {
      expect(container?.querySelector('[data-testid="popup-preview-count"]')?.textContent).toBe('0');
    });
  });
});
