import { useEffect, useState } from 'preact/hooks';
import { DEFAULT_SETTINGS, LIMITS } from '../../shared/constants';
import { t } from '../../shared/i18n';
import type { Language, Settings, StateSnapshot, Theme } from '../../shared/types';
import { messageOf, send } from '../api';
import { Banner } from '../components/Banner';
import { Button } from '../components/Button';
import { Select } from '../components/Select';
import { applyLanguage, useLocale } from '../i18n';
import { applyTheme } from '../theme';
import {
  isSettingsDirty,
  type SettingsErrors,
  type SettingsForm,
  toSettingsForm,
  validateSettingsForm,
} from './settings-form';
import { setSettingsDirty } from './unsaved';

type ConfirmAction = 'restore' | 'clear';
type StatusTone = 'idle' | 'saving' | 'error' | 'dirty' | 'info' | 'saved';

const FIELD_IDS: Record<keyof SettingsForm, string> = {
  idleThresholdMinutes: 'settings-idle',
  lockCleanupEnabled: 'settings-lock-enabled',
  lockDelayMinutes: 'settings-lock-delay',
  historyRetentionDays: 'settings-retention',
  historyMaxRecords: 'settings-max-records',
  theme: 'settings-theme',
  language: 'settings-language',
};

function fieldId(field: keyof SettingsForm): string {
  return FIELD_IDS[field];
}

function focusField(field: keyof SettingsForm): void {
  requestAnimationFrame(() => document.getElementById(fieldId(field))?.focus());
}

function StatusIcon({ tone }: { tone: Exclude<StatusTone, 'idle'> }) {
  if (tone === 'saving') {
    return (
      <span class="settings-status-icon" aria-hidden="true">
        <span class="settings-status-spinner" />
      </span>
    );
  }

  return (
    <span class="settings-status-icon" aria-hidden="true">
      <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" aria-hidden="true">
        <circle cx="12" cy="12" r="9" />
        {tone === 'saved' ? (
          <path d="m8.5 12 2.5 2.5 4.5-5" stroke-linecap="round" stroke-linejoin="round" />
        ) : tone === 'info' ? (
          <>
            <path d="M12 11v5" stroke-linecap="round" />
            <path d="M12 8h.01" stroke-linecap="round" />
          </>
        ) : (
          <>
            <path d="M12 8v5" stroke-linecap="round" />
            <path d="M12 16h.01" stroke-linecap="round" />
          </>
        )}
      </svg>
    </span>
  );
}

