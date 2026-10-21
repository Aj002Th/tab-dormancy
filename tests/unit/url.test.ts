import { describe, expect, it } from 'vitest';
import { domainMatches, domainOf, globMatches, isManageableUrl, normalizeDomain } from '../../src/shared/url';

describe('url helpers', () => {
  it('extracts hostnames and rejects non-http schemes for domain rules', () => {
    expect(domainOf('https://mail.google.com/mail/u/0')).toBe('mail.google.com');
    expect(domainOf('file:///tmp/a.html')).toBe('');
    expect(domainOf('not a url')).toBe('');
  });

  it('only manages http, https and file urls', () => {
    expect(isManageableUrl('https://example.com')).toBe(true);
    expect(isManageableUrl('http://example.com')).toBe(true);
    expect(isManageableUrl('file:///tmp/a.html')).toBe(true);
    expect(isManageableUrl('chrome://settings')).toBe(false);
    expect(isManageableUrl('devtools://devtools/bundled/inspector.html')).toBe(false);
    expect(isManageableUrl('about:blank')).toBe(false);
  });

  it('matches a domain and its subdomains but not lookalikes', () => {
    expect(domainMatches('mail.google.com', 'google.com')).toBe(true);
    expect(domainMatches('google.com', 'google.com')).toBe(true);
    expect(domainMatches('evilgoogle.com', 'google.com')).toBe(false);
    expect(domainMatches('google.com.evil.test', 'google.com')).toBe(false);
  });

  it('normalizes domain list entries', () => {
    expect(normalizeDomain(' HTTPS://Mail.Google.com/path ')).toBe('mail.google.com');
    expect(normalizeDomain('*.google.com')).toBe('google.com');
    expect(normalizeDomain('not a domain')).toBeNull();
  });

  it('matches globs with only * and ? meta characters', () => {
    expect(globMatches('https://a.com/x?y=1', '*://a.com/*')).toBe(true);
    expect(globMatches('https://a.com/x', 'https://?.com/*')).toBe(true);
    expect(globMatches('https://a.com/x', 'https://b.com/*')).toBe(false);
    expect(globMatches('a.b', 'a.b')).toBe(true);
  });
});
