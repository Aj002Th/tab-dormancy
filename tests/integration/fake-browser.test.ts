import { describe, expect, it, vi } from 'vitest';
import { defined } from '../helpers/assert-defined';
import { FakeBrowser } from './fake-browser';

describe('FakeBrowser', () => {
  it('creates, groups and removes tabs', async () => {
    const browser = new FakeBrowser();
    const a = await browser.createTab({ url: 'https://example.com/a', active: false });
    const b = await browser.createTab({ url: 'https://example.com/b', active: false });
    const groupId = await browser.groupTabs([defined(a.id, 'tab a id'), defined(b.id, 'tab b id')], { windowId: 1 });
    await browser.updateTabGroup(groupId, { title: '工作', color: 'blue' });
    expect((await browser.getTabGroups())[0]?.title).toBe('工作');

    await browser.removeTab(defined(a.id, 'tab a id'));
    expect(await browser.getTab(defined(a.id, 'tab a id'))).toBeNull();
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
    await browser.removeTab(defined(tab.id, 'tab id'));

    expect(idle).toHaveBeenCalledWith('locked');
    expect(alarm).toHaveBeenCalledWith(expect.objectContaining({ name: 'tab-dormancy:locked' }));
    expect(removed).toHaveBeenCalledWith(tab.id);
    expect(await browser.queryIdleState(60)).toBe('locked');
  });
});
