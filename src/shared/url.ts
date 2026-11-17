const MANAGED_SCHEMES = new Set(['http:', 'https:', 'file:']);

// Built-in pages that are safe to close and can be reopened by the browser.
// Other internal pages (extensions, flags, devtools, …) stay out of reach.
const INTERNAL_PAGES: Record<string, ReadonlySet<string>> = {
  'chrome:': new Set(['newtab', 'settings', 'downloads', 'file-manager']),
  'edge:': new Set(['newtab', 'settings', 'downloads']),
  'chrome-search:': new Set(['local-ntp']),
};

export function isManageableUrl(raw: string, includeInternalPages = false): boolean {
  try {
    const url = new URL(raw);
    if (MANAGED_SCHEMES.has(url.protocol)) return true;
    if (!includeInternalPages) return false;
    return INTERNAL_PAGES[url.protocol]?.has(url.hostname) === true;
  } catch {
    return false;
  }
}

export function domainOf(raw: string): string {
  try {
    const url = new URL(raw);
    return url.protocol === 'file:' ? '' : url.hostname.toLowerCase();
  } catch {
    return '';
  }
}

export function normalizeDomain(input: string): string | null {
  const trimmed = input.trim().toLowerCase();
  if (!trimmed) return null;
  const withoutWildcard = trimmed.replace(/^\*\./, '');
  try {
    const url = new URL(withoutWildcard.includes('://') ? withoutWildcard : `https://${withoutWildcard}`);
    return url.hostname || null;
  } catch {
    return null;
  }
}

export function domainMatches(domain: string, pattern: string): boolean {
  const normalized = normalizeDomain(pattern);
  if (!normalized) return false;
  const value = domain.trim().toLowerCase();
  return value === normalized || value.endsWith(`.${normalized}`);
}

export function globMatches(value: string, pattern: string): boolean {
  const escaped = pattern
    .replace(/[.+^${}()|[\]\\]/g, '\\$&')
    .replace(/\*/g, '.*')
    .replace(/\?/g, '.');
  return new RegExp(`^${escaped}$`, 'i').test(value);
}
