import type { Browser, Unsubscribe } from './browser';
import type { StorageArea } from './storage';

class ChromeStorage implements StorageArea {
  constructor(private readonly area: chrome.storage.StorageArea) {}

  async get(keys?: string | string[] | null): Promise<Record<string, unknown>> {
    return this.area.get(keys ?? null);
  }

  async set(items: Record<string, unknown>): Promise<void> {
    await this.area.set(items);
  }

  async remove(keys: string | string[]): Promise<void> {
    await this.area.remove(keys);
  }

  async clear(): Promise<void> {
    await this.area.clear();
  }
}

export class ChromeBrowser implements Browser {
  readonly storageLocal = new ChromeStorage(chrome.storage.local);
  readonly storageSession = new ChromeStorage(chrome.storage.session);

  queryTabs(): Promise<chrome.tabs.Tab[]> {
    return chrome.tabs.query({});
  }

  async getTab(tabId: number): Promise<chrome.tabs.Tab | null> {
    try {
      return await chrome.tabs.get(tabId);
    } catch {
      return null;
    }
  }

  async removeTab(tabId: number): Promise<void> {
    await chrome.tabs.remove(tabId);
  }

  createTab(properties: chrome.tabs.CreateProperties): Promise<chrome.tabs.Tab> {
    return chrome.tabs.create(properties);
  }

  groupTabs(tabIds: number[], createProperties?: { windowId?: number }): Promise<number> {
    return chrome.tabs.group(createProperties ? { tabIds, createProperties } : { tabIds });
  }

  async updateTabGroup(groupId: number, properties: chrome.tabGroups.UpdateProperties): Promise<void> {
    await chrome.tabGroups.update(groupId, properties);
  }

  getWindows(): Promise<chrome.windows.Window[]> {
    return chrome.windows.getAll({ populate: false });
  }

  getLastFocusedWindow(): Promise<chrome.windows.Window> {
    return chrome.windows.getLastFocused({ windowTypes: ['normal'] });
  }

  createWindow(data: chrome.windows.CreateData): Promise<chrome.windows.Window> {
    return chrome.windows.create(data);
  }

  getTabGroups(): Promise<chrome.tabGroups.TabGroup[]> {
    return chrome.tabGroups.query({});
  }

  setIdleDetectionInterval(seconds: number): void {
    chrome.idle.setDetectionInterval(seconds);
  }

  queryIdleState(thresholdSeconds: number): Promise<chrome.idle.IdleState> {
    return chrome.idle.queryState(thresholdSeconds);
  }

  async createAlarm(name: string, info: chrome.alarms.AlarmCreateInfo): Promise<void> {
    await chrome.alarms.create(name, info);
  }

  async clearAlarm(name: string): Promise<void> {
    await chrome.alarms.clear(name);
  }

  restoreSession(sessionId: string): Promise<chrome.sessions.Session> {
    return chrome.sessions.restore(sessionId);
  }

  getURL(path: string): string {
    return chrome.runtime.getURL(path);
  }

  openOptionsPage(): Promise<void> {
    return chrome.runtime.openOptionsPage();
  }

  onIdleStateChanged(listener: (state: chrome.idle.IdleState) => void): Unsubscribe {
    chrome.idle.onStateChanged.addListener(listener);
    return () => chrome.idle.onStateChanged.removeListener(listener);
  }

  onAlarm(listener: (alarm: chrome.alarms.Alarm) => void): Unsubscribe {
    chrome.alarms.onAlarm.addListener(listener);
    return () => chrome.alarms.onAlarm.removeListener(listener);
  }

  onInstalled(listener: () => void): Unsubscribe {
    const wrapped = () => listener();
    chrome.runtime.onInstalled.addListener(wrapped);
    return () => chrome.runtime.onInstalled.removeListener(wrapped);
  }

  onStartup(listener: () => void): Unsubscribe {
    chrome.runtime.onStartup.addListener(listener);
    return () => chrome.runtime.onStartup.removeListener(listener);
  }

  onTabActivated(listener: (info: chrome.tabs.TabActiveInfo) => void): Unsubscribe {
    chrome.tabs.onActivated.addListener(listener);
    return () => chrome.tabs.onActivated.removeListener(listener);
  }

  onTabRemoved(listener: (tabId: number) => void): Unsubscribe {
    const wrapped = (tabId: number) => listener(tabId);
    chrome.tabs.onRemoved.addListener(wrapped);
    return () => chrome.tabs.onRemoved.removeListener(wrapped);
  }

  onWindowFocusChanged(listener: (windowId: number) => void): Unsubscribe {
    chrome.windows.onFocusChanged.addListener(listener);
    return () => chrome.windows.onFocusChanged.removeListener(listener);
  }
}
