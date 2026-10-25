import { beforeEach, describe, expect, it } from 'vitest';
import { setLocale } from '../../src/shared/i18n';
import { strategyDisplayName } from '../../src/ui/dashboard/strategy-name';

function named(id: string, name: string) {
  return { id, name };
}

describe('strategy display names', () => {
  beforeEach(() => setLocale('zh'));

  it('localizes built-in preset names', () => {
    expect(strategyDisplayName(named('preset:mild', '温和'), 'zh')).toBe('温和');
    expect(strategyDisplayName(named('preset:standard', '标准'), 'zh')).toBe('标准');
    expect(strategyDisplayName(named('preset:aggressive', '激进'), 'zh')).toBe('激进');
    expect(strategyDisplayName(named('preset:mild', '温和'), 'en')).toBe('Mild');
    expect(strategyDisplayName(named('preset:standard', '标准'), 'en')).toBe('Standard');
    expect(strategyDisplayName(named('preset:aggressive', '激进'), 'en')).toBe('Aggressive');
  });

  it('uses the preset key rather than a stale stored name', () => {
    expect(strategyDisplayName(named('preset:standard', 'Legacy name'), 'en')).toBe('Standard');
  });

  it('keeps custom strategy names unchanged', () => {
    expect(strategyDisplayName(named('custom:1', 'E2E URL'), 'en')).toBe('E2E URL');
    expect(strategyDisplayName(named('custom:2', '我的策略'), 'en')).toBe('我的策略');
  });

  it('keeps unknown built-in names unchanged', () => {
    expect(strategyDisplayName(named('preset:unknown', 'Legacy preset'), 'en')).toBe('Legacy preset');
  });

  it('follows the active locale by default', () => {
    setLocale('en');
    expect(strategyDisplayName(named('preset:standard', '标准'))).toBe('Standard');
    setLocale('zh');
    expect(strategyDisplayName(named('preset:standard', '标准'))).toBe('标准');
  });
});
