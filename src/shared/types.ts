export type Trigger = 'idle' | 'locked' | 'manual';

export type FactKey =
  | 'lastActiveMinutes'
  | 'totalTabCount'
  | 'windowTabCount'
  | 'pinned'
  | 'audible'
  | 'active'
  | 'muted'
  | 'discarded'
  | 'frozen'
  | 'grouped'
  | 'groupCollapsed'
  | 'windowFocused'
  | 'onlyTabInWindow'
  | 'domain'
  | 'url'
  | 'title'
  | 'groupTitle';

export type Operator =
  | 'gt'
  | 'gte'
  | 'lt'
  | 'lte'
  | 'eq'
  | 'neq'
  | 'is'
  | 'equals'
  | 'contains'
  | 'startsWith'
  | 'endsWith'
  | 'matchesDomain'
  | 'inDomainList'
  | 'matchesGlob';

export type FactValue = string | number | boolean | string[];

export type Expr =
  | { type: 'all'; id: string; children: Expr[] }
  | { type: 'any'; id: string; children: Expr[] }
  | { type: 'not'; id: string; child: Expr }
  | { type: 'condition'; id: string; fact: FactKey; op: Operator; value?: FactValue };

export type Strategy = {
  id: string;
  name: string;
  builtin: boolean;
  expression: Expr;
  createdAt: number;
  updatedAt: number;
  lastPreviewHash: string | null;
  lastPreviewAt: number | null;
};

export type Theme = 'system' | 'light' | 'dark';

export type Language = 'system' | 'zh' | 'en';
export type Locale = 'zh' | 'en';

export type Settings = {
  idleThresholdMinutes: number;
  lockCleanupEnabled: boolean;
  lockDelayMinutes: number;
  historyRetentionDays: number;
  historyMaxRecords: number;
  activeStrategyId: string;
  theme: Theme;
  language: Language;
};

export type SettingsPatch = Partial<Omit<Settings, 'activeStrategyId'>>;

export type TabFacts = {
  tabId: number;
  windowId: number;
  url: string;
  title: string;
  domain: string;
  lastActiveMinutes: number | null;
  totalTabCount: number;
  windowTabCount: number;
  pinned: boolean;
  audible: boolean;
  active: boolean;
  muted: boolean;
  discarded: boolean;
  frozen: boolean;
  grouped: boolean;
  groupCollapsed: boolean;
  windowFocused: boolean;
  onlyTabInWindow: boolean;
  groupTitle: string;
};

export type Capabilities = {
  chromeMajor: number | null;
  lastAccessed: boolean;
  frozen: boolean;
  tabGroups: boolean;
  sessions: boolean;
};

export type ClosedTabSummary = {
  id: string;
  url: string;
  title: string;
  domain: string;
  closedAt: number;
  trigger: Trigger;
  status: 'pending' | 'closed';
  restoredAt: number | null;
  strategyId?: string;
  strategyName?: string;
};

export type ClosedTabRecord = ClosedTabSummary & {
  strategyId: string;
  strategyName: string;
  browserSessionId: string;
  windowId: number;
  groupId: number;
  groupTitle: string;
  groupColor: string;
  groupCollapsed: boolean;
  pinned: boolean;
  index: number;
  sessionId: string | null;
  recovered: boolean;
};

export type LastCleanup = {
  at: number;
  trigger: Trigger;
  closed: number;
  failed: number;
  skipped: number;
  durationMs: number;
  recordIds: string[];
};

export type TraceNode = {
  nodeId: string;
  type: Expr['type'];
  result: boolean;
  fact?: FactKey;
  actual?: FactValue | null;
  expected?: FactValue;
  reason?: 'matched' | 'not-matched' | 'unknown' | 'unsupported';
};

export type Evaluation = {
  matched: boolean;
  trace: TraceNode[];
};

export type PlannedTab = {
  tabId: number;
  windowId: number;
  url: string;
  title: string;
  domain: string;
  groupId: number;
  groupTitle: string;
  groupColor: string;
  groupCollapsed: boolean;
  pinned: boolean;
  index: number;
  sessionId: string | null;
  facts: TabFacts;
  trace: TraceNode[];
};

export type CleanupPlan = {
  matched: PlannedTab[];
  kept: PlannedTab[];
  totalManagedTabs: number;
};

export type CleanupResult = {
  runId: string;
  trigger: Trigger;
  closed: number;
  failed: number;
  skipped: number;
  durationMs: number;
  recordIds: string[];
  failures: Array<{ tabId: number; title: string; reason: string }>;
};

export type TabListItem = {
  tab: chrome.tabs.Tab;
  facts: TabFacts;
  matched: boolean;
  trace: TraceNode[];
};

export type HistoryQuery = {
  query?: string;
  trigger?: Trigger;
  restored?: boolean;
  page: number;
  pageSize: number;
};

export type HistoryQueryResult = {
  items: ClosedTabSummary[];
  total: number;
  page: number;
  pageSize: number;
  retention: {
    days: number;
    maxRecords: number;
  };
};

export type RestoreOptions = {
  mode: 'current-window' | 'original-window-groups';
  complete: boolean;
};

export type RestoreResult = {
  restored: number;
  failed: Array<{ id: string; url: string; reason: string }>;
};

export type CleanupPreview = {
  matched: number;
  sample: Array<{ tabId: number; title: string; url: string; trace: TraceNode[] }>;
  totalManagedTabs: number;
  strategyId: string;
  strategyName: string;
};

export type StateSnapshot = {
  settings: Settings;
  strategies: Strategy[];
  activeStrategy: Strategy;
  lastCleanup: LastCleanup | null;
  capabilities: Capabilities;
  warnings: string[];
};

export type CleanupLock = {
  runId: string;
  startedAt: number;
};

export type CleanupRun = {
  id: string;
  startedAt: number;
  trigger: Trigger;
  strategyId: string;
  browserSessionId: string;
  drafts: ClosedTabRecord[];
};

export type Meta = {
  schemaVersion: number;
  installedAt?: number;
};
