import { LIMITS } from '../shared/constants';
import { isLanguage } from '../shared/language';
import { isTheme } from '../shared/theme';
import type { ConfigBundle, Expr, Settings, Strategy } from '../shared/types';
import { validateExpr } from './rules/validate';

export const CONFIG_APP = 'tab-dormancy';
export const CONFIG_VERSION = 1;

export type ConfigIssue =
  | 'BAD_FORMAT'
  | 'UNSUPPORTED_VERSION'
  | 'BAD_SETTINGS'
  | 'BAD_STRATEGY'
  | 'TOO_MANY_STRATEGIES';

export type ConfigParseResult = { ok: true; bundle: ConfigBundle } | { ok: false; issue: ConfigIssue };

export function createConfigBundle(settings: Settings, strategies: Strategy[], now: number): ConfigBundle {
  return {
    app: CONFIG_APP,
    schemaVersion: CONFIG_VERSION,
    exportedAt: now,
    settings,
    strategies: strategies.filter((strategy) => !strategy.builtin),
  };
}

export function parseConfigBundle(value: unknown): ConfigParseResult {
  if (!isRecord(value) || value.app !== CONFIG_APP || typeof value.schemaVersion !== 'number') {
    return { ok: false, issue: 'BAD_FORMAT' };
  }
  if (!Number.isInteger(value.schemaVersion) || value.schemaVersion < 1) {
    return { ok: false, issue: 'BAD_FORMAT' };
  }
  if (value.schemaVersion > CONFIG_VERSION) {
    return { ok: false, issue: 'UNSUPPORTED_VERSION' };
  }
  const settings = parseSettings(value.settings);
  if (!settings) return { ok: false, issue: 'BAD_SETTINGS' };
  if (!Array.isArray(value.strategies)) return { ok: false, issue: 'BAD_FORMAT' };
  if (value.strategies.length > LIMITS.maxStrategies) {
    return { ok: false, issue: 'TOO_MANY_STRATEGIES' };
  }

  const strategies: Strategy[] = [];
  const ids = new Set<string>();
  for (const item of value.strategies) {
    const strategy = parseStrategy(item);
    if (!strategy || ids.has(strategy.id)) return { ok: false, issue: 'BAD_STRATEGY' };
    ids.add(strategy.id);
    strategies.push(strategy);
  }

  return {
    ok: true,
    bundle: {
      app: CONFIG_APP,
      schemaVersion: CONFIG_VERSION,
      exportedAt: typeof value.exportedAt === 'number' ? value.exportedAt : 0,
      settings,
      strategies,
    },
  };
}

function parseSettings(value: unknown): Settings | null {
  if (!isRecord(value)) return null;
  const idle = value.idleThresholdMinutes;
  const lockDelay = value.lockDelayMinutes;
  const retention = value.historyRetentionDays;
  const maxRecords = value.historyMaxRecords;
  if (!Number.isInteger(idle) || (idle as number) < 1 || (idle as number) > 1_440) return null;
  if (typeof value.lockCleanupEnabled !== 'boolean') return null;
  if (!Number.isInteger(lockDelay) || (lockDelay as number) < 0 || (lockDelay as number) > 1_440) return null;
  if (!Number.isInteger(retention) || (retention as number) < 1 || (retention as number) > 365) return null;
  if (!Number.isInteger(maxRecords) || (maxRecords as number) < 1 || (maxRecords as number) > LIMITS.maxHistory) {
    return null;
  }
  if (
    typeof value.activeStrategyId !== 'string' ||
    value.activeStrategyId.length === 0 ||
    value.activeStrategyId.length > 200
  ) {
    return null;
  }
  if (!isTheme(value.theme) || !isLanguage(value.language)) return null;
  const cleanInternalPages = value.cleanInternalPages === undefined ? false : value.cleanInternalPages;
  if (typeof cleanInternalPages !== 'boolean') return null;
  const quick = value.quickStrategyIds === undefined ? [] : parseQuickIds(value.quickStrategyIds);
  if (!quick) return null;

  return {
    idleThresholdMinutes: idle as number,
    lockCleanupEnabled: value.lockCleanupEnabled,
    lockDelayMinutes: lockDelay as number,
    historyRetentionDays: retention as number,
    historyMaxRecords: maxRecords as number,
    activeStrategyId: value.activeStrategyId,
    quickStrategyIds: quick,
    theme: value.theme,
    language: value.language,
    cleanInternalPages,
  };
}

function parseQuickIds(value: unknown): string[] | null {
  if (!Array.isArray(value) || value.length > LIMITS.maxQuickStrategies) return null;
  if (!value.every((id) => typeof id === 'string' && id.length > 0)) return null;
  return value;
}

function parseStrategy(value: unknown): Strategy | null {
  if (!isRecord(value) || value.builtin !== false) return null;
  if (typeof value.id !== 'string' || value.id.length === 0 || value.id.length > 200) return null;
  if (typeof value.name !== 'string') return null;
  const name = value.name.trim();
  if (name.length < 1 || name.length > LIMITS.strategyNameLength) return null;
  if (!isRecord(value.expression)) return null;
  const expression = value.expression as unknown as Expr;
  if (!validateExpr(expression).valid) return null;
  if (!isFiniteNumber(value.createdAt) || !isFiniteNumber(value.updatedAt)) return null;
  if (value.lastPreviewHash !== null && typeof value.lastPreviewHash !== 'string') return null;
  if (value.lastPreviewAt !== null && !isFiniteNumber(value.lastPreviewAt)) return null;

  return {
    id: value.id,
    name,
    builtin: false,
    expression,
    createdAt: value.createdAt,
    updatedAt: value.updatedAt,
    lastPreviewHash: value.lastPreviewHash,
    lastPreviewAt: value.lastPreviewAt,
  };
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value);
}

function isFiniteNumber(value: unknown): value is number {
  return typeof value === 'number' && Number.isFinite(value);
}
