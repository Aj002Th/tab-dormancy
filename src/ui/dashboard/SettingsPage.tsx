import { useEffect, useState } from 'preact/hooks';
import type { Settings, StateSnapshot } from '../../shared/types';
import { messageOf, send } from '../api';
import { Banner } from '../components/Banner';
import { Button } from '../components/Button';

export function SettingsPage() {
  const [state, setState] = useState<StateSnapshot | null>(null);
  const [form, setForm] = useState<Settings | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [notice, setNotice] = useState<string | null>(null);

  async function load() {
    try {
      const next = await send<StateSnapshot>({ type: 'state.get' });
      setState(next);
      setForm(next.settings);
    } catch (error) {
      setError(messageOf(error));
    }
  }

  useEffect(() => {
    void load();
  }, []);

  async function save() {
    if (!form) return;
    try {
      const next = await send<Settings>({
        type: 'settings.update',
        patch: {
          idleThresholdMinutes: Number(form.idleThresholdMinutes),
          lockCleanupEnabled: form.lockCleanupEnabled,
          lockDelayMinutes: Number(form.lockDelayMinutes),
          historyRetentionDays: Number(form.historyRetentionDays),
        },
      });
      setForm(next);
      setNotice('设置已保存');
      setError(null);
    } catch (error) {
      setError(messageOf(error));
    }
  }

  async function clearHistory() {
    if (!window.confirm('清空全部关闭历史？')) return;
    try {
      await send({ type: 'history.clear' });
      setNotice('关闭历史已清空');
    } catch (error) {
      setError(messageOf(error));
    }
  }

  if (!state || !form) return <p class="muted">正在加载设置…</p>;

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
            data-testid="settings-idle"
            onInput={(event) =>
              setForm({ ...form, idleThresholdMinutes: Number((event.currentTarget as HTMLInputElement).value) })
            }
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
            data-testid="settings-retention"
            onInput={(event) =>
              setForm({ ...form, historyRetentionDays: Number((event.currentTarget as HTMLInputElement).value) })
            }
          />
        </label>

        <label class="checkbox field-inline">
          <input
            type="checkbox"
            checked={form.lockCleanupEnabled}
            data-testid="settings-lock-enabled"
            onChange={(event) =>
              setForm({ ...form, lockCleanupEnabled: (event.currentTarget as HTMLInputElement).checked })
            }
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
            disabled={!form.lockCleanupEnabled}
            value={form.lockDelayMinutes}
            data-testid="settings-lock-delay"
            onInput={(event) =>
              setForm({ ...form, lockDelayMinutes: Number((event.currentTarget as HTMLInputElement).value) })
            }
          />
        </label>
      </div>

      <div class="row settings-actions">
        <Button variant="primary" onClick={() => void save()} data-testid="settings-save">
          保存设置
        </Button>
        <Button variant="danger" onClick={() => void clearHistory()} data-testid="settings-clear-history">
          清空关闭历史
        </Button>
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
