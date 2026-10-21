const MANAGED_SCHEMES = new Set(['http:', 'https:', 'file:']);

export function isManageableUrl(raw: string): boolean {
  try {
    return MANAGED_SCHEMES.has(new URL(raw).protocol);
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
