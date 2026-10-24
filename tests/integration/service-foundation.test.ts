import { describe, expect, it } from 'vitest';
import { TabDormancyService } from '../../src/background/service';
import { signatureOf } from '../../src/core/rules/signature';
import { Repo } from '../../src/platform/storage';
import type { Expr } from '../../src/shared/types';
import { FakeBrowser } from './fake-browser';

const now = 1_000_000;
const expression: Expr = {
  type: 'all',
  id: 'root',
  children: [{ type: 'condition', id: 'c', fact: 'lastActiveMinutes', op: 'gt', value: 60 }],
};

function setup(userAgent = 'Mozilla/5.0 Chrome/132.0.0.0') {
  const browser = new FakeBrowser();
  const repo = new Repo(browser.storageLocal, browser.storageSession, () => now);
  let counter = 0;
  const service = new TabDormancyService({
    browser,
    repo,
    now: () => now,
    id: () => `id-${counter++}`,
    userAgent: () => userAgent,
  });
  return { browser, repo, service };
}

describe('TabDormancyService foundation', () => {
  it('bootstraps settings, presets, browser session and idle interval', async () => {
    const { browser, repo, service } = setup();
    await service.bootstrap();
    const state = await service.getState();
    expect(state.strategies).toHaveLength(3);
    expect(state.activeStrategy.id).toBe('preset:standard');
    expect(state.settings.idleThresholdMinutes).toBe(15);
    expect(state.settings.historyMaxRecords).toBe(5_000);
    expect(state.settings.theme).toBe('system');
    expect(browser.detectionInterval).toBe(900);
    expect(await repo.getBrowserSessionId()).toBe('id-0');
  });

  it('requires a preview before activating a custom strategy', async () => {
    const { service } = setup();
    await service.bootstrap();
    const saved = await service.saveStrategy({
      id: '',
      name: '自定义',
      builtin: false,
      expression,
      createdAt: 0,
      updatedAt: 0,
      lastPreviewHash: null,
      lastPreviewAt: null,
    });

    await expect(service.activateStrategy(saved.id)).rejects.toMatchObject({ code: 'PREVIEW_REQUIRED' });

    const signature = await signatureOf(expression);
    const previewed = await service.saveStrategy({ ...saved, lastPreviewHash: signature }, signature);
    expect(previewed.lastPreviewHash).toBe(signature);
    await expect(service.activateStrategy(saved.id)).resolves.toBeUndefined();
    expect((await service.getState()).activeStrategy.id).toBe(saved.id);
  });

  it('rejects modifying built-ins and deleting the active strategy', async () => {
    const { service } = setup();
    await service.bootstrap();
    const state = await service.getState();
    const standard = state.activeStrategy;
    await expect(service.saveStrategy({ ...standard, name: '被改坏' })).rejects.toMatchObject({ code: 'FORBIDDEN' });
    await expect(service.deleteStrategy('preset:standard')).rejects.toMatchObject({ code: 'FORBIDDEN' });
  });

  it('validates and applies settings', async () => {
    const { browser, service } = setup();
    await service.bootstrap();
    const settings = await service.updateSettings({
      idleThresholdMinutes: 30,
      lockDelayMinutes: 0,
      historyMaxRecords: 120,
      theme: 'dark',
    });
    expect(settings.idleThresholdMinutes).toBe(30);
    expect(settings.historyMaxRecords).toBe(120);
    expect(settings.theme).toBe('dark');
    expect(browser.detectionInterval).toBe(1800);
    await expect(service.updateSettings({ theme: 'sepia' as never })).rejects.toMatchObject({
      code: 'INVALID_SETTINGS',
    });
    await expect(service.updateSettings({ idleThresholdMinutes: 0 })).rejects.toMatchObject({
      code: 'INVALID_SETTINGS',
    });
    await expect(service.updateSettings({ historyMaxRecords: 0 })).rejects.toMatchObject({
      code: 'INVALID_SETTINGS',
    });
    await expect(service.updateSettings({ historyMaxRecords: 5_001 })).rejects.toMatchObject({
      code: 'INVALID_SETTINGS',
    });
  });

  it('warns when the active strategy needs unavailable facts', async () => {
    const { service } = setup('Mozilla/5.0 Chrome/120.0.0.0');
    await service.bootstrap();
    const state = await service.getState();
    expect(state.warnings.join('')).toContain('lastActiveMinutes');
  });
});
