import type { ErrorCode } from './errors';
import type {
  CleanupPreview,
  CleanupResult,
  HistoryQuery,
  HistoryQueryResult,
  RestoreOptions,
  RestoreResult,
  Settings,
  SettingsPatch,
  StateSnapshot,
  Strategy,
  TabListItem,
} from './types';

export type StrategyPreview = CleanupPreview & { signature: string };

export type Request =
  | { type: 'state.get' }
  | { type: 'cleanup.preview'; source: 'popup' | 'dashboard' }
  | { type: 'cleanup.run'; source: 'popup' | 'dashboard' }
  | { type: 'tabs.list' }
  | { type: 'history.query'; query: HistoryQuery }
  | { type: 'history.restore'; ids: string[]; options: RestoreOptions }
  | { type: 'history.delete'; ids: string[] }
  | { type: 'history.clear' }
  | { type: 'strategy.preview'; strategy: Strategy }
  | { type: 'strategy.save'; strategy: Strategy; previewSignature?: string }
  | { type: 'strategy.activate'; id: string }
  | { type: 'strategy.delete'; id: string }
  | { type: 'settings.update'; patch: SettingsPatch }
  | { type: 'debug.simulate-idle' };

export type Response<T> = { ok: true; data: T } | { ok: false; error: ErrorCode; message: string };

export type ResponseMap = {
  'state.get': StateSnapshot;
  'cleanup.preview': CleanupPreview;
  'cleanup.run': CleanupResult;
  'tabs.list': TabListItem[];
  'history.query': HistoryQueryResult;
  'history.restore': RestoreResult;
  'history.delete': null;
  'history.clear': null;
  'strategy.preview': StrategyPreview;
  'strategy.save': Strategy;
  'strategy.activate': null;
  'strategy.delete': null;
  'settings.update': Settings;
  'debug.simulate-idle': CleanupResult;
};
