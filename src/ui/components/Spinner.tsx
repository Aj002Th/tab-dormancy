import { t } from '../../shared/i18n';

export function Spinner({ label }: { label?: string }) {
  return (
    <output class="spinner" aria-live="polite" aria-atomic="true">
      <span class="spinner-dot" aria-hidden="true" />
      <span class="muted">{label ?? t('app.loading')}</span>
    </output>
  );
}
