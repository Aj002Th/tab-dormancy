import { describe, expect, it } from 'vitest';
import { cloneStrategy, createPresetStrategies } from '../../src/core/rules/presets';
import { signatureOf } from '../../src/core/rules/signature';

describe('presets', () => {
  it('creates the three built-in strategies', () => {
    const presets = createPresetStrategies(1_000);
    expect(presets.map((preset) => preset.name)).toEqual(['温和', '标准', '激进']);
    expect(presets.every((preset) => preset.builtin)).toBe(true);
    expect(presets.find((preset) => preset.id === 'preset:standard')?.id).toBe('preset:standard');
  });

  it('clones a preset with fresh ids and the same semantics', async () => {
    const source = createPresetStrategies(1_000)[1];
    const clone = cloneStrategy(source, 2_000, 'custom:1');
    expect(clone.builtin).toBe(false);
    expect(clone.id).toBe('custom:1');
    expect(clone.name).toBe('标准 副本');
    expect(await signatureOf(clone.expression)).toBe(await signatureOf(source.expression));
  });
});
