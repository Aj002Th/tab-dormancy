import { detectCapabilities } from '../core/capabilities';
import { createPresetStrategies } from '../core/rules/presets';
import { signatureOf } from '../core/rules/signature';
import { validateStrategy } from '../core/rules/validate';
import { requireStrategy, unsupportedFacts } from '../core/strategies';
import type { Browser } from '../platform/browser';
import type { Repo } from '../platform/storage';
import { ALARM_LOCKED, SCHEMA_VERSION } from '../shared/constants';
import { AppError } from '../shared/errors';
import type { Capabilities, Settings, SettingsPatch, StateSnapshot, Strategy } from '../shared/types';

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
