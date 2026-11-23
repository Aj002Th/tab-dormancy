import { describe, expect, it } from 'vitest';
import { quickButtons } from '../../src/ui/popup/quick-buttons';

describe('quick cleanup buttons', () => {
  it('keeps server order and disables empty or unavailable strategies', () => {
    const buttons = quickButtons([
      { strategyId: 'a', name: 'Work', matched: 3, status: 'ready' },
      { strategyId: 'b', name: 'Empty', matched: 0, status: 'ready' },
      { strategyId: 'c', name: 'Broken', matched: 0, status: 'invalid' },
    ]);
    expect(buttons.map((button) => button.strategyId)).toEqual(['a', 'b', 'c']);
    expect(buttons[0]).toMatchObject({ disabled: false, status: 'ready', count: 3 });
    expect(buttons[1]).toMatchObject({ disabled: true, status: 'empty', count: 0 });
    expect(buttons[2]).toMatchObject({ disabled: true, status: 'invalid' });
  });
});
