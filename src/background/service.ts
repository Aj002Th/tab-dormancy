import { detectCapabilities } from '../core/capabilities';
import { planCleanup, revalidatePlannedTab } from '../core/cleaner';
import { buildFacts, managedTabs } from '../core/facts';
import { buildClosedRecords, markRestored, planRestore, toSummary } from '../core/history';
import { selectExpired } from '../core/retention';
import { evaluateStrategy } from '../core/rules/evaluate';
import { createPresetStrategies } from '../core/rules/presets';
import { signatureOf } from '../core/rules/signature';
import { validateStrategy, validationMessage } from '../core/rules/validate';
import { requireStrategy, unsupportedFacts } from '../core/strategies';
import type { Browser } from '../platform/browser';
import type { Repo } from '../platform/storage';
import { runWithConcurrency } from '../shared/async';
import { ALARM_LOCKED, LIMITS, SCHEMA_VERSION } from '../shared/constants';
import { AppError } from '../shared/errors';
import { getLocale, setLocale, t } from '../shared/i18n';
import { resolveLocale } from '../shared/language';
import type { StrategyPreview } from '../shared/messages';
import { isTheme } from '../shared/theme';
import type {
  Capabilities,
  CleanupPreview,
  CleanupResult,
  ClosedTabRecord,
  HistoryQuery,
  HistoryQueryResult,
  Language,
  RestoreOptions,
  RestoreResult,
  Settings,
  SettingsPatch,
  StateSnapshot,
  Strategy,
  TabListItem,
  Trigger,
} from '../shared/types';

export type ServiceDeps = {
  browser: Browser;
  repo: Repo;
  now: () => number;
  id: () => string;
  userAgent: () => string;
};

export class TabDormancyService {
  private bootstrapPromise: Promise<void> | null = null;
  private capabilities: Capabilities | null = null;
  private running = false;

  constructor(protected readonly deps: ServiceDeps) {}

  private applyLocale(language: Language): void {
    // In tests (and any non-extension context) there is no browser UI language;
    // keep the current locale instead of shifting the "system" default to English.
    const uiLanguage = typeof chrome !== 'undefined' && chrome.i18n ? chrome.i18n.getUILanguage() : getLocale();
    setLocale(resolveLocale(language, [uiLanguage]));
  }

  async bootstrap(): Promise<void> {
    if (!this.bootstrapPromise) {
      this.bootstrapPromise = this.doBootstrap().catch((error) => {
        this.bootstrapPromise = null;
        throw error;
      });
    }
    return this.bootstrapPromise;
  }

  protected async doBootstrap(): Promise<void> {
    const repo = this.deps.repo;
    const now = this.deps.now();
    const meta = await repo.getMeta();
    if (!meta) await repo.setMeta({ schemaVersion: SCHEMA_VERSION, installedAt: now });

    let settings = await repo.getSettings();
    this.applyLocale(settings.language);
    let strategies = await repo.getStrategies();
    if (strategies.length === 0) {
      strategies = createPresetStrategies(now);
      await repo.setStrategies(strategies);
    }
    if (!strategies.some((strategy) => strategy.id === settings.activeStrategyId)) {
      const fallback = strategies.find((strategy) => strategy.id === 'preset:standard') ?? strategies[0];
      if (!fallback) throw new AppError('INTERNAL', t('errors.noUsableStrategy'));
      settings = { ...settings, activeStrategyId: fallback.id };
      await repo.setSettings(settings);
    }

    await this.getBrowserSessionId();
    await this.deps.browser.setIdleDetectionInterval(settings.idleThresholdMinutes * 60);
    await this.convergePendingRun();
    await this.pruneHistory();
  }

  async getCapabilities(): Promise<Capabilities> {
    if (this.capabilities) return this.capabilities;
    const tabs = await this.deps.browser.queryTabs();
    this.capabilities = detectCapabilities({
      userAgent: this.deps.userAgent(),
      sampleTab: tabs[0],
      hasTabGroups: true,
      hasSessions: true,
    });
    return this.capabilities;
  }

