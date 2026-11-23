// @vitest-environment happy-dom
import { h, render } from 'preact';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { setLocale } from '../../src/shared/i18n';
import type { CleanupResult, QuickStrategyItem, StateSnapshot } from '../../src/shared/types';
import { Popup } from '../../src/ui/popup/Popup';

const snapshot = {
  settings: {
    idleThresholdMinutes: 15,
    lockCleanupEnabled: true,
    lockDelayMinutes: 15,
    historyRetentionDays: 30,
    historyMaxRecords: 5_000,
    activeStrategyId: 'preset:standard',
    quickStrategyIds: ['q1', 'q0', 'qi'],
    quickCleanupLimit: 4,
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

const quickItems: QuickStrategyItem[] = [
  { strategyId: 'q1', name: 'Work', matched: 3, status: 'ready' },
  { strategyId: 'q0', name: 'Empty', matched: 0, status: 'ready' },
  { strategyId: 'qi', name: '标准', matched: 0, status: 'invalid' },
];

let container: HTMLDivElement | null = null;

function installChrome(options: { items?: QuickStrategyItem[]; previewFails?: boolean } = {}): void {
  const items = options.items ?? quickItems;
  vi.stubGlobal('chrome', {
    runtime: {
      getManifest: () => ({ version: '0.0.0-test' }),
      sendMessage: vi.fn(async (request: { type: string; strategyId?: string }) => {
        if (request.type === 'state.get') return { ok: true, data: snapshot };
        if (request.type === 'cleanup.preview') {
          return options.previewFails === false
            ? {
                ok: true,
                data: {
                  matched: 3,
                  sample: [],
                  totalManagedTabs: 5,
                  strategyId: 'preset:standard',
                  strategyName: '标准',
                },
              }
            : { ok: false, error: 'UNSUPPORTED_FACT', message: 'paused' };
        }
        if (request.type === 'quick.preview') return { ok: true, data: items };
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
  setLocale('zh');
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

  it('localizes a built-in preset in the quick block and in the result', async () => {
    setLocale('en');
    installChrome({
      items: [{ strategyId: 'preset:standard', name: '标准', matched: 2, status: 'ready' }],
    });
    mount();

    await vi.waitFor(() =>
      expect(container?.querySelector('[data-testid="popup-quick-preset:standard"]')).not.toBeNull(),
    );
    const button = container?.querySelector('[data-testid="popup-quick-preset:standard"]');
    expect(button?.textContent).toContain('Standard');
    expect(button?.textContent).not.toContain('标准');

    click('popup-quick-preset:standard');
    await vi.waitFor(() => {
      expect(container?.textContent).toContain('Closed 3 tabs with "Standard"');
    });
  });

  it('keeps the count visible and explains why a button is disabled', async () => {
    setLocale('en');
    installChrome();
    mount();

    await vi.waitFor(() => expect(container?.querySelector('[data-testid="popup-quick-q0"]')).not.toBeNull());

    const empty = container?.querySelector('[data-testid="popup-quick-q0"]');
    expect(empty?.hasAttribute('disabled')).toBe(true);
    expect(container?.querySelector('[data-testid="popup-quick-count-q0"]')?.textContent).toBe('0 tabs');

    const invalid = container?.querySelector('[data-testid="popup-quick-qi"]');
    expect(invalid?.hasAttribute('disabled')).toBe(true);
    expect(container?.querySelector('[data-testid="popup-quick-count-qi"]')?.textContent).toBe('0 tabs');
    expect(container?.querySelector('[data-testid="popup-quick-reason-qi"]')?.textContent).toContain('Invalid rule');
    expect(invalid?.getAttribute('aria-label')).toContain('Invalid rule');
  });

  it('hides the block once the main flow asks for confirmation', async () => {
    setLocale('zh');
    installChrome({ previewFails: false });
    mount();

    await vi.waitFor(() => expect(container?.querySelector('[data-testid="cleanup-button"]')).not.toBeNull());
    expect(container?.querySelector('[data-testid="popup-quick-q1"]')).not.toBeNull();

    click('cleanup-button');
    await vi.waitFor(() => expect(container?.querySelector('[data-testid="confirm-cleanup"]')).not.toBeNull());
    expect(container?.querySelector('[data-testid="popup-quick-q1"]')).toBeNull();
  });
});
