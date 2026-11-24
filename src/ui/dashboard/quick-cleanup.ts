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
  activeId?: string,
): string[] | null {
  const rest = current.filter((item) => item !== id);
  if (!enabled) return rest;
  const selectable = rest.filter((item) => item !== activeId).length;
  if (selectable >= limit) return null;
  return [...rest, id];
}

/** True when the switch must be disabled: already full and not yet selected. */
export function quickAddBlocked(
  current: readonly string[],
  id: string,
  limit: number = LIMITS.maxQuickStrategies,
  activeId?: string,
): boolean {
  if (current.includes(id)) return false;
  // The active strategy keeps its slot but has no switch, so it must not eat
  // one of the user's visible slots.
  return current.filter((item) => item !== activeId).length >= limit;
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
  activeId?: string,
): boolean {
  return saving || quickAddBlocked(current, id, limit, activeId);
}