  async getBrowserSessionId(): Promise<string> {
    const existing = await this.deps.repo.getBrowserSessionId();
    if (existing) return existing;
    const id = this.deps.id();
    await this.deps.repo.setBrowserSessionId(id);
    return id;
  }

  async previewCleanup(): Promise<CleanupPreview> {
    await this.bootstrap();
    const { active, caps } = await this.activeStrategy();
    this.assertUsable(active, caps);
    const [tabs, windows, groups] = await Promise.all([
      this.deps.browser.queryTabs(),
      this.deps.browser.getWindows(),
      this.deps.browser.getTabGroups(),
    ]);
    const plan = planCleanup({ tabs, windows, groups, strategy: active, capabilities: caps, now: this.deps.now() });
    return {
      matched: plan.matched.length,
      sample: plan.matched
        .slice(0, 5)
        .map((tab) => ({ tabId: tab.tabId, title: tab.title, url: tab.url, trace: tab.trace })),
      totalManagedTabs: plan.totalManagedTabs,
      strategyId: active.id,
      strategyName: active.name,
    };
  }

  async previewStrategy(strategy: Strategy): Promise<StrategyPreview> {
    await this.bootstrap();
    const caps = await this.getCapabilities();
    const validation = validateStrategy(strategy, caps);
    if (!validation.valid) {
      throw new AppError(
        'INVALID_EXPRESSION',
        validation.issues[0] ? validationMessage(validation.issues[0]) : t('errors.invalidRule'),
      );
    }
    this.assertUsable(strategy, caps);
    const [tabs, windows, groups] = await Promise.all([
      this.deps.browser.queryTabs(),
      this.deps.browser.getWindows(),
      this.deps.browser.getTabGroups(),
    ]);
    const plan = planCleanup({ tabs, windows, groups, strategy, capabilities: caps, now: this.deps.now() });
    return {
      matched: plan.matched.length,
      sample: plan.matched
        .slice(0, 5)
        .map((tab) => ({ tabId: tab.tabId, title: tab.title, url: tab.url, trace: tab.trace })),
      totalManagedTabs: plan.totalManagedTabs,
      strategyId: strategy.id,
      strategyName: strategy.name,
      signature: await signatureOf(strategy.expression),
    };
  }

  async listTabs(): Promise<TabListItem[]> {
    await this.bootstrap();
    const { active, caps } = await this.activeStrategy();
    const [tabs, windows, groups] = await Promise.all([
      this.deps.browser.queryTabs(),
      this.deps.browser.getWindows(),
      this.deps.browser.getTabGroups(),
    ]);
    const facts = buildFacts({ tabs, windows, groups, now: this.deps.now() });
    const disabled = unsupportedFacts(active.expression, caps).length > 0;
    return managedTabs({ tabs, windows }).flatMap((tab) => {
      const fact = facts.get(tab.id as number);
      if (!fact) return [];
      const evaluation = disabled ? { matched: false, trace: [] } : evaluateStrategy(active, fact, caps);
      return [{ tab, facts: fact, matched: evaluation.matched, trace: evaluation.trace }];
    });
  }

