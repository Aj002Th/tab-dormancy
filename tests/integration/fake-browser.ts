import type { Browser, Unsubscribe } from '../../src/platform/browser';
import { MemoryStorage } from '../helpers/memory-storage';

class Emitter<T> {
  private readonly listeners = new Set<(value: T) => void>();

  add(listener: (value: T) => void): Unsubscribe {
    this.listeners.add(listener);
    return () => this.listeners.delete(listener);
  }

  emit(value: T): void {
    for (const listener of this.listeners) listener(value);
  }
}

export class FakeBrowser implements Browser {
  tabs: chrome.tabs.Tab[] = [];
  windows: chrome.windows.Window[] = [
    { id: 1, type: 'normal', incognito: false, focused: true } as chrome.windows.Window,
  ];
  groups: chrome.tabGroups.TabGroup[] = [];
  storageLocal = new MemoryStorage();
  storageSession = new MemoryStorage();
  detectionInterval = 60;
  idleState: chrome.idle.IdleState = 'active';
  alarms = new Map<string, chrome.alarms.AlarmCreateInfo>();
  restoredSessions = new Map<string, chrome.sessions.Session>();

  private nextTabId = 1;
  private nextWindowId = 2;
  private nextGroupId = 1;
  private idleEmitter = new Emitter<chrome.idle.IdleState>();
  private alarmEmitter = new Emitter<chrome.alarms.Alarm>();
  private installedEmitter = new Emitter<void>();
  private startupEmitter = new Emitter<void>();
  private activatedEmitter = new Emitter<chrome.tabs.TabActiveInfo>();
  private removedEmitter = new Emitter<number>();
  private focusEmitter = new Emitter<number>();

  addTab(partial: Partial<chrome.tabs.Tab> & { url: string }): chrome.tabs.Tab {
    const windowId = partial.windowId ?? 1;
    const tab = {
      id: this.nextTabId++,
      windowId,
      index: this.tabs.filter((item) => item.windowId === windowId).length,
      title: partial.url,
      pinned: false,
      audible: false,
      active: false,
      mutedInfo: { muted: false },
      discarded: false,
      groupId: -1,
      lastAccessed: Date.now(),
      ...partial,
    } as chrome.tabs.Tab;
    this.tabs.push(tab);
    return tab;
  }

  addWindow(partial: Partial<chrome.windows.Window> = {}): chrome.windows.Window {
    const window = {
      id: this.nextWindowId++,
      type: 'normal',
      incognito: false,
      focused: false,
      ...partial,
    } as chrome.windows.Window;
    this.windows.push(window);
    return window;
  }

  async queryTabs(): Promise<chrome.tabs.Tab[]> {
    return this.tabs.map((tab) => ({ ...tab }));
  }

  async getTab(tabId: number): Promise<chrome.tabs.Tab | null> {
    return this.tabs.find((tab) => tab.id === tabId) ?? null;
  }

  async removeTab(tabId: number): Promise<void> {
    const before = this.tabs.length;
    this.tabs = this.tabs.filter((tab) => tab.id !== tabId);
    if (this.tabs.length === before) throw new Error(`No tab with id: ${tabId}`);
    this.removedEmitter.emit(tabId);
  }

  async createTab(properties: chrome.tabs.CreateProperties): Promise<chrome.tabs.Tab> {
    const tab = this.addTab({
      url: properties.url ?? 'about:blank',
      windowId: properties.windowId ?? 1,
      active: properties.active ?? false,
      pinned: properties.pinned ?? false,
    });
    if (properties.index !== undefined) tab.index = properties.index;
    return tab;
  }

  async groupTabs(tabIds: number[], createProperties?: { windowId?: number }): Promise<number> {
    const id = this.nextGroupId++;
    const windowId = createProperties?.windowId ?? this.tabs.find((tab) => tab.id === tabIds[0])?.windowId ?? 1;
    this.groups.push({ id, title: '', color: 'grey', collapsed: false, windowId } as chrome.tabGroups.TabGroup);
    for (const tab of this.tabs) {
      if (tabIds.includes(tab.id ?? -1)) tab.groupId = id;
    }
    return id;
  }

  async updateTabGroup(groupId: number, properties: chrome.tabGroups.UpdateProperties): Promise<void> {
    const group = this.groups.find((item) => item.id === groupId);
    if (!group) throw new Error(`No group with id: ${groupId}`);
    Object.assign(group, properties);
  }

  async getWindows(): Promise<chrome.windows.Window[]> {
    return this.windows.map((window) => ({ ...window }));
  }

  async getLastFocusedWindow(): Promise<chrome.windows.Window> {
    const focused = this.windows.find((window) => window.focused) ?? this.windows[0];
    if (!focused) throw new Error('No window');
    return { ...focused };
  }

  async createWindow(data: chrome.windows.CreateData): Promise<chrome.windows.Window> {
    const window = this.addWindow({ focused: data.focused ?? false });
    if (data.url) {
      const url = Array.isArray(data.url) ? data.url[0]! : data.url;
      this.addTab({ url, windowId: window.id });
    }
    return { ...window };
  }

  async getTabGroups(): Promise<chrome.tabGroups.TabGroup[]> {
    return this.groups.map((group) => ({ ...group }));
  }

  setIdleDetectionInterval(seconds: number): void {
    this.detectionInterval = seconds;
  }

  async queryIdleState(_thresholdSeconds: number): Promise<chrome.idle.IdleState> {
    return this.idleState;
  }

  async createAlarm(name: string, info: chrome.alarms.AlarmCreateInfo): Promise<void> {
    this.alarms.set(name, info);
  }

  async clearAlarm(name: string): Promise<void> {
    this.alarms.delete(name);
  }

  async restoreSession(sessionId: string): Promise<chrome.sessions.Session> {
    const session = this.restoredSessions.get(sessionId);
    if (!session) throw new Error('Session not found');
    return session;
  }

  getURL(path: string): string {
    return `chrome-extension://fake/${path}`;
  }

  async openOptionsPage(): Promise<void> {}

  onIdleStateChanged(listener: (state: chrome.idle.IdleState) => void): Unsubscribe {
    return this.idleEmitter.add(listener);
  }

  onAlarm(listener: (alarm: chrome.alarms.Alarm) => void): Unsubscribe {
    return this.alarmEmitter.add(listener);
  }

  onInstalled(listener: () => void): Unsubscribe {
    return this.installedEmitter.add(listener);
  }

  onStartup(listener: () => void): Unsubscribe {
    return this.startupEmitter.add(listener);
  }

  onTabActivated(listener: (info: chrome.tabs.TabActiveInfo) => void): Unsubscribe {
    return this.activatedEmitter.add(listener);
  }

  onTabRemoved(listener: (tabId: number) => void): Unsubscribe {
    return this.removedEmitter.add(listener);
  }

  onWindowFocusChanged(listener: (windowId: number) => void): Unsubscribe {
    return this.focusEmitter.add(listener);
  }

  emitIdle(state: chrome.idle.IdleState): void {
    this.idleState = state;
    this.idleEmitter.emit(state);
  }

  emitAlarm(name: string): void {
    this.alarmEmitter.emit({ name, scheduledTime: 0 } as chrome.alarms.Alarm);
  }

  emitInstalled(): void {
    this.installedEmitter.emit();
  }

  emitStartup(): void {
    this.startupEmitter.emit();
  }

  emitTabActivated(tabId: number, windowId = 1): void {
    this.activatedEmitter.emit({ tabId, windowId });
  }

  emitWindowFocusChanged(windowId: number): void {
    this.focusEmitter.emit(windowId);
  }
}
