import { describe, expect, it } from 'vitest';
import { allSelected, selectAll, toggleSelection } from '../../src/ui/dashboard/history-selection';

describe('history selection', () => {
  it('toggles ids immutably', () => {
    const first = toggleSelection(new Set(), 'a', true);
    const second = toggleSelection(first, 'b', true);
    const third = toggleSelection(second, 'a', false);
    expect([...first]).toEqual(['a']);
    expect([...second].sort()).toEqual(['a', 'b']);
    expect([...third]).toEqual(['b']);
  });

  it('selects all and reports completion', () => {
    const all = selectAll(['a', 'b', 'c']);
    expect(allSelected(['a', 'b'], all)).toBe(true);
    expect(allSelected(['a', 'b'], new Set(['a']))).toBe(false);
  });
});