  async runCleanup(trigger: Trigger): Promise<CleanupResult> {
    await this.bootstrap();
    if (this.running) throw new AppError('BUSY', t('errors.busy'));
    this.running = true;
    const runId = this.deps.id();
    const startedAt = this.deps.now();

    try {
      if (!(await this.acquireLock(runId))) throw new AppError('BUSY', t('errors.busy'));
      const { active, caps } = await this.activeStrategy();
      this.assertUsable(active, caps);

      const [tabs, windows, groups] = await Promise.all([
        this.deps.browser.queryTabs(),
        this.deps.browser.getWindows(),
        this.deps.browser.getTabGroups(),
      ]);
      const plan = planCleanup({ tabs, windows, groups, strategy: active, capabilities: caps, now: this.deps.now() });

      if (plan.matched.length === 0) {
        const result: CleanupResult = {
          runId,
          trigger,
          closed: 0,
          failed: 0,
          skipped: 0,
          durationMs: this.deps.now() - startedAt,
          recordIds: [],
          failures: [],
        };
        await this.deps.repo.setLastCleanup({
          at: startedAt,
          trigger,
          closed: 0,
          failed: 0,
          skipped: 0,
          durationMs: result.durationMs,
          recordIds: [],
        });
        return result;
      }

      const browserSessionId = await this.getBrowserSessionId();
      const records = buildClosedRecords(plan, {
        trigger,
        strategy: active,
        browserSessionId,
        now: this.deps.now(),
        ids: () => this.deps.id(),
      });

      const previousIndex = await this.deps.repo.getHistoryIndex();
      try {
        await this.deps.repo.setHistoryIndex([...records.map(toSummary), ...previousIndex]);
        await this.deps.repo.setHistoryRecords(records);
        await this.deps.repo.setCleanupRun({
          id: runId,
          startedAt,
          trigger,
          strategyId: active.id,
          browserSessionId,
          drafts: records,
        });
      } catch {
        await this.deps.repo.setHistoryIndex(previousIndex).catch(() => undefined);
        await this.deps.repo.deleteHistoryRecords(records.map((record) => record.id)).catch(() => undefined);
        await this.deps.repo.clearCleanupRun().catch(() => undefined);
        throw new AppError('STORAGE_FAILED', t('errors.storageFailedHistory'));
      }

      const recordByTab = new Map<number, ClosedTabRecord>();
      plan.matched.forEach((tab, index) => {
        const record = records[index];
        if (record) recordByTab.set(tab.tabId, record);
      });

      const successes: ClosedTabRecord[] = [];
      const failedRecords: ClosedTabRecord[] = [];
      const failures: CleanupResult['failures'] = [];

      await runWithConcurrency(plan.matched, LIMITS.cleanupConcurrency, async (planned) => {
        const record = recordByTab.get(planned.tabId);
        if (!record) return;
        const current = await this.deps.browser.getTab(planned.tabId);
        if (current && !revalidatePlannedTab(planned, current)) {
          failures.push({ tabId: planned.tabId, title: planned.title, reason: 'tab-changed' });
          failedRecords.push(record);
          return;
        }
        try {
          if (current) await this.deps.browser.removeTab(planned.tabId);
          successes.push({ ...record, status: 'closed' });
        } catch (error) {
          if (isNoSuchTabError(error)) {
            successes.push({ ...record, status: 'closed' });
          } else {
            failures.push({
              tabId: planned.tabId,
              title: planned.title,
              reason: error instanceof Error ? error.message : 'unknown',
            });
            failedRecords.push(record);
          }
        }
      });

      const successIds = new Set(successes.map((record) => record.id));
      const failedIds = new Set(failedRecords.map((record) => record.id));
      const index = await this.deps.repo.getHistoryIndex();
      const updated = index
        .filter((item) => !failedIds.has(item.id))
        .map((item) => (successIds.has(item.id) ? { ...item, status: 'closed' as const } : item));
      await this.deps.repo.setHistoryIndex(updated);
      await this.deps.repo.setHistoryRecords(successes);
      await this.deps.repo.deleteHistoryRecords([...failedIds]);

      const skipped = failures.filter((failure) => failure.reason === 'tab-changed').length;
      const failed = failures.length - skipped;
      const result: CleanupResult = {
        runId,
        trigger,
        closed: successes.length,
        failed,
        skipped,
        durationMs: this.deps.now() - startedAt,
        recordIds: successes.map((record) => record.id),
        failures,
      };
      await this.deps.repo.setLastCleanup({
        at: startedAt,
        trigger,
        closed: result.closed,
        failed: result.failed,
        skipped: result.skipped,
        durationMs: result.durationMs,
        recordIds: result.recordIds,
      });
      await this.deps.repo.clearCleanupRun();
      await this.pruneHistory();
      return result;
    } finally {
      this.running = false;
      await this.releaseLock(runId);
    }
  }

