import { describe, expect, it, vi } from 'vitest';
import { TabDormancyService } from '../../src/background/service';
import { registerTriggers } from '../../src/background/triggers';
import { Repo } from '../../src/platform/storage';
import { ALARM_LOCKED } from '../../src/shared/constants';
import { defined } from '../helpers/assert-defined';
import { FakeBrowser } from './fake-browser';

const now = 1_000_000_000;
const minute = 60_000;

async function setup() {
  const browser = new FakeBrowser();
  const repo = new Repo(browser.storageLocal, browser.storageSession, () => now);
  const service = new TabDormancyService({
    browser,
    repo,
    now: () => now,
    id: () => `id-${Math.random()}`,
    userAgent: () => 'Mozilla/5.0 Chrome/132.0.0.0',
  });
  await service.bootstrap();
  registerTriggers(browser, service);
  return { browser, service };
}

function oldTab(browser: FakeBrowser) {
  browser.addTab({ url: 'https://example.com/recent', lastAccessed: now - 10 * minute });
  return browser.addTab({ url: 'https://example.com/old', lastAccessed: now - 5_000 * minute });
}

describe('triggers', () => {
  it('runs cleanup immediately on idle', async () => {
    const { browser } = await setup();
    const tab = oldTab(browser);
    browser.emitIdle('idle');
    await vi.waitFor(async () => {
      expect(await browser.getTab(defined(tab.id, 'tab id'))).toBeNull();
    });
  });

  it('schedules a one-shot lock alarm and cancels it on active', async () => {
    const { browser } = await setup();
    browser.emitIdle('locked');
    await vi.waitFor(() => expect(browser.alarms.has(ALARM_LOCKED)).toBe(true));
    browser.emitIdle('active');
    await vi.waitFor(() => expect(browser.alarms.has(ALARM_LOCKED)).toBe(false));
  });

  it('runs cleanup on the lock alarm only while still idle or locked', async () => {
    const { browser } = await setup();
    const tab = oldTab(browser);
    browser.emitIdle('locked');
    await vi.waitFor(() => expect(browser.alarms.has(ALARM_LOCKED)).toBe(true));
    browser.emitAlarm(ALARM_LOCKED);
    await vi.waitFor(async () => {
      expect(await browser.getTab(defined(tab.id, 'tab id'))).toBeNull();
    });
  });

  it('does not clean on a stale alarm after the user became active', async () => {
    const { browser } = await setup();
    const tab = oldTab(browser);
    browser.emitIdle('active');
    browser.emitAlarm(ALARM_LOCKED);
    await new Promise((resolve) => setTimeout(resolve, 10));
    expect(await browser.getTab(defined(tab.id, 'tab id'))).not.toBeNull();
  });
});
