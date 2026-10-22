import { detectCapabilities } from '../core/capabilities';
import { planCleanup, revalidatePlannedTab } from '../core/cleaner';
import { buildFacts, managedTabs } from '../core/facts';
import { buildClosedRecords, toSummary } from '../core/history';
import { selectExpired } from '../core/retention';
import { evaluateStrategy } from '../core/rules/evaluate';
import { createPresetStrategies } from '../core/rules/presets';
import { signatureOf } from '../core/rules/signature';
import { validateStrategy } from '../core/rules/validate';
import { requireStrategy, unsupportedFacts } from '../core/strategies';
import type { Browser } from '../platform/browser';
import type { Repo } from '../platform/storage';
import { runWithConcurrency } from '../shared/async';
import { ALARM_LOCKED, LIMITS, SCHEMA_VERSION } from '../shared/constants';
import { AppError } from '../shared/errors';
import type {
  Capabilities,
  CleanupPreview,
  CleanupResult,
  ClosedTabRecord,
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
    let strategies = await repo.getStrategies();
    if (strategies.length === 0) {
      strategies = createPresetStrategies(now);
      await repo.setStrategies(strategies);
    }
    if (!strategies.some((strategy) => strategy.id === settings.activeStrategyId)) {
      const fallback = strategies.find((strategy) => strategy.id === 'preset:standard') ?? strategies[0];
      if (!fallback) throw new AppError('INTERNAL', '缺少可用策略');
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
      strategyName: active.name,
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
    if (this.running) throw new AppError('BUSY', '已有清理任务正在运行');
    this.running = true;
    const runId = this.deps.id();
    const startedAt = this.deps.now();

    try {
      if (!(await this.acquireLock(runId))) throw new AppError('BUSY', '已有清理任务正在运行');
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
        throw new AppError('STORAGE_FAILED', '无法写入关闭历史，已取消清理');
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
      LIMITS.maxHistory,
    );
    if (removedIds.length === 0) return;
    await this.deps.repo.deleteHistoryRecords(removedIds);
    await this.deps.repo.setHistoryIndex(kept);
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
      throw new AppError('UNSUPPORTED_FACT', `当前浏览器不支持策略中的事实：${missing.join('、')}`);
    }
  }

  async getState(): Promise<StateSnapshot> {
    await this.bootstrap();
    const { active, caps, settings, strategies } = await this.activeStrategy();
    const warnings: string[] = [];
    const missing = unsupportedFacts(active.expression, caps);
    if (missing.length > 0) {
      warnings.push(`当前浏览器不支持策略中的事实：${missing.join('、')}；自动清理已暂停。`);
    }
    if (!active.builtin && active.lastPreviewHash === null) {
      warnings.push('该策略尚未预览，自动清理不会执行。');
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
      throw new AppError('INVALID_EXPRESSION', validation.issues[0]?.message ?? '规则无效');
    }

    const strategies = await this.deps.repo.getStrategies();
    const existing = strategies.find((strategy) => strategy.id === input.id);
    if (existing?.builtin) throw new AppError('FORBIDDEN', '内置策略不可修改');

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
      throw new AppError('INVALID_EXPRESSION', validation.issues[0]?.message ?? '策略无效');
    }
    this.assertUsable(strategy, caps);
    if (!strategy.builtin) {
      const expected = await signatureOf(strategy.expression);
      if (strategy.lastPreviewHash !== expected) {
        throw new AppError('PREVIEW_REQUIRED', '请先预览该策略，再启用');
      }
    }
    const settings = await this.deps.repo.getSettings();
    await this.deps.repo.setSettings({ ...settings, activeStrategyId: id });
  }

  async deleteStrategy(id: string): Promise<void> {
    await this.bootstrap();
    const strategies = await this.deps.repo.getStrategies();
    const strategy = requireStrategy(strategies, id);
    if (strategy.builtin) throw new AppError('FORBIDDEN', '内置策略不可删除');
    const settings = await this.deps.repo.getSettings();
    if (settings.activeStrategyId === id) throw new AppError('FORBIDDEN', '不能删除当前启用的策略');
    if (strategies.length <= 1) throw new AppError('FORBIDDEN', '至少保留一个策略');
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
      throw new AppError('INVALID_SETTINGS', '空闲阈值需为 1–1440 分钟');
    }
    if (!Number.isInteger(next.lockDelayMinutes) || next.lockDelayMinutes < 0 || next.lockDelayMinutes > 1_440) {
      throw new AppError('INVALID_SETTINGS', '锁屏延迟需为 0–1440 分钟');
    }
    if (
      !Number.isInteger(next.historyRetentionDays) ||
      next.historyRetentionDays < 1 ||
      next.historyRetentionDays > 365
    ) {
      throw new AppError('INVALID_SETTINGS', '历史保留需为 1–365 天');
    }
    if (typeof next.lockCleanupEnabled !== 'boolean') {
      throw new AppError('INVALID_SETTINGS', '锁屏清理设置无效');
    }
    await this.deps.repo.setSettings(next);
    await this.deps.browser.setIdleDetectionInterval(next.idleThresholdMinutes * 60);
    if (!next.lockCleanupEnabled) await this.deps.browser.clearAlarm(ALARM_LOCKED);
    return next;
  }
}

function isNoSuchTabError(error: unknown): boolean {
  const message = error instanceof Error ? error.message : String(error);
  return /No tab with id|Invalid tab ID|No tab with/i.test(message);
}
