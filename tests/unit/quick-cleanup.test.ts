import { describe, expect, it } from 'vitest';
import { quickAddBlocked, quickToggleDisabled, toggleQuickId } from '../../src/ui/dashboard/quick-cleanup';

const LIMIT = 4;

describe('quick cleanup selection', () => {
  it('appends and removes without duplicates', () => {
    expect(toggleQuickId(['a', 'b'], 'c', true, LIMIT)).toEqual(['a', 'b', 'c']);
    expect(toggleQuickId(['a', 'b'], 'a', true, LIMIT)).toEqual(['b', 'a']);
    expect(toggleQuickId(['a', 'b'], 'a', false, LIMIT)).toEqual(['b']);
  });

  it('refuses to add past the limit but still allows removing', () => {
    expect(toggleQuickId(['a', 'b', 'c', 'd'], 'e', true, LIMIT)).toBeNull();
    expect(toggleQuickId(['a', 'b', 'c', 'd'], 'b', false, LIMIT)).toEqual(['a', 'c', 'd']);
  });

  it('blocks the switch only for strategies that are not already selected', () => {
    expect(quickAddBlocked(['a', 'b', 'c', 'd'], 'e', LIMIT)).toBe(true);
    expect(quickAddBlocked(['a', 'b', 'c', 'd'], 'b', LIMIT)).toBe(false);
  });

  it('blocks every switch while a write is in flight', () => {
    expect(quickToggleDisabled([], 'a', true, LIMIT)).toBe(true);
    expect(quickToggleDisabled([], 'a', false, LIMIT)).toBe(false);
    expect(quickToggleDisabled(['a', 'b', 'c', 'd'], 'e', false, LIMIT)).toBe(true);
  });
});
