export function toggleSelection(selected: Set<string>, id: string, checked: boolean): Set<string> {
  const next = new Set(selected);
  if (checked) next.add(id);
  else next.delete(id);
  return next;
}

export function selectAll(ids: string[]): Set<string> {
  return new Set(ids);
}

export function allSelected(ids: string[], selected: Set<string>): boolean {
  return ids.length > 0 && ids.every((id) => selected.has(id));
}
