let settingsDirty = false;
let strategiesDirty = false;

export function setSettingsDirty(value: boolean): void {
  settingsDirty = value;
}

export function setStrategiesDirty(value: boolean): void {
  strategiesDirty = value;
}

export function hasUnsavedChanges(): boolean {
  return settingsDirty || strategiesDirty;
}

export function hasUnsavedStrategies(): boolean {
  return strategiesDirty;
}
