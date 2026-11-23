import { LIMITS } from '../../shared/constants';

/**
 * Adds or removes an id, removing any duplicate first. Re-adding moves the id to
 * the end; display order is decided elsewhere. Returns null when the list is
 * already full, so callers can show the limit message instead of silently
 * dropping the click.
 */
export function toggleQuickId(
  current: readonly string[],
  id: string,
  enabled: boolean,
  limit: number = LIMITS.maxQuickStrategies,
): string[] | null {
  const rest = current.filter((item) => item !== id);
  if (!enabled) return rest;
  if (rest.length >= limit) return null;
  return [...rest, id];
}

/** True when the switch must be disabled: already full and not yet selected. */
export function quickAddBlocked(
  current: readonly string[],
  id: string,
  limit: number = LIMITS.maxQuickStrategies,
): boolean {
  return current.length >= limit && !current.includes(id);
}

/**
 * Every switch is inert while a write is in flight, so two rapid toggles can
 * never interleave their responses or roll back each other's choice.
 */
export function quickToggleDisabled(
  current: readonly string[],
  id: string,
  saving: boolean,
  limit: number = LIMITS.maxQuickStrategies,
): boolean {
  return saving || quickAddBlocked(current, id, limit);
}
