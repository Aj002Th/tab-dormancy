import { useEffect, useState } from 'preact/hooks';
import { DEFAULT_SETTINGS, LIMITS } from '../../shared/constants';
import type { Settings, StateSnapshot, Theme } from '../../shared/types';
import { messageOf, send } from '../api';
import { Banner } from '../components/Banner';
import { Button } from '../components/Button';
import { applyTheme } from '../theme';
import { isSettingsDirty, parseSettingsForm, type SettingsForm, toSettingsForm } from './settings-form';

export function SettingsPage() {
  const [state, setState] = useState<StateSnapshot | null>(null);
  const [form, setForm] = useState<SettingsForm | null>(null);
  const [saved, setSaved] = useState<Settings | null>(null);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [notice, setNotice] = useState<string | null>(null);

  async function load() {
    setLoading(true);
    setError(null);
    setNotice(null);
    try {
      const next = await send<StateSnapshot>({ type: 'state.get' });
      applyTheme(next.settings.theme);
      setState(next);
      setSaved(next.settings);
      setForm(toSettingsForm(next.settings));
    } catch (error) {
      setError(messageOf(error));
    } finally {
      setLoading(false);
    }
  }

  useEffect(() => {
    void load();
  }, []);

  function updateForm(patch: Partial<SettingsForm>) {
    if (!form) return;
    setForm({ ...form, ...patch });
    setNotice(null);
    setError(null);
  }

  async function save() {
    if (!form || saving) return;
    const parsed = parseSettingsForm(form);
    if ('error' in parsed) {
      setError(parsed.error);
      setNotice(null);
      return;
    }

    setSaving(true);
    setError(null);
    setNotice(null);
    try {
      const next = await send<Settings>({
        type: 'settings.update',
        patch: parsed.patch,
      });
      applyTheme(next.theme);
      setSaved(next);
      setForm(toSettingsForm(next));
      setNotice('设置已保存');
    } catch (error) {
      setError(messageOf(error));
    } finally {
      setSaving(false);
    }
  }

  function restoreDefaults() {
    if (!form || !saved || saving) return;
    if (!window.confirm('恢复默认值？当前未保存的修改会被覆盖，恢复后仍需点击“保存设置”。')) return;
    const next = toSettingsForm(DEFAULT_SETTINGS);
    setForm(next);
    setError(null);
    setNotice(isSettingsDirty(next, saved) ? '已恢复默认值，点击“保存设置”后生效。' : '已恢复默认值。');
  }

  async function clearHistory() {
    if (!window.confirm('清空全部关闭历史？')) return;
    try {
      await send({ type: 'history.clear' });
      setNotice('关闭历史已清空');
      setError(null);
    } catch (error) {
      setError(messageOf(error));
      setNotice(null);
    }
  }

  if (!state || !form || !saved) {
    return (
      <section class="page">
        <header class="page-head">
          <div>
            <h2>设置</h2>
            <p class="muted">只使用 Chrome 原生状态，不采集使用数据，不发网络请求。</p>
          </div>
        </header>

        {error && <Banner tone="error">{error}</Banner>}
        {loading ? (
          <p class="muted">正在加载设置…</p>
        ) : (
          <div class="row settings-actions">
            <Button onClick={() => void load()} data-testid="settings-retry">
              重试
            </Button>
          </div>
        )}
      </section>
    );
  }

  const dirty = isSettingsDirty(form, saved);
  const atDefaults = !isSettingsDirty(form, DEFAULT_SETTINGS);

  return (
    <section class="page">
      <header class="page-head">
        <div>
          <h2>设置</h2>
          <p class="muted">只使用 Chrome 原生状态，不采集使用数据，不发网络请求。</p>
        </div>
      </header>

      {error && <Banner tone="error">{error}</Banner>}
      {notice && <Banner>{notice}</Banner>}

      <div class="settings-sections">
        <section class="settings-section">
          <div class="settings-section-head">
            <h3>外观</h3>
            <p class="muted small">控制控制台和弹窗的显示主题。</p>
          </div>
          <label class="settings-field">
            <span>主题</span>
            <select
              class="input"
              value={form.theme}
              disabled={saving}
              data-testid="settings-theme"
              onChange={(event) => updateForm({ theme: (event.currentTarget as HTMLSelectElement).value as Theme })}
            >
              <option value="system">跟随系统</option>
              <option value="light">浅色</option>
              <option value="dark">深色</option>
            </select>
            <span class="settings-help">跟随系统会随操作系统的浅色 / 深色模式自动切换。</span>
          </label>
        </section>

        <section class="settings-section">
          <div class="settings-section-head">
            <h3>空闲清理</h3>
            <p class="muted small">标签页空闲超过这个时间后，按当前策略清理。</p>
          </div>
          <label class="settings-field">
            <span>空闲阈值（分钟）</span>
            <input
              class="input"
              type="number"
              min={1}
              max={1440}
              value={form.idleThresholdMinutes}
              disabled={saving}
              data-testid="settings-idle"
              onInput={(event) => updateForm({ idleThresholdMinutes: (event.currentTarget as HTMLInputElement).value })}
            />
            <span class="settings-help">范围 1–1440 分钟。</span>
          </label>
        </section>

        <section class="settings-section">
          <div class="settings-section-head">
            <h3>锁屏清理</h3>
            <p class="muted small">锁屏后是否继续按当前策略清理标签页。</p>
          </div>
          <label class="settings-toggle">
            <input
              type="checkbox"
              checked={form.lockCleanupEnabled}
              disabled={saving}
              data-testid="settings-lock-enabled"
              onChange={(event) =>
                updateForm({ lockCleanupEnabled: (event.currentTarget as HTMLInputElement).checked })
              }
            />
            <span class="settings-toggle-text">
              <strong>锁屏时也执行清理</strong>
              <span class="muted small">关闭后，锁屏不会触发清理。</span>
            </span>
          </label>
          <label class="settings-field">
            <span>锁屏后延迟（分钟）</span>
            <input
              class="input"
              type="number"
              min={0}
              max={1440}
              disabled={saving || !form.lockCleanupEnabled}
              value={form.lockDelayMinutes}
              data-testid="settings-lock-delay"
              onInput={(event) => updateForm({ lockDelayMinutes: (event.currentTarget as HTMLInputElement).value })}
            />
            <span class="settings-help">设为 0 表示锁屏后立即执行。</span>
          </label>
        </section>

        <section class="settings-section">
          <div class="settings-section-head">
            <h3>关闭历史</h3>
            <p class="muted small">记录被关闭的标签，恢复不会删除记录。</p>
          </div>
          <div class="settings-fields">
            <label class="settings-field">
              <span>保留天数</span>
              <input
                class="input"
                type="number"
                min={1}
                max={365}
                value={form.historyRetentionDays}
                disabled={saving}
                data-testid="settings-retention"
                onInput={(event) =>
                  updateForm({ historyRetentionDays: (event.currentTarget as HTMLInputElement).value })
                }
              />
              <span class="settings-help">范围 1–365 天。</span>
            </label>

            <label class="settings-field">
              <span>最多保留条数</span>
              <input
                class="input"
                type="number"
                min={1}
                max={LIMITS.maxHistory}
                value={form.historyMaxRecords}
                disabled={saving}
                data-testid="settings-max-records"
                onInput={(event) => updateForm({ historyMaxRecords: (event.currentTarget as HTMLInputElement).value })}
              />
              <span class="settings-help">范围 1–{LIMITS.maxHistory} 条。</span>
            </label>
          </div>
          <p class="settings-help">任意一项超出后，会优先删除最旧的记录。</p>

          <div class="settings-danger">
            <div>
              <h4>清空关闭历史</h4>
              <p class="muted small">删除全部记录，此操作无法撤销。</p>
            </div>
            <Button variant="danger" onClick={() => void clearHistory()} data-testid="settings-clear-history">
              清空关闭历史
            </Button>
          </div>
        </section>
      </div>

      <div class="row settings-actions">
        <Button variant="primary" onClick={() => void save()} disabled={!dirty || saving} data-testid="settings-save">
          {saving ? '保存中…' : '保存设置'}
        </Button>
        <Button onClick={restoreDefaults} disabled={saving || atDefaults} data-testid="settings-restore-defaults">
          恢复默认值
        </Button>
        {dirty && <span class="muted small">有未保存的更改</span>}
      </div>
    </section>
  );
}
