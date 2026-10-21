import type { Capabilities, FactKey, Operator } from '../../shared/types';

export type FactType = 'number' | 'boolean' | 'string' | 'domain' | 'url' | 'title' | 'groupTitle';
export type CapabilityKey = 'lastAccessed' | 'frozen' | 'tabGroups';

export type FactDefinition = {
  key: FactKey;
  label: string;
  type: FactType;
  operators: Operator[];
  requires?: CapabilityKey;
  description: string;
};

const numeric: Operator[] = ['gt', 'gte', 'lt', 'lte', 'eq', 'neq'];
const text: Operator[] = ['equals', 'contains', 'startsWith', 'endsWith'];
const textOrGlob: Operator[] = [...text, 'matchesGlob'];
const domainOps: Operator[] = [...textOrGlob, 'matchesDomain', 'inDomainList'];

export const FACT_DEFINITIONS: FactDefinition[] = [
  {
    key: 'lastActiveMinutes',
    label: '距最后访问',
    type: 'number',
    operators: numeric,
    requires: 'lastAccessed',
    description: '标签最后一次被访问到现在的分钟数；无法获取时不命中。',
  },
  {
    key: 'totalTabCount',
    label: '总标签数',
    type: 'number',
    operators: numeric,
    description: '所有普通窗口中可管理标签的总数。',
  },
  {
    key: 'windowTabCount',
    label: '窗口标签数',
    type: 'number',
    operators: numeric,
    description: '同一窗口内可管理标签的数量。',
  },
  { key: 'pinned', label: '已固定', type: 'boolean', operators: ['is'], description: '标签是否被固定。' },
  { key: 'audible', label: '正在播放声音', type: 'boolean', operators: ['is'], description: '标签是否正在播放声音。' },
  { key: 'active', label: '当前激活', type: 'boolean', operators: ['is'], description: '标签是否是其窗口的当前标签。' },
  { key: 'muted', label: '已静音', type: 'boolean', operators: ['is'], description: '标签是否被静音。' },
  { key: 'discarded', label: '已丢弃', type: 'boolean', operators: ['is'], description: '标签是否已被浏览器丢弃。' },
  {
    key: 'frozen',
    label: '已冻结',
    type: 'boolean',
    operators: ['is'],
    requires: 'frozen',
    description: '标签是否被 Chrome 冻结（需 Chrome 132+）。',
  },
  {
    key: 'grouped',
    label: '在标签组中',
    type: 'boolean',
    operators: ['is'],
    requires: 'tabGroups',
    description: '标签是否属于标签组。',
  },
  {
    key: 'groupCollapsed',
    label: '标签组已折叠',
    type: 'boolean',
    operators: ['is'],
    requires: 'tabGroups',
    description: '标签所在的标签组是否折叠。',
  },
  {
    key: 'windowFocused',
    label: '窗口有焦点',
    type: 'boolean',
    operators: ['is'],
    description: '标签所在窗口是否获得焦点。',
  },
  {
    key: 'onlyTabInWindow',
    label: '窗口唯一标签',
    type: 'boolean',
    operators: ['is'],
    description: '该标签是否是窗口内唯一可管理标签。',
  },
  {
    key: 'domain',
    label: '域名',
    type: 'domain',
    operators: domainOps,
    description: 'URL 的主机名，例如 mail.google.com。',
  },
  { key: 'url', label: 'URL', type: 'url', operators: textOrGlob, description: '完整 URL。' },
  { key: 'title', label: '标题', type: 'title', operators: textOrGlob, description: '标签标题。' },
  {
    key: 'groupTitle',
    label: '标签组名称',
    type: 'groupTitle',
    operators: textOrGlob,
    requires: 'tabGroups',
    description: '标签所在组的名称；未分组时为空字符串。',
  },
];

export const FACT_BY_KEY = new Map<FactKey, FactDefinition>(
  FACT_DEFINITIONS.map((definition) => [definition.key, definition]),
);

export function factDefinition(key: FactKey): FactDefinition {
  const definition = FACT_BY_KEY.get(key);
  if (!definition) throw new Error(`unknown fact: ${key}`);
  return definition;
}

export function isFactAvailable(definition: FactDefinition, caps: Capabilities): boolean {
  switch (definition.requires) {
    case 'lastAccessed':
      return caps.lastAccessed;
    case 'frozen':
      return caps.frozen;
    case 'tabGroups':
      return caps.tabGroups;
    default:
      return true;
  }
}

export function factType(key: FactKey): FactType {
  return factDefinition(key).type;
}
