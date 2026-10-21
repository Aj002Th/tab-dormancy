import { describe, expect, it } from 'vitest';
import { runWithConcurrency } from '../../src/shared/async';

describe('runWithConcurrency', () => {
  it('processes every item and respects the concurrency limit', async () => {
    let active = 0;
    let peak = 0;
    const seen: number[] = [];
    await runWithConcurrency([1, 2, 3, 4, 5], 2, async (value) => {
      active += 1;
      peak = Math.max(peak, active);
      seen.push(value);
      await new Promise((resolve) => setTimeout(resolve, 1));
      active -= 1;
    });
    expect(seen.sort()).toEqual([1, 2, 3, 4, 5]);
    expect(peak).toBeLessThanOrEqual(2);
  });
});
