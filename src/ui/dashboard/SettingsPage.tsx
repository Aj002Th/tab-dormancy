import { useEffect, useState } from 'preact/hooks';
import type { Settings, StateSnapshot } from '../../shared/types';
import { messageOf, send } from '../api';
import { Banner } from '../components/Banner';
import { Button } from '../components/Button';
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
      setSaved(next);
      setForm(toSettingsForm(next));
      setNotice('设置已保存');
    } catch (error) {
      setError(messageOf(error));
    } finally {
      setSaving(false);
    }
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

      <div class="settings-grid">
        <label class="field">
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
        </label>

        <label class="field">
          <span>历史保留（天）</span>
          <input
            class="input"
            type="number"
            min={1}
            max={365}
            value={form.historyRetentionDays}
            disabled={saving}
            data-testid="settings-retention"
            onInput={(event) => updateForm({ historyRetentionDays: (event.currentTarget as HTMLInputElement).value })}
          />
        </label>

        <label class="checkbox field-inline">
          <input
            type="checkbox"
            checked={form.lockCleanupEnabled}
            disabled={saving}
            data-testid="settings-lock-enabled"
            onChange={(event) => updateForm({ lockCleanupEnabled: (event.currentTarget as HTMLInputElement).checked })}
          />
          锁屏时也执行清理
        </label>

        <label class="field">
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
        </label>
      </div>

      <div class="row settings-actions">
        <Button variant="primary" onClick={() => void save()} disabled={!dirty || saving} data-testid="settings-save">
          {saving ? '保存中…' : '保存设置'}
        </Button>
        <Button variant="danger" onClick={() => void clearHistory()} data-testid="settings-clear-history">
          清空关闭历史
        </Button>
        {dirty && <span class="muted small">有未保存的更改</span>}
      </div>

      <section class="capability-box">
        <h3>浏览器能力</h3>
        <p class="muted small">
          Chrome {state.capabilities.chromeMajor ?? '未知'} · 最后访问时间{' '}
          {state.capabilities.lastAccessed ? '可用' : '不可用'} · 冻结状态{' '}
          {state.capabilities.frozen ? '可用' : '不可用'} · 标签组 {state.capabilities.tabGroups ? '可用' : '不可用'} ·
          会话恢复 {state.capabilities.sessions ? '可用' : '不可用'}
        </p>
        {state.warnings.map((warning) => (
          <Banner key={warning}>{warning}</Banner>
        ))}
      </section>
    </section>
  );
}
