import { DEFAULT_LANGUAGE } from './language';
import { DEFAULT_THEME } from './theme';
import type { Settings } from './types';

export const SCHEMA_VERSION = 1;

export const ALARM_LOCKED = 'tab-dormancy:locked';

export const TAB_GROUP_ID_NONE = -1;

export const STORAGE_KEYS = {
  meta: 'meta',
  settings: 'settings',
  strategies: 'strategies',
  historyIndex: 'history:index',
  cleanupLock: 'cleanup:lock',
  cleanupRun: 'cleanup:run',
  lastCleanup: 'lastCleanup',
  browserSessionId: 'browserSessionId',
  historyItemPrefix: 'history:item:',
  chaosPrefix: 'corrupt:',
} as const;

export const DEFAULT_SETTINGS: Settings = {
  idleThresholdMinutes: 15,
  lockCleanupEnabled: true,
  lockDelayMinutes: 15,
  historyRetentionDays: 30,
  historyMaxRecords: 5_000,
  activeStrategyId: 'preset:standard',
  theme: DEFAULT_THEME,
  language: DEFAULT_LANGUAGE,
};

export const LIMITS = {
  maxDepth: 8,
  maxNodes: 200,
  maxChildren: 20,
  maxStringLength: 512,
  maxDomainList: 50,
  maxNumber: 525_600,
  maxHistory: 5_000,
  historyPageSize: 50,
  cleanupConcurrency: 4,
  lockStaleMs: 120_000,
  pendingRunStaleMs: 300_000,
  strategyNameLength: 80,
} as const;
