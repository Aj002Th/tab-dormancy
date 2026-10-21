import { DEFAULT_SETTINGS, STORAGE_KEYS } from '../shared/constants';
import type {
  CleanupLock,
  CleanupRun,
  ClosedTabRecord,
  ClosedTabSummary,
  LastCleanup,
  Meta,
  Settings,
  Strategy,
} from '../shared/types';

export interface StorageArea {
  get(keys?: string | string[] | null): Promise<Record<string, unknown>>;
  set(items: Record<string, unknown>): Promise<void>;
  remove(keys: string | string[]): Promise<void>;
  clear(): Promise<void>;
}

export class Repo {
  constructor(
    private readonly local: StorageArea,
    private readonly session: StorageArea,
    private readonly now: () => number = Date.now,
  ) {}

  async getMeta(): Promise<Meta | null> {
    const value = (await this.local.get(STORAGE_KEYS.meta))[STORAGE_KEYS.meta];
    return isMeta(value) ? value : null;
  }

  async setMeta(meta: Meta): Promise<void> {
    await this.local.set({ [STORAGE_KEYS.meta]: meta });
  }

  async getSettings(): Promise<Settings> {
    const value = (await this.local.get(STORAGE_KEYS.settings))[STORAGE_KEYS.settings];
    if (isSettings(value)) return value;
    if (value !== undefined) await this.backupCorrupt(STORAGE_KEYS.settings, value);
    await this.local.set({ [STORAGE_KEYS.settings]: DEFAULT_SETTINGS });
    return DEFAULT_SETTINGS;
  }

  async setSettings(settings: Settings): Promise<void> {
    await this.local.set({ [STORAGE_KEYS.settings]: settings });
  }

  async getStrategies(): Promise<Strategy[]> {
    const value = (await this.local.get(STORAGE_KEYS.strategies))[STORAGE_KEYS.strategies];
    if (Array.isArray(value) && value.every(isStrategy)) return value;
    if (value !== undefined) await this.backupCorrupt(STORAGE_KEYS.strategies, value);
    return [];
  }

  async setStrategies(strategies: Strategy[]): Promise<void> {
    await this.local.set({ [STORAGE_KEYS.strategies]: strategies });
  }

  async getHistoryIndex(): Promise<ClosedTabSummary[]> {
    const value = (await this.local.get(STORAGE_KEYS.historyIndex))[STORAGE_KEYS.historyIndex];
    if (Array.isArray(value) && value.every(isSummary)) return value;
    if (value !== undefined) await this.backupCorrupt(STORAGE_KEYS.historyIndex, value);
    return [];
  }

  async setHistoryIndex(index: ClosedTabSummary[]): Promise<void> {
    await this.local.set({ [STORAGE_KEYS.historyIndex]: index });
  }

  async getHistoryRecords(ids: string[]): Promise<ClosedTabRecord[]> {
    if (ids.length === 0) return [];
    const keys = ids.map((id) => `${STORAGE_KEYS.historyItemPrefix}${id}`);
    const raw = await this.local.get(keys);
    const records: ClosedTabRecord[] = [];
    for (const key of keys) {
      const value = raw[key];
      if (isRecord(value)) records.push(value);
      else if (value !== undefined) await this.backupCorrupt(key, value);
    }
    return records;
  }

  async setHistoryRecords(records: ClosedTabRecord[]): Promise<void> {
    const items: Record<string, unknown> = {};
    for (const record of records) items[`${STORAGE_KEYS.historyItemPrefix}${record.id}`] = record;
    await this.local.set(items);
  }

  async deleteHistoryRecords(ids: string[]): Promise<void> {
    if (ids.length === 0) return;
    await this.local.remove(ids.map((id) => `${STORAGE_KEYS.historyItemPrefix}${id}`));
  }

  async getCleanupLock(): Promise<CleanupLock | null> {
    const value = (await this.local.get(STORAGE_KEYS.cleanupLock))[STORAGE_KEYS.cleanupLock];
    return isLock(value) ? value : null;
  }

  async setCleanupLock(lock: CleanupLock): Promise<void> {
    await this.local.set({ [STORAGE_KEYS.cleanupLock]: lock });
  }

  async clearCleanupLock(): Promise<void> {
    await this.local.remove(STORAGE_KEYS.cleanupLock);
  }

  async getCleanupRun(): Promise<CleanupRun | null> {
    const value = (await this.local.get(STORAGE_KEYS.cleanupRun))[STORAGE_KEYS.cleanupRun];
    return isRun(value) ? value : null;
  }

  async setCleanupRun(run: CleanupRun): Promise<void> {
    await this.local.set({ [STORAGE_KEYS.cleanupRun]: run });
  }

  async clearCleanupRun(): Promise<void> {
    await this.local.remove(STORAGE_KEYS.cleanupRun);
  }

  async getLastCleanup(): Promise<LastCleanup | null> {
    const value = (await this.local.get(STORAGE_KEYS.lastCleanup))[STORAGE_KEYS.lastCleanup];
    return isLastCleanup(value) ? value : null;
  }