  async convergePendingRun(): Promise<void> {
    const run = await this.deps.repo.getCleanupRun();
    if (!run) return;
    const index = await this.deps.repo.getHistoryIndex();
    const sessionId = await this.deps.repo.getBrowserSessionId();

    if (run.browserSessionId !== sessionId) {
      const ids = new Set(run.drafts.map((draft) => draft.id));
      await this.deps.repo.deleteHistoryRecords([...ids]);
      await this.deps.repo.setHistoryIndex(index.filter((item) => !ids.has(item.id)));
      await this.deps.repo.clearCleanupRun();
      return;
    }

    const tabs = await this.deps.browser.queryTabs();
    const removed = new Set<string>();
    const closed = new Set<string>();
    for (const draft of run.drafts) {
      const stillOpen = tabs.some(
        (tab) => tab.windowId === draft.windowId && (tab.url ?? tab.pendingUrl ?? '') === draft.url,
      );
      if (stillOpen) removed.add(draft.id);
      else closed.add(draft.id);
    }

    await this.deps.repo.deleteHistoryRecords([...removed]);
    await this.deps.repo.setHistoryRecords(
      run.drafts
        .filter((draft) => closed.has(draft.id))
        .map((draft) => ({ ...draft, status: 'closed' as const, recovered: true })),
    );
    await this.deps.repo.setHistoryIndex(
      index
        .filter((item) => !removed.has(item.id))
        .map((item) => (closed.has(item.id) ? { ...item, status: 'closed' as const } : item)),
    );
    await this.deps.repo.clearCleanupRun();
  }

  async pruneHistory(): Promise<void> {
    const settings = await this.deps.repo.getSettings();
    const index = await this.deps.repo.getHistoryIndex();
    const { kept, removedIds } = selectExpired(
      index,
      this.deps.now(),
      settings.historyRetentionDays,
      settings.historyMaxRecords,
    );
    if (removedIds.length === 0) return;
    await this.deps.repo.deleteHistoryRecords(removedIds);
    await this.deps.repo.setHistoryIndex(kept);
  }

  async queryHistory(query: HistoryQuery): Promise<HistoryQueryResult> {
    await this.bootstrap();
    const settings = await this.deps.repo.getSettings();
    const index = await this.deps.repo.getHistoryIndex();
    const search = (query.query ?? '').trim().toLowerCase();
    const filtered = index.filter((item) => {
      if (item.status !== 'closed') return false;
      if (query.trigger && item.trigger !== query.trigger) return false;
      if (query.restored === true && item.restoredAt === null) return false;
      if (query.restored === false && item.restoredAt !== null) return false;
      if (!search) return true;
      return [item.url, item.title, item.domain].some((value) => value.toLowerCase().includes(search));
    });

    filtered.sort((a, b) => b.closedAt - a.closedAt);

    const pageSize = Math.max(1, Math.min(query.pageSize || 50, 200));
    const page = Math.max(1, query.page || 1);
    const start = (page - 1) * pageSize;
    const items = filtered.slice(start, start + pageSize);
    // Index entries written by older versions may not carry strategy info; hydrate
    // it from the full records so the history rows can show a localized name.
    const records = await this.deps.repo.getHistoryRecords(items.map((item) => item.id));
    const recordsById = new Map(records.map((record) => [record.id, record]));
    return {
      items: items.map((item) => {
        const record = recordsById.get(item.id);
        return record ? { ...item, strategyId: record.strategyId, strategyName: record.strategyName } : item;
      }),
      total: filtered.length,
      page,
      pageSize,
      retention: {
        days: settings.historyRetentionDays,
        maxRecords: settings.historyMaxRecords,
      },
    };
  }

