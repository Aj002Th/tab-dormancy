import { readFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';

const manifest = JSON.parse(readFileSync('public/manifest.json', 'utf8')) as {
  manifest_version: number;
  minimum_chrome_version: string;
  permissions: string[];
  host_permissions?: string[];
  content_scripts?: unknown[];
  background: { service_worker: string; type: string };
  action: { default_popup: string };
  options_ui: { page: string; open_in_tab: boolean };
  description: string;
  default_locale: string;
};

describe('manifest', () => {
  it('uses MV3 and Chrome 121+', () => {
    expect(manifest.manifest_version).toBe(3);
    expect(manifest.minimum_chrome_version).toBe('121');
    expect(manifest.background).toEqual({ service_worker: 'background.js', type: 'module' });
    expect(manifest.action.default_popup).toBe('popup.html');
    expect(manifest.options_ui).toEqual({ page: 'dashboard.html', open_in_tab: true });
  });

  it('requests exactly the approved permissions', () => {
    expect([...manifest.permissions].sort()).toEqual(
      ['alarms', 'idle', 'sessions', 'storage', 'tabGroups', 'tabs'].sort(),
    );
    expect(manifest.host_permissions).toBeUndefined();
    expect(manifest.content_scripts).toBeUndefined();
  });

  it('localizes the extension description', () => {
    expect(manifest.default_locale).toBe('en');
    expect(manifest.description).toBe('__MSG_extDescription__');
    const en = JSON.parse(readFileSync('public/_locales/en/messages.json', 'utf8'));
    const zh = JSON.parse(readFileSync('public/_locales/zh_CN/messages.json', 'utf8'));
    expect(en.extDescription.message).toContain('Close tabs');
    expect(zh.extDescription.message).toContain('关闭标签页');
  });
});