export function SettingsPage() {
  useLocale();
  const [state, setState] = useState<StateSnapshot | null>(null);
  const [form, setForm] = useState<SettingsForm | null>(null);
  const [saved, setSaved] = useState<Settings | null>(null);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [notice, setNotice] = useState<{ text: string; tone: 'saved' | 'info' } | null>(null);
  const [fieldErrors, setFieldErrors] = useState<SettingsErrors>({});
  const [confirmAction, setConfirmAction] = useState<ConfirmAction | null>(null);

  const dirty = form !== null && saved !== null && isSettingsDirty(form, saved);
  const atDefaults = form !== null && !isSettingsDirty(form, DEFAULT_SETTINGS);

  function showNotice(text: string, tone: 'saved' | 'info' = 'saved') {
    setNotice({ text, tone });
  }

  async function load() {
    setLoading(true);
    setError(null);
    setNotice(null);
    setFieldErrors({});
    setConfirmAction(null);
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

  useEffect(() => {
    if (!confirmAction) return;
    requestAnimationFrame(() => document.getElementById('settings-confirm-action')?.focus());
  }, [confirmAction]);

  function updateForm(patch: Partial<SettingsForm>) {
    if (!form) return;
    setForm({ ...form, ...patch });
    setNotice(null);
    setError(null);
    const changed = Object.keys(patch) as Array<keyof SettingsForm>;
    setFieldErrors((current) => {
      if (!changed.some((key) => current[key])) return current;
      const next = { ...current };
      for (const key of changed) delete next[key];
      return next;
    });
  }

  function validateField(field: keyof SettingsForm) {
    if (!form) return;
    const result = validateSettingsForm(form);
    setFieldErrors((current) => {
      const next = { ...current };
      const message = result.errors[field];
      if (message) next[field] = message;
      else delete next[field];
      return next;
    });
  }

  async function save() {
    if (!form || saving) return;
    const result = validateSettingsForm(form);
    if (!result.patch) {
      const first = Object.keys(result.errors)[0] as keyof SettingsForm | undefined;
      setFieldErrors(result.errors);
      setError(first ? (result.errors[first] ?? t('errors.INVALID_SETTINGS')) : t('errors.INVALID_SETTINGS'));
      setNotice(null);
      if (first) focusField(first);
      return;
    }

    setSaving(true);
    setError(null);
    setNotice(null);
    setFieldErrors({});
    try {
      const next = await send<Settings>({
        type: 'settings.update',
        patch: result.patch,
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

  function requestRestoreDefaults() {
    if (!form || !saved || saving) return;
    setConfirmAction('restore');
  }

  function applyRestoreDefaults() {
    if (!form || !saved) return;
    const next = toSettingsForm(DEFAULT_SETTINGS);
    setForm(next);
    setFieldErrors({});
    setError(null);
    setConfirmAction(null);
    showNotice(isSettingsDirty(next, saved) ? t('settings.restoredPending') : t('settings.restoredDone'));
  }

  function discardChanges() {
    if (!saved || saving) return;
    setForm(toSettingsForm(saved));
    setFieldErrors({});
    setConfirmAction(null);
    applyTheme(saved.theme);
    setError(null);
    showNotice(t('common.discarded'), 'info');
  }

  function requestClearHistory() {
    if (saving) return;
    setConfirmAction('clear');
  }

  async function clearHistory() {
    setConfirmAction(null);
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
      <section class="page settings-page">
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

  const statusTone: StatusTone = saving ? 'saving' : error ? 'error' : notice ? notice.tone : dirty ? 'dirty' : 'idle';
  const statusText = saving
    ? t('common.saving')
    : error
      ? error
      : notice
        ? notice.text
        : dirty
          ? t('common.unsaved')
          : null;

  return (
    <section class="page settings-page">
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
          <div class="settings-section-body">
            <div class="settings-fields">
              <label class="settings-field" for="settings-theme">
                <span>{t('settings.theme')}</span>
                <Select
                  id="settings-theme"
                  data-testid="settings-theme"
                  value={form.theme}
                  disabled={saving}
                  options={[
                    { value: 'system', label: t('settings.themeSystem') },
                    { value: 'light', label: t('settings.themeLight') },
                    { value: 'dark', label: t('settings.themeDark') },
                  ]}
                  onChange={(value) => updateForm({ theme: value as Theme })}
                />
                <span class="settings-help" id="settings-theme-help">
                  {t('settings.themeHelp')}
                </span>
              </label>
              <label class="settings-field" for="settings-language">
                <span>{t('language.label')}</span>
                <Select
                  id="settings-language"
                  data-testid="settings-language"
                  value={form.language}
                  disabled={saving}
                  options={[
                    { value: 'system', label: t('language.follow') },
                    { value: 'zh', label: t('language.zh') },
                    { value: 'en', label: t('language.en') },
                  ]}
                  onChange={(value) => updateForm({ language: value as Language })}
                />
                <span class="settings-help" id="settings-language-help">
                  {t('language.help')}
                </span>
              </label>
            </div>
          </div>
        </section>

        <section class="settings-section">
          <div class="settings-section-head">
            <h3>{t('settings.idle')}</h3>
            <p class="muted small">{t('settings.idleHelp')}</p>
          </div>
          <div class="settings-section-body">
            <label class="settings-field" for="settings-idle">
              <span>{t('settings.idleThreshold')}</span>
              <input
                id="settings-idle"
                class="input"
                type="number"
                min={1}
                max={1440}
                value={form.idleThresholdMinutes}
                disabled={saving}
                data-testid="settings-idle"
                aria-invalid={fieldErrors.idleThresholdMinutes ? 'true' : undefined}
                aria-describedby={
                  fieldErrors.idleThresholdMinutes ? 'settings-idle-help settings-idle-error' : 'settings-idle-help'
                }
                onInput={(event) =>
                  updateForm({ idleThresholdMinutes: (event.currentTarget as HTMLInputElement).value })
                }
                onBlur={() => validateField('idleThresholdMinutes')}
              />
              <span class="settings-help" id="settings-idle-help">
                {t('settings.idleRange')}
              </span>
              {fieldErrors.idleThresholdMinutes && (
                <span class="field-error" id="settings-idle-error" role="alert">
                  {fieldErrors.idleThresholdMinutes}
                </span>
              )}
            </label>
          </div>
        </section>

        <section class="settings-section">
          <div class="settings-section-head">
            <h3>{t('settings.lock')}</h3>
            <p class="muted small">{t('settings.lockHelp')}</p>
          </div>
          <div class="settings-section-body">
            <label class="settings-toggle">
              <input
                id="settings-lock-enabled"
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
            <label class="settings-field" for="settings-lock-delay">
              <span>{t('settings.lockDelay')}</span>
              <input
                id="settings-lock-delay"
                class="input"
                type="number"
                min={0}
                max={1440}
                disabled={saving || !form.lockCleanupEnabled}
                value={form.lockDelayMinutes}
                data-testid="settings-lock-delay"
                aria-invalid={fieldErrors.lockDelayMinutes ? 'true' : undefined}
                aria-describedby={
                  fieldErrors.lockDelayMinutes
                    ? 'settings-lock-delay-help settings-lock-delay-error'
                    : 'settings-lock-delay-help'
                }
                onInput={(event) => updateForm({ lockDelayMinutes: (event.currentTarget as HTMLInputElement).value })}
                onBlur={() => validateField('lockDelayMinutes')}
              />
              <span class="settings-help" id="settings-lock-delay-help">
                {t('settings.lockDelayHelp')}
              </span>
              {fieldErrors.lockDelayMinutes && (
                <span class="field-error" id="settings-lock-delay-error" role="alert">
                  {fieldErrors.lockDelayMinutes}
                </span>
              )}
            </label>
          </div>
        </section>

        <section class="settings-section">
          <div class="settings-section-head">
            <h3>{t('settings.history')}</h3>
            <p class="muted small">{t('settings.historyHelp')}</p>
          </div>
          <div class="settings-section-body">
            <div class="settings-fields">
              <label class="settings-field" for="settings-retention">
                <span>{t('settings.retentionDays')}</span>
                <input
                  id="settings-retention"
                  class="input"
                  type="number"
                  min={1}
                  max={365}
                  value={form.historyRetentionDays}
                  disabled={saving}
                  data-testid="settings-retention"
                  aria-invalid={fieldErrors.historyRetentionDays ? 'true' : undefined}
                  aria-describedby={
                    fieldErrors.historyRetentionDays
                      ? 'settings-retention-help settings-retention-error'
                      : 'settings-retention-help'
                  }
                  onInput={(event) =>
                    updateForm({ historyRetentionDays: (event.currentTarget as HTMLInputElement).value })
                  }
                  onBlur={() => validateField('historyRetentionDays')}
                />
                <span class="settings-help" id="settings-retention-help">
                  {t('settings.retentionDaysRange')}
                </span>
                {fieldErrors.historyRetentionDays && (
                  <span class="field-error" id="settings-retention-error" role="alert">
                    {fieldErrors.historyRetentionDays}
                  </span>
                )}
              </label>

              <label class="settings-field" for="settings-max-records">
                <span>{t('settings.maxRecords')}</span>
                <input
                  id="settings-max-records"
                  class="input"
                  type="number"
                  min={1}
                  max={LIMITS.maxHistory}
                  value={form.historyMaxRecords}
                  disabled={saving}
                  data-testid="settings-max-records"
                  aria-invalid={fieldErrors.historyMaxRecords ? 'true' : undefined}
                  aria-describedby={
                    fieldErrors.historyMaxRecords
                      ? 'settings-max-records-help settings-max-records-error'
                      : 'settings-max-records-help'
                  }
                  onInput={(event) =>
                    updateForm({ historyMaxRecords: (event.currentTarget as HTMLInputElement).value })
                  }
                  onBlur={() => validateField('historyMaxRecords')}
                />
                <span class="settings-help" id="settings-max-records-help">
                  {t('settings.maxRecordsRange', { max: LIMITS.maxHistory })}
                </span>
                {fieldErrors.historyMaxRecords && (
                  <span class="field-error" id="settings-max-records-error" role="alert">
                    {fieldErrors.historyMaxRecords}
                  </span>
                )}
              </label>
            </div>
            <p class="settings-help">{t('settings.retentionHelp')}</p>

            <div class="settings-danger">
              <div>
                <h4>{t('settings.clearHistory')}</h4>
                <p class="muted small">{t('settings.clearHistoryHelp')}</p>
              </div>
              <Button variant="danger" onClick={requestClearHistory} data-testid="settings-clear-history">
                {t('settings.clearHistory')}
              </Button>
            </div>
          </div>
        </section>
      </div>

      {confirmAction && (
        <div
          class="settings-confirm"
          role="alert"
          onKeyDown={(event) => {
            if (event.key === 'Escape') setConfirmAction(null);
          }}
        >
          <p>{confirmAction === 'clear' ? t('settings.clearHistoryConfirm') : t('settings.restoreConfirm')}</p>
          <div class="row">
            <Button
              id="settings-confirm-action"
              variant="danger"
              onClick={confirmAction === 'clear' ? () => void clearHistory() : applyRestoreDefaults}
              data-testid="settings-confirm-action"
            >
              {confirmAction === 'clear' ? t('settings.clearHistory') : t('common.restoreDefaults')}
            </Button>
            <Button onClick={() => setConfirmAction(null)} data-testid="settings-confirm-cancel">
              {t('common.cancel')}
            </Button>
          </div>
        </div>
      )}

      <div class={`settings-savebar settings-savebar-${statusTone}`} data-testid="settings-savebar">
        <output
          class={`settings-status settings-status-${statusTone}`}
          aria-live="polite"
          data-testid="settings-status"
        >
          {statusText && statusTone !== 'idle' && <StatusIcon tone={statusTone} />}
          {statusText}
        </output>
        <div class="row">
          <Button
            onClick={requestRestoreDefaults}
            disabled={saving || atDefaults || confirmAction !== null}
            data-testid="settings-restore-defaults"
          >
            {t('common.restoreDefaults')}
          </Button>
          <Button
            onClick={discardChanges}
            disabled={!dirty || saving || confirmAction !== null}
            data-testid="settings-discard"
          >
            {t('common.discard')}
          </Button>
          <Button
            variant="primary"
            onClick={() => void save()}
            disabled={!dirty || saving || confirmAction !== null}
            data-testid="settings-save"
          >
            {saving ? t('common.saving') : t('settings.save')}
          </Button>
        </div>
      </div>
    </section>
  );
}
