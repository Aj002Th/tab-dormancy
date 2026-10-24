import { describe, expect, it } from 'vitest';
import type { Capabilities } from '../../src/shared/types';
import { capabilityView } from '../../src/ui/dashboard/capability-view';

const full: Capabilities = {
  chromeMajor: 156,
  lastAccessed: true,
  frozen: true,
  tabGroups: true,
  sessions: true,
};

describe('capability view', () => {
  it('summarizes a fully supported browser', () => {
    const view = capabilityView(full);
    expect(view.versionLabel).toBe('Chrome 156');
    expect(view.allAvailable).toBe(true);
    expect(view.availableCount).toBe(4);
    expect(view.unavailable).toEqual([]);
    expect(view.summary).toBe('规则中使用的全部能力均可用。');
  });

  it('lists every capability in a stable order with plain-language descriptions', () => {
    const view = capabilityView(full);
    expect(view.items.map((item) => item.label)).toEqual(['最后访问时间', '冻结状态', '标签组', '会话恢复']);
    expect(view.items[0]?.description).toBe('“距最后访问”规则依赖此能力。');
    expect(view.items[1]?.description).toBe('“已冻结”规则依赖此能力。');
    expect(view.items[2]?.description).toBe('“标签组”规则依赖此能力。');
    expect(view.items[3]?.description).toBe('恢复标签时用于还原页面状态。');
  });

  it('describes version requirements only for version-gated capabilities', () => {
    const view = capabilityView(full);
    expect(view.items[0]?.requirement).toBe('需要 Chrome 121 或更高版本');
    expect(view.items[1]?.requirement).toBe('需要 Chrome 132 或更高版本');
    expect(view.items[2]?.requirement).toBeNull();
    expect(view.items[3]?.requirement).toBeNull();
  });

  it('highlights unavailable capabilities and pauses affected rules', () => {
    const view = capabilityView({ ...full, lastAccessed: false, sessions: false });
    expect(view.allAvailable).toBe(false);
    expect(view.availableCount).toBe(2);
    expect(view.unavailable.map((item) => item.key)).toEqual(['lastAccessed', 'sessions']);
    expect(view.summary).toBe('有 2 项能力暂不可用，相关规则不会执行。');
    expect(view.items.filter((item) => !item.available).map((item) => item.label)).toEqual([
      '最后访问时间',
      '会话恢复',
    ]);
    expect(view.unavailable.map((item) => item.description)).toEqual([
      '用到“距最后访问”的规则会自动暂停。',
      '恢复标签时只能重新打开网址，无法还原页面状态。',
    ]);
  });

  it('keeps a readable version label when the browser version is unknown', () => {
    expect(capabilityView({ ...full, chromeMajor: null }).versionLabel).toBe('Chrome 版本未知');
  });
});
