import { describe, expect, it, vi } from 'vitest';
import { FakeBrowser } from './fake-browser';

describe('FakeBrowser', () => {
  it('creates, groups and removes tabs', async () => {
    const browser = new FakeBrowser();
    const a = await browser.createTab({ url: 'https://example.com/a', active: false });
    const b = await browser.createTab({ url: 'https://example.com/b', active: false });
    const groupId = await browser.groupTabs([a.id!, b.id!], { windowId: 1 });
    await browser.updateTabGroup(groupId, { title: '工作', color: 'blue' });
    expect((await browser.getTabGroups())[0]?.title).toBe('工作');

    await browser.removeTab(a.id!);
    expect(await browser.getTab(a.id!)).toBeNull();
    expect((await browser.queryTabs()).map((tab) => tab.id)).toEqual([b.id]);
  });

  it('emits idle, alarm and tab events', async () => {
    const browser = new FakeBrowser();
    const idle = vi.fn();
    const alarm = vi.fn();
    const removed = vi.fn();
    browser.onIdleStateChanged(idle);
    browser.onAlarm(alarm);
    browser.onTabRemoved(removed);

    browser.emitIdle('locked');
    browser.emitAlarm('tab-dormancy:locked');
    const tab = await browser.createTab({ url: 'https://example.com' });
    await browser.removeTab(tab.id!);

    expect(idle).toHaveBeenCalledWith('locked');
    expect(alarm).toHaveBeenCalledWith(expect.objectContaining({ name: 'tab-dormancy:locked' }));
    expect(removed).toHaveBeenCalledWith(tab.id);
    expect(await browser.queryIdleState(60)).toBe('locked');
  });
});