  async restoreHistory(ids: string[], options: RestoreOptions): Promise<RestoreResult> {
    await this.bootstrap();
    const records = await this.deps.repo.getHistoryRecords(ids);
    if (records.length === 0) return { restored: 0, failed: [] };

    const currentWindow = await this.deps.browser.getLastFocusedWindow();
    const currentWindowId = currentWindow.id ?? 1;
    const groups = planRestore(records, options, currentWindowId);
    const restored = new Map<string, number>();
    const failed: RestoreResult['failed'] = [];

    for (const group of groups) {
      let windowId: number | undefined = group.windowId === 'new' ? undefined : group.windowId;
      if (group.windowId === 'new') {
        const first = group.records[0];
        if (!first) continue;
        try {
          const created = await this.deps.browser.createWindow({ url: first.url, focused: false });
          windowId = created.id;
          const createdTabId = created.tabs?.[0]?.id;
          if (createdTabId !== undefined) restored.set(first.id, createdTabId);
        } catch (error) {
          failed.push({
            id: first.id,
            url: first.url,
            reason: error instanceof Error ? error.message : t('errors.createWindowFailed'),
          });
          continue;
        }
      }

      for (const item of group.records) {
        if (restored.has(item.id)) continue;
        try {
          const tab = await this.restoreOne(item, options, windowId);
          if (tab?.id !== undefined) restored.set(item.id, tab.id);
        } catch (error) {
          failed.push({
            id: item.id,
            url: item.url,
            reason: error instanceof Error ? error.message : t('errors.restoreFailed'),
          });
        }
      }

      if (windowId === undefined) continue;
      for (const tabGroup of group.groups) {
        const tabIds = tabGroup.records
          .map((item) => restored.get(item.id))
          .filter((id): id is number => typeof id === 'number');
        if (tabIds.length === 0) continue;
        try {
          const groupId = await this.deps.browser.groupTabs(tabIds, { windowId });
          const properties: chrome.tabGroups.UpdateProperties = {
            title: tabGroup.groupTitle,
            collapsed: tabGroup.groupCollapsed,
          };
          if (tabGroup.groupColor) properties.color = tabGroup.groupColor as chrome.tabGroups.ColorEnum;
          await this.deps.browser.updateTabGroup(groupId, properties);
        } catch (error) {
          failed.push({
            id: tabGroup.records[0]?.id ?? tabGroup.key,
            url: tabGroup.records[0]?.url ?? '',
            reason: error instanceof Error ? error.message : t('errors.rebuildGroupFailed'),
          });
        }
      }
    }

    const restoredIds = [...restored.keys()];
    const index = await this.deps.repo.getHistoryIndex();
    await this.deps.repo.setHistoryIndex(markRestored(index, restoredIds, this.deps.now()));
    await this.deps.repo.setHistoryRecords(
      records.filter((item) => restored.has(item.id)).map((item) => ({ ...item, restoredAt: this.deps.now() })),
    );
    return { restored: restoredIds.length, failed };
  }

  async deleteHistory(ids: string[]): Promise<void> {
    await this.bootstrap();
    const index = await this.deps.repo.getHistoryIndex();
    const set = new Set(ids);
    await this.deps.repo.deleteHistoryRecords(ids);
    await this.deps.repo.setHistoryIndex(index.filter((item) => !set.has(item.id)));
  }

  async clearHistory(): Promise<void> {
    await this.bootstrap();
    const index = await this.deps.repo.getHistoryIndex();
    await this.deps.repo.deleteHistoryRecords(index.map((item) => item.id));
    await this.deps.repo.setHistoryIndex([]);
  }

  private async restoreOne(
    record: ClosedTabRecord,
    options: RestoreOptions,
    windowId: number | undefined,
  ): Promise<chrome.tabs.Tab | undefined> {
    if (options.complete && options.mode === 'current-window' && record.sessionId) {
      try {
        const session = await this.deps.browser.restoreSession(record.sessionId);
        if (session.tab) return session.tab;
      } catch {
        // fall through to normal tab creation
      }
    }
    return this.deps.browser.createTab({
      url: record.url,
      active: false,
      pinned: record.pinned,
      ...(windowId !== undefined ? { windowId } : {}),
    });
  }

  private async acquireLock(runId: string): Promise<boolean> {
    const existing = await this.deps.repo.getCleanupLock();
    if (existing && this.deps.now() - existing.startedAt < LIMITS.lockStaleMs) return false;
    await this.deps.repo.setCleanupLock({ runId, startedAt: this.deps.now() });
    return true;
  }

