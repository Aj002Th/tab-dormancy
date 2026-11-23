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
    quickStrategyIds: ['q1', 'q0', 'qi', 'q2'],
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
  { strategyId: 'q2', name: 'Docs', matched: 2, status: 'ready' },
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

function node(testId: string): Element | null {
  return container?.querySelector(`[data-testid="${testId}"]`) ?? null;
}

async function click(testId: string): Promise<void> {
  const target = node(testId);
  if (!(target instanceof HTMLElement)) throw new Error(`missing ${testId}`);
  target.click();
  await Promise.resolve();
}

async function pressEscape(testId: string): Promise<void> {
  node(testId)?.dispatchEvent(new KeyboardEvent('keydown', { key: 'Escape', bubbles: true }));
  await Promise.resolve();
}

async function ready(testId = 'popup-quick-clean-q1'): Promise<void> {
  await vi.waitFor(() => expect(node(testId)).not.toBeNull());
}

function ranAnything(): boolean {
  return vi
    .mocked(chrome.runtime.sendMessage)
    .mock.calls.some(([request]) => (request as { type?: string }).type === 'cleanup.run');
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

    await ready();
    expect(node('popup-quick-count-q1')?.textContent).toBe('3 个');
  });

  it('only expands on the first click and runs on confirm', async () => {
    setLocale('zh');
    installChrome();
    mount();

    await ready();
    await click('popup-quick-clean-q1');

    expect(node('popup-quick-confirm-q1')).not.toBeNull();
    expect(ranAnything()).toBe(false);

    await click('popup-quick-confirm-q1');
    await vi.waitFor(() => {
      expect(chrome.runtime.sendMessage).toHaveBeenCalledWith(
        expect.objectContaining({ type: 'cleanup.run', strategyId: 'q1' }),
      );
    });
    await vi.waitFor(() => {
      expect(container?.textContent).toContain('已用「Work」关闭 3 个标签');
    });
  });

  it('cancels the expansion without running anything', async () => {
    setLocale('zh');
    installChrome();
    mount();

    await ready();
    await click('popup-quick-clean-q1');
    await click('popup-quick-cancel-q1');

    expect(node('popup-quick-confirm-q1')).toBeNull();
    expect(ranAnything()).toBe(false);
  });

  it('closes the expansion on Escape', async () => {
    setLocale('zh');
    installChrome();
    mount();

    await ready();
    await click('popup-quick-clean-q1');
    await pressEscape('popup-quick-row-q1');

    expect(node('popup-quick-confirm-q1')).toBeNull();
    expect(ranAnything()).toBe(false);
  });

  it('keeps only one row expanded', async () => {
    setLocale('zh');
    installChrome();
    mount();

    await ready();
    await click('popup-quick-clean-q1');
    await click('popup-quick-clean-q2');

    expect(node('popup-quick-confirm-q1')).toBeNull();
    expect(node('popup-quick-confirm-q2')).not.toBeNull();
  });

  it('collapses when the block background is clicked', async () => {
    setLocale('zh');
    installChrome();
    mount();

    await ready();
    await click('popup-quick-clean-q1');
    node('popup-quick-title')?.dispatchEvent(new MouseEvent('click', { bubbles: true }));
    await Promise.resolve();

    expect(node('popup-quick-confirm-q1')).toBeNull();
  });

  it('localizes a built-in preset in the quick block and in the result', async () => {
    setLocale('en');
    installChrome({
      items: [{ strategyId: 'preset:standard', name: '标准', matched: 2, status: 'ready' }],
    });
    mount();

    await ready('popup-quick-clean-preset:standard');
    const clean = node('popup-quick-clean-preset:standard');
    expect(clean?.textContent).toContain('Clean');
    expect(container?.textContent).toContain('Standard');
    expect(container?.textContent).not.toContain('标准');

    await click('popup-quick-clean-preset:standard');
    await click('popup-quick-confirm-preset:standard');
    await vi.waitFor(() => {
      expect(container?.textContent).toContain('Closed 3 tabs with "Standard"');
    });
  });

  it('keeps the count visible and explains why a button is disabled', async () => {
    setLocale('en');
    installChrome();
    mount();

    await ready('popup-quick-clean-q0');

    const empty = node('popup-quick-clean-q0');
    expect(empty?.hasAttribute('disabled')).toBe(true);
    expect(node('popup-quick-count-q0')?.textContent).toBe('0 tabs');

    const invalid = node('popup-quick-clean-qi');
    expect(invalid?.hasAttribute('disabled')).toBe(true);
    expect(node('popup-quick-count-qi')?.textContent).toBe('0 tabs');
    expect(node('popup-quick-reason-qi')?.textContent).toContain('Invalid rule');
    expect(invalid?.getAttribute('aria-label')).toContain('Invalid rule');
  });

  it('hides the block once the main flow asks for confirmation', async () => {
    setLocale('zh');
    installChrome({ previewFails: false });
    mount();

    await vi.waitFor(() => expect(node('cleanup-button')).not.toBeNull());
    expect(node('popup-quick-clean-q1')).not.toBeNull();

    await click('cleanup-button');
    await vi.waitFor(() => expect(node('confirm-cleanup')).not.toBeNull());
    expect(node('popup-quick-clean-q1')).toBeNull();
  });
});
