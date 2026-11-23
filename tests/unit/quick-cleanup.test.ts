import { describe, expect, it } from 'vitest';
import { quickAddBlocked, quickToggleDisabled, toggleQuickId } from '../../src/ui/dashboard/quick-cleanup';

describe('quick cleanup selection', () => {
  it('appends and removes without duplicates', () => {
    expect(toggleQuickId(['a', 'b'], 'c', true)).toEqual(['a', 'b', 'c']);
    expect(toggleQuickId(['a', 'b'], 'a', true)).toEqual(['b', 'a']);
    expect(toggleQuickId(['a', 'b'], 'a', false)).toEqual(['b']);
  });

  it('refuses to add past the limit but still allows removing', () => {
    expect(toggleQuickId(['a', 'b', 'c', 'd'], 'e', true)).toBeNull();
    expect(toggleQuickId(['a', 'b', 'c', 'd'], 'b', false)).toEqual(['a', 'c', 'd']);
  });

  it('blocks the switch only for strategies that are not already selected', () => {
    expect(quickAddBlocked(['a', 'b', 'c', 'd'], 'e')).toBe(true);
    expect(quickAddBlocked(['a', 'b', 'c', 'd'], 'b')).toBe(false);
  });

  it('blocks every switch while a write is in flight', () => {
    expect(quickToggleDisabled([], 'a', true)).toBe(true);
    expect(quickToggleDisabled([], 'a', false)).toBe(false);
    expect(quickToggleDisabled(['a', 'b', 'c', 'd'], 'e', false)).toBe(true);
  });
});
