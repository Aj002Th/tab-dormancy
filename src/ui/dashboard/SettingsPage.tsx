import { useEffect, useState } from 'preact/hooks';
import { DEFAULT_SETTINGS, LIMITS } from '../../shared/constants';
import { t } from '../../shared/i18n';
import type { Language, Settings, StateSnapshot, Theme } from '../../shared/types';
import { messageOf, send } from '../api';
import { Banner } from '../components/Banner';
import { Button } from '../components/Button';
import { applyLanguage, useLocale } from '../i18n';
import { applyTheme } from '../theme';
import { isSettingsDirty, parseSettingsForm, type SettingsForm, toSettingsForm } from './settings-form';
import { setSettingsDirty } from './unsaved';

export function SettingsPage() {
  useLocale();
  const [state, setState] = useState<StateSnapshot | null>(null);
  const [form, setForm] = useState<SettingsForm | null>(null);
  const [saved, setSaved] = useState<Settings | null>(null);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [notice, setNotice] = useState<{ text: string; tone: 'saved' | 'info' } | null>(null);

  const dirty = form !== null && saved !== null && isSettingsDirty(form, saved);
  const atDefaults = form !== null && !isSettingsDirty(form, DEFAULT_SETTINGS);

  function showNotice(text: string, tone: 'saved' | 'info' = 'saved') {
    setNotice({ text, tone });
  }

  async function load() {
    setLoading(true);
    setError(null);
    setNotice(null);
    try {
      const next = await send<StateSnapshot>({ type: 'state.get' });
      applyTheme(next.settings.theme);
      applyLanguage(next.settings.language);
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

  useEffect(() => {
    setSettingsDirty(dirty);
    return () => setSettingsDirty(false);
  }, [dirty]);

  useEffect(() => {
    if (!dirty) return;
    const onBeforeUnload = (event: BeforeUnloadEvent) => {
      event.preventDefault();
      event.returnValue = '';
    };
    window.addEventListener('beforeunload', onBeforeUnload);
    return () => window.removeEventListener('beforeunload', onBeforeUnload);
  }, [dirty]);

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
      applyLanguage(next.language);
      setSaved(next);
      setForm(toSettingsForm(next));
      showNotice(t('common.saved'));
    } catch (error) {
      setError(messageOf(error));
    } finally {
      setSaving(false);
    }
  }

  function restoreDefaults() {
    if (!form || !saved || saving) return;
    if (!window.confirm(t('settings.restoreConfirm'))) return;
    const next = toSettingsForm(DEFAULT_SETTINGS);
    setForm(next);
    setError(null);
    showNotice(isSettingsDirty(next, saved) ? t('settings.restoredPending') : t('settings.restoredDone'));
  }

  function discardChanges() {
    if (!saved || saving) return;
    setForm(toSettingsForm(saved));
    applyTheme(saved.theme);
    setError(null);
    showNotice(t('common.discarded'), 'info');
  }

  async function clearHistory() {
    if (!window.confirm(t('settings.clearHistoryConfirm'))) return;
    try {
      await send({ type: 'history.clear' });
      showNotice(t('settings.historyCleared'));
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
            <h2>{t('settings.title')}</h2>
            <p class="muted">{t('settings.subtitle')}</p>
          </div>
        </header>

        {error && <Banner tone="error">{error}</Banner>}
        {loading ? (
          <p class="muted">{t('settings.loading')}</p>
        ) : (
          <div class="row settings-actions">
            <Button onClick={() => void load()} data-testid="settings-retry">
              {t('app.retry')}
            </Button>
          </div>
        )}
      </section>
    );
  }

  const statusTone = saving ? 'saving' : error ? 'error' : notice ? notice.tone : dirty ? 'dirty' : 'idle';
  const statusText = saving
    ? t('common.saving')
    : error
      ? error
      : notice
        ? notice.text
        : dirty
          ? t('common.unsaved')
          : null;
  const statusIcon =
    statusTone === 'error'
      ? '!'
      : statusTone === 'dirty'
        ? '!'
        : statusTone === 'saving'
          ? '…'
          : statusTone === 'info'
            ? '↺'
            : '✓';

  return (
    <section class="page">
      <header class="page-head">
        <div>
          <h2>{t('settings.title')}</h2>
          <p class="muted">{t('settings.subtitle')}</p>
        </div>
      </header>

      <div class="settings-sections">
        <section class="settings-section">
          <div class="settings-section-head">
            <h3>{t('settings.appearance')}</h3>
            <p class="muted small">{t('settings.appearanceHelp')}</p>
          </div>
          <label class="settings-field">
            <span>{t('settings.theme')}</span>
            <select
              class="input"
              value={form.theme}
              disabled={saving}
              data-testid="settings-theme"
              onChange={(event) => updateForm({ theme: (event.currentTarget as HTMLSelectElement).value as Theme })}
            >
              <option value="system">{t('settings.themeSystem')}</option>
              <option value="light">{t('settings.themeLight')}</option>
              <option value="dark">{t('settings.themeDark')}</option>
            </select>
            <span class="settings-help">{t('settings.themeHelp')}</span>
          </label>
          <label class="settings-field">
            <span>{t('language.label')}</span>
            <select
              class="input"
              value={form.language}
              disabled={saving}
              data-testid="settings-language"
              onChange={(event) =>
                updateForm({ language: (event.currentTarget as HTMLSelectElement).value as Language })
              }
            >
              <option value="system">{t('language.follow')}</option>
              <option value="zh">{t('language.zh')}</option>
              <option value="en">{t('language.en')}</option>
            </select>
            <span class="settings-help">{t('language.help')}</span>
          </label>
        </section>

        <section class="settings-section">
          <div class="settings-section-head">
            <h3>{t('settings.idle')}</h3>
            <p class="muted small">{t('settings.idleHelp')}</p>
          </div>
          <label class="settings-field">
            <span>{t('settings.idleThreshold')}</span>
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
            <span class="settings-help">{t('settings.idleRange')}</span>
          </label>
        </section>

        <section class="settings-section">
          <div class="settings-section-head">
            <h3>{t('settings.lock')}</h3>
            <p class="muted small">{t('settings.lockHelp')}</p>
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
              <strong>{t('settings.lockEnabled')}</strong>
              <span class="muted small">{t('settings.lockEnabledHelp')}</span>
            </span>
          </label>
          <label class="settings-field">
            <span>{t('settings.lockDelay')}</span>
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
            <span class="settings-help">{t('settings.lockDelayHelp')}</span>
          </label>
        </section>

        <section class="settings-section">
          <div class="settings-section-head">
            <h3>{t('settings.history')}</h3>
            <p class="muted small">{t('settings.historyHelp')}</p>
          </div>
          <div class="settings-fields">
            <label class="settings-field">
              <span>{t('settings.retentionDays')}</span>
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
              <span class="settings-help">{t('settings.retentionDaysRange')}</span>
            </label>

            <label class="settings-field">
              <span>{t('settings.maxRecords')}</span>
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
              <span class="settings-help">{t('settings.maxRecordsRange', { max: LIMITS.maxHistory })}</span>
            </label>
          </div>
          <p class="settings-help">{t('settings.retentionHelp')}</p>

          <div class="settings-danger">
            <div>
              <h4>{t('settings.clearHistory')}</h4>
              <p class="muted small">{t('settings.clearHistoryHelp')}</p>
            </div>
            <Button variant="danger" onClick={() => void clearHistory()} data-testid="settings-clear-history">
              {t('settings.clearHistory')}
            </Button>
          </div>
        </section>
      </div>

      <div class={`settings-savebar settings-savebar-${statusTone}`} data-testid="settings-savebar">
        <output
          class={`settings-status settings-status-${statusTone}`}
          aria-live="polite"
          data-testid="settings-status"
        >
          {statusText && (
            <span class="settings-status-icon" aria-hidden="true">
              {statusIcon}
            </span>
          )}
          {statusText}
        </output>
        <div class="row">
          <Button onClick={restoreDefaults} disabled={saving || atDefaults} data-testid="settings-restore-defaults">
            {t('common.restoreDefaults')}
          </Button>
          <Button onClick={discardChanges} disabled={!dirty || saving} data-testid="settings-discard">
            {t('common.discard')}
          </Button>
          <Button variant="primary" onClick={() => void save()} disabled={!dirty || saving} data-testid="settings-save">
            {saving ? t('common.saving') : t('settings.save')}
          </Button>
        </div>
      </div>
    </section>
  );
}
