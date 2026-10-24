import type { Capabilities, FactKey, Operator } from '../../shared/types';

export type FactType = 'number' | 'boolean' | 'string' | 'domain' | 'url' | 'title' | 'groupTitle';
export type CapabilityKey = 'lastAccessed' | 'frozen' | 'tabGroups';

export type FactDefinition = {
  key: FactKey;
  type: FactType;
  operators: Operator[];
  requires?: CapabilityKey;
};

const numeric: Operator[] = ['gt', 'gte', 'lt', 'lte', 'eq', 'neq'];
const text: Operator[] = ['equals', 'contains', 'startsWith', 'endsWith'];
const textOrGlob: Operator[] = [...text, 'matchesGlob'];
const domainOps: Operator[] = [...textOrGlob, 'matchesDomain', 'inDomainList'];

export const FACT_DEFINITIONS: FactDefinition[] = [
  {
    key: 'lastActiveMinutes',
    type: 'number',
    operators: numeric,
    requires: 'lastAccessed',
  },
  {
    key: 'totalTabCount',
    type: 'number',
    operators: numeric,
  },
  {
    key: 'windowTabCount',
    type: 'number',
    operators: numeric,
  },
  { key: 'pinned', type: 'boolean', operators: ['is'] },
  { key: 'audible', type: 'boolean', operators: ['is'] },
  { key: 'active', type: 'boolean', operators: ['is'] },
  { key: 'muted', type: 'boolean', operators: ['is'] },
  { key: 'discarded', type: 'boolean', operators: ['is'] },
  {
    key: 'frozen',
    type: 'boolean',
    operators: ['is'],
    requires: 'frozen',
  },
  {
    key: 'grouped',
    type: 'boolean',
    operators: ['is'],
    requires: 'tabGroups',
  },
  {
    key: 'groupCollapsed',
    type: 'boolean',
    operators: ['is'],
    requires: 'tabGroups',
  },
  {
    key: 'windowFocused',
    type: 'boolean',
    operators: ['is'],
  },
  {
    key: 'onlyTabInWindow',
    type: 'boolean',
    operators: ['is'],
  },
  {
    key: 'domain',
    type: 'domain',
    operators: domainOps,
  },
  { key: 'url', type: 'url', operators: textOrGlob },
  { key: 'title', type: 'title', operators: textOrGlob },
  {
    key: 'groupTitle',
    type: 'groupTitle',
    operators: textOrGlob,
    requires: 'tabGroups',
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