  async setLastCleanup(lastCleanup: LastCleanup): Promise<void> {
    await this.local.set({ [STORAGE_KEYS.lastCleanup]: lastCleanup });
  }

  async getBrowserSessionId(): Promise<string | null> {
    const value = (await this.session.get(STORAGE_KEYS.browserSessionId))[STORAGE_KEYS.browserSessionId];
    return typeof value === 'string' && value.length > 0 ? value : null;
  }

  async setBrowserSessionId(id: string): Promise<void> {
    await this.session.set({ [STORAGE_KEYS.browserSessionId]: id });
  }

  private async backupCorrupt(key: string, value: unknown): Promise<void> {
    const backupKey = `${STORAGE_KEYS.chaosPrefix}${this.now()}:${encodeURIComponent(key)}`;
    await this.local.set({ [backupKey]: value });
  }
}

function isSettings(value: unknown): value is Settings {
  if (!value || typeof value !== 'object') return false;
  const settings = value as Record<string, unknown>;
  return (
    typeof settings.idleThresholdMinutes === 'number' &&
    typeof settings.lockCleanupEnabled === 'boolean' &&
    typeof settings.lockDelayMinutes === 'number' &&
    typeof settings.historyRetentionDays === 'number' &&
    typeof settings.activeStrategyId === 'string'
  );
}

function isStrategy(value: unknown): value is Strategy {
  if (!value || typeof value !== 'object') return false;
  const strategy = value as Record<string, unknown>;
  return (
    typeof strategy.id === 'string' &&
    typeof strategy.name === 'string' &&
    typeof strategy.builtin === 'boolean' &&
    !!strategy.expression &&
    typeof strategy.expression === 'object' &&
    typeof strategy.createdAt === 'number' &&
    typeof strategy.updatedAt === 'number' &&
    (strategy.lastPreviewHash === null || typeof strategy.lastPreviewHash === 'string') &&
    (strategy.lastPreviewAt === null || typeof strategy.lastPreviewAt === 'number')
  );
}

function isSummary(value: unknown): value is ClosedTabSummary {
  if (!value || typeof value !== 'object') return false;
  const item = value as Record<string, unknown>;
  return (
    typeof item.id === 'string' &&
    typeof item.url === 'string' &&
    typeof item.title === 'string' &&
    typeof item.domain === 'string' &&
    typeof item.closedAt === 'number' &&
    (item.trigger === 'idle' || item.trigger === 'locked' || item.trigger === 'manual') &&
    (item.status === 'pending' || item.status === 'closed') &&
    (item.restoredAt === null || typeof item.restoredAt === 'number')
  );
}

function isRecord(value: unknown): value is ClosedTabRecord {
  if (!isSummary(value)) return false;
  const item = value as Record<string, unknown>;
  return (
    typeof item.strategyId === 'string' &&
    typeof item.strategyName === 'string' &&
    typeof item.browserSessionId === 'string' &&
    typeof item.windowId === 'number' &&
    typeof item.groupId === 'number' &&
    typeof item.groupTitle === 'string' &&
    typeof item.groupColor === 'string' &&
    typeof item.groupCollapsed === 'boolean' &&
    typeof item.pinned === 'boolean' &&
    typeof item.index === 'number' &&
    (item.sessionId === null || typeof item.sessionId === 'string') &&
    typeof item.recovered === 'boolean'
  );
}

function isLock(value: unknown): value is CleanupLock {
  if (!value || typeof value !== 'object') return false;
  const lock = value as Record<string, unknown>;
  return typeof lock.runId === 'string' && typeof lock.startedAt === 'number';
}

function isRun(value: unknown): value is CleanupRun {
  if (!value || typeof value !== 'object') return false;
  const run = value as Record<string, unknown>;
  return (
    typeof run.id === 'string' &&
    typeof run.startedAt === 'number' &&
    (run.trigger === 'idle' || run.trigger === 'locked' || run.trigger === 'manual') &&
    typeof run.strategyId === 'string' &&
    typeof run.browserSessionId === 'string' &&
    Array.isArray(run.drafts) &&
    run.drafts.every(isRecord)
  );
}

function isLastCleanup(value: unknown): value is LastCleanup {
  if (!value || typeof value !== 'object') return false;
  const item = value as Record<string, unknown>;
  return (
    typeof item.at === 'number' &&
    (item.trigger === 'idle' || item.trigger === 'locked' || item.trigger === 'manual') &&
    typeof item.closed === 'number' &&
    typeof item.failed === 'number' &&
    typeof item.skipped === 'number' &&
    typeof item.durationMs === 'number' &&
    Array.isArray(item.recordIds) &&
    item.recordIds.every((id) => typeof id === 'string')
  );
}

function isMeta(value: unknown): value is Meta {
  if (!value || typeof value !== 'object') return false;
  return typeof (value as Record<string, unknown>).schemaVersion === 'number';
}
