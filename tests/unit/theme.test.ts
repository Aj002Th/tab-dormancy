import { describe, expect, it } from 'vitest';
import { isTheme, themeOf } from '../../src/shared/theme';

describe('theme helpers', () => {
  it('accepts supported themes', () => {
    expect(isTheme('system')).toBe(true);
    expect(isTheme('light')).toBe(true);
    expect(isTheme('dark')).toBe(true);
  });

  it('falls back to the system theme', () => {
    expect(themeOf('dark')).toBe('dark');
    expect(themeOf('light')).toBe('light');
    expect(themeOf('sepia')).toBe('system');
    expect(themeOf(undefined)).toBe('system');
    expect(themeOf(null)).toBe('system');
  });
});