  private async releaseLock(runId: string): Promise<void> {
    const existing = await this.deps.repo.getCleanupLock();
    if (existing?.runId === runId) await this.deps.repo.clearCleanupLock();
  }

  protected async activeStrategy(): Promise<{
    settings: Settings;
    strategies: Strategy[];
    active: Strategy;
    caps: Capabilities;
  }> {
    const settings = await this.deps.repo.getSettings();
    const strategies = await this.deps.repo.getStrategies();
    const active = requireStrategy(strategies, settings.activeStrategyId);
    const caps = await this.getCapabilities();
    return { settings, strategies, active, caps };
  }

  protected assertUsable(strategy: Strategy, caps: Capabilities): void {
    const missing = unsupportedFacts(strategy.expression, caps);
    if (missing.length > 0) {
      throw new AppError('UNSUPPORTED_FACT', t('errors.unsupportedFacts', { facts: missing.join(listSeparator()) }));
    }
  }

  async getState(): Promise<StateSnapshot> {
    await this.bootstrap();
    const { active, caps, settings, strategies } = await this.activeStrategy();
    const warnings: string[] = [];
    const missing = unsupportedFacts(active.expression, caps);
    if (missing.length > 0) {
      warnings.push(t('warnings.unsupportedFactsPaused', { facts: missing.join(listSeparator()) }));
    }
    if (!active.builtin && active.lastPreviewHash === null) {
      warnings.push(t('warnings.previewRequired'));
    }
    return {
      settings,
      strategies,
      activeStrategy: active,
      lastCleanup: await this.deps.repo.getLastCleanup(),
      capabilities: caps,
      warnings,
    };
  }

  async saveStrategy(input: Strategy, previewSignature?: string): Promise<Strategy> {
    await this.bootstrap();
    const caps = await this.getCapabilities();
    const validation = validateStrategy(input, caps);
    if (!validation.valid) {
      throw new AppError(
        'INVALID_EXPRESSION',
        validation.issues[0] ? validationMessage(validation.issues[0]) : t('errors.invalidRule'),
      );
    }

    const strategies = await this.deps.repo.getStrategies();
    const existing = strategies.find((strategy) => strategy.id === input.id);
    if (existing?.builtin) throw new AppError('FORBIDDEN', t('errors.builtinImmutable'));

    const now = this.deps.now();
    const expected = await signatureOf(input.expression);
    const lastPreviewHash = previewSignature === expected ? expected : null;
    const strategy: Strategy = existing
      ? {
          ...existing,
          name: input.name.trim(),
          expression: input.expression,
          updatedAt: now,
          lastPreviewHash,
          lastPreviewAt: lastPreviewHash ? now : null,
        }
      : {
          id: this.deps.id(),
          name: input.name.trim(),
          builtin: false,
          expression: input.expression,
          createdAt: now,
          updatedAt: now,
          lastPreviewHash,
          lastPreviewAt: lastPreviewHash ? now : null,
        };

    const next = existing
      ? strategies.map((item) => (item.id === existing.id ? strategy : item))
      : [...strategies, strategy];
    await this.deps.repo.setStrategies(next);
    return strategy;
  }

  async activateStrategy(id: string): Promise<void> {
    await this.bootstrap();
    const strategies = await this.deps.repo.getStrategies();
    const strategy = requireStrategy(strategies, id);
    const caps = await this.getCapabilities();
    const validation = validateStrategy(strategy, caps);
    if (!validation.valid) {
      throw new AppError(
        'INVALID_EXPRESSION',
        validation.issues[0] ? validationMessage(validation.issues[0]) : t('errors.invalidRule'),
      );
    }
    this.assertUsable(strategy, caps);
    if (!strategy.builtin) {
      const expected = await signatureOf(strategy.expression);
      if (strategy.lastPreviewHash !== expected) {
        throw new AppError('PREVIEW_REQUIRED', t('errors.PREVIEW_REQUIRED'));
      }
    }
    const settings = await this.deps.repo.getSettings();
    await this.deps.repo.setSettings({ ...settings, activeStrategyId: id });
  }

