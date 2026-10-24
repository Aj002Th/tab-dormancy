import { describe, expect, it } from 'vitest';
import { parseRoute, routeHref } from '../../src/ui/dashboard/routes';

describe('dashboard routes', () => {
  it('parses known routes and defaults to tabs', () => {
    expect(parseRoute('#/tabs')).toBe('tabs');
    expect(parseRoute('#/history')).toBe('history');
    expect(parseRoute('#/strategies')).toBe('strategies');
    expect(parseRoute('#/settings')).toBe('settings');
    expect(parseRoute('#/diagnostics')).toBe('diagnostics');
    expect(parseRoute('#/unknown')).toBe('tabs');
    expect(parseRoute('')).toBe('tabs');
  });

  it('builds hash hrefs', () => {
    expect(routeHref('history')).toBe('#/history');
  });
});
