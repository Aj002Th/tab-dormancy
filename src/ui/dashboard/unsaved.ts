let dirty = false;

export function setSettingsDirty(value: boolean): void {
  dirty = value;
}

export function hasUnsavedSettings(): boolean {
  return dirty;
}
