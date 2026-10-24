import type { Capabilities } from '../../shared/types';

export type CapabilityKey = 'lastAccessed' | 'frozen' | 'tabGroups' | 'sessions';

export type CapabilityViewItem = {
  key: CapabilityKey;
  label: string;
  description: string;
  requirement: string | null;
  available: boolean;
};

export type CapabilityView = {
  versionLabel: string;
  items: CapabilityViewItem[];
  unavailable: CapabilityViewItem[];
  availableCount: number;
  allAvailable: boolean;
  summary: string;
};

const CAPABILITIES: Array<{
  key: CapabilityKey;
  label: string;
  availableDescription: string;
  unavailableDescription: string;
  requirement: string | null;
}> = [
  {
    key: 'lastAccessed',
    label: '最后访问时间',
    availableDescription: '“距最后访问”规则依赖此能力。',
    unavailableDescription: '用到“距最后访问”的规则会自动暂停。',
    requirement: '需要 Chrome 121 或更高版本',
  },
  {
    key: 'frozen',
    label: '冻结状态',
    availableDescription: '“已冻结”规则依赖此能力。',
    unavailableDescription: '用到“已冻结”的规则会自动暂停。',
    requirement: '需要 Chrome 132 或更高版本',
  },
  {
    key: 'tabGroups',
    label: '标签组',
    availableDescription: '“标签组”规则依赖此能力。',
    unavailableDescription: '用到“标签组”的规则会自动暂停。',
    requirement: null,
  },
  {
    key: 'sessions',
    label: '会话恢复',
    availableDescription: '恢复标签时用于还原页面状态。',
    unavailableDescription: '恢复标签时只能重新打开网址，无法还原页面状态。',
    requirement: null,
  },
];

export function capabilityView(capabilities: Capabilities): CapabilityView {
  const items = CAPABILITIES.map(({ availableDescription, unavailableDescription, ...capability }) => {
    const available = capabilities[capability.key];
    return {
      ...capability,
      available,
      description: available ? availableDescription : unavailableDescription,
    };
  });
  const unavailable = items.filter((item) => !item.available);
  const availableCount = items.length - unavailable.length;
  return {
    versionLabel: `Chrome ${capabilities.chromeMajor ?? '版本未知'}`,
    items,
    unavailable,
    availableCount,
    allAvailable: unavailable.length === 0,
    summary:
      unavailable.length === 0
        ? '规则中使用的全部能力均可用。'
        : `有 ${unavailable.length} 项能力暂不可用，相关规则不会执行。`,
  };
}
