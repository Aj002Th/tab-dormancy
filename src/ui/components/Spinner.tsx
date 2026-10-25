import { t } from '../../shared/i18n';

export function Spinner({ label }: { label?: string }) {
  return (
    <output class="spinner">
      <span class="spinner-dot" />
      <span class="muted">{label ?? t('app.loading')}</span>
    </output>
  );
}
