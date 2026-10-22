import type { StorageArea } from './storage';

export type Unsubscribe = () => void;

export interface Browser {
  queryTabs(): Promise<chrome.tabs.Tab[]>;
  getTab(tabId: number): Promise<chrome.tabs.Tab | null>;
  removeTab(tabId: number): Promise<void>;
  createTab(properties: chrome.tabs.CreateProperties): Promise<chrome.tabs.Tab>;
  groupTabs(tabIds: number[], createProperties?: { windowId?: number }): Promise<number>;
  updateTabGroup(groupId: number, properties: chrome.tabGroups.UpdateProperties): Promise<void>;
  getWindows(): Promise<chrome.windows.Window[]>;
  getLastFocusedWindow(): Promise<chrome.windows.Window>;
  createWindow(data: chrome.windows.CreateData): Promise<chrome.windows.Window>;
  getTabGroups(): Promise<chrome.tabGroups.TabGroup[]>;
  setIdleDetectionInterval(seconds: number): void;
  queryIdleState(thresholdSeconds: number): Promise<chrome.idle.IdleState>;
  createAlarm(name: string, info: chrome.alarms.AlarmCreateInfo): Promise<void>;
  clearAlarm(name: string): Promise<void>;
  restoreSession(sessionId: string): Promise<chrome.sessions.Session>;
  getURL(path: string): string;
  openOptionsPage(): Promise<void>;
  storageLocal: StorageArea;
  storageSession: StorageArea;
  onIdleStateChanged(listener: (state: chrome.idle.IdleState) => void): Unsubscribe;
  onAlarm(listener: (alarm: chrome.alarms.Alarm) => void): Unsubscribe;
  onInstalled(listener: () => void): Unsubscribe;
  onStartup(listener: () => void): Unsubscribe;
  onTabActivated(listener: (info: chrome.tabs.TabActiveInfo) => void): Unsubscribe;
  onTabRemoved(listener: (tabId: number) => void): Unsubscribe;
  onWindowFocusChanged(listener: (windowId: number) => void): Unsubscribe;
}