  async deleteStrategy(id: string): Promise<void> {
    await this.bootstrap();
    const strategies = await this.deps.repo.getStrategies();
    const strategy = requireStrategy(strategies, id);
    if (strategy.builtin) throw new AppError('FORBIDDEN', t('errors.builtinUndeletable'));
    const settings = await this.deps.repo.getSettings();
    if (settings.activeStrategyId === id) throw new AppError('FORBIDDEN', t('errors.activeUndeletable'));
    if (strategies.length <= 1) throw new AppError('FORBIDDEN', t('errors.keepOneStrategy'));
    await this.deps.repo.setStrategies(strategies.filter((item) => item.id !== id));
  }

  async updateSettings(patch: SettingsPatch): Promise<Settings> {
    await this.bootstrap();
    const current = await this.deps.repo.getSettings();
    const next: Settings = { ...current, ...patch };
    if (
      !Number.isInteger(next.idleThresholdMinutes) ||
      next.idleThresholdMinutes < 1 ||
      next.idleThresholdMinutes > 1_440
    ) {
      throw new AppError('INVALID_SETTINGS', t('errors.invalidIdle'));
    }
    if (!Number.isInteger(next.lockDelayMinutes) || next.lockDelayMinutes < 0 || next.lockDelayMinutes > 1_440) {
      throw new AppError('INVALID_SETTINGS', t('errors.invalidLockDelay'));
    }
    if (
      !Number.isInteger(next.historyRetentionDays) ||
      next.historyRetentionDays < 1 ||
      next.historyRetentionDays > 365
    ) {
      throw new AppError('INVALID_SETTINGS', t('errors.invalidRetention'));
    }
    if (typeof next.lockCleanupEnabled !== 'boolean') {
      throw new AppError('INVALID_SETTINGS', t('errors.invalidLockSettings'));
    }
    if (!isTheme(next.theme)) {
      throw new AppError('INVALID_SETTINGS', t('errors.invalidTheme'));
    }
    if (
      !Number.isInteger(next.historyMaxRecords) ||
      next.historyMaxRecords < 1 ||
      next.historyMaxRecords > LIMITS.maxHistory
    ) {
      throw new AppError('INVALID_SETTINGS', t('errors.invalidMaxRecords', { max: LIMITS.maxHistory }));
    }
    await this.deps.repo.setSettings(next);
    this.applyLocale(next.language);
    await this.deps.browser.setIdleDetectionInterval(next.idleThresholdMinutes * 60);
    if (!next.lockCleanupEnabled) await this.deps.browser.clearAlarm(ALARM_LOCKED);
    if (
      next.historyRetentionDays !== current.historyRetentionDays ||
      next.historyMaxRecords !== current.historyMaxRecords
    ) {
      await this.pruneHistory();
    }
    return next;
  }

  async onLocked(): Promise<void> {
    await this.bootstrap();
    const settings = await this.deps.repo.getSettings();
    if (!settings.lockCleanupEnabled) return;
    if (settings.lockDelayMinutes <= 0) {
      await this.runCleanup('locked');
      return;
    }
    await this.deps.browser.createAlarm(ALARM_LOCKED, { delayInMinutes: settings.lockDelayMinutes });
  }

  async onActive(): Promise<void> {
    await this.deps.browser.clearAlarm(ALARM_LOCKED);
  }

  async onLockAlarm(): Promise<void> {
    const state = await this.deps.browser.queryIdleState(60);
    if (state === 'locked' || state === 'idle') {
      await this.runCleanup('locked');
    } else {
      await this.deps.browser.clearAlarm(ALARM_LOCKED);
    }
  }
}

function listSeparator(): string {
  return getLocale() === 'zh' ? '、' : ', ';
}

function isNoSuchTabError(error: unknown): boolean {
  const message = error instanceof Error ? error.message : String(error);
  return /No tab with id|Invalid tab ID|No tab with/i.test(message);
}
