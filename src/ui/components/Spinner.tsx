export function Spinner({ label = '正在加载…' }: { label?: string }) {
  return (
    <output class="spinner">
      <span class="spinner-dot" />
      <span class="muted">{label}</span>
    </output>
  );
}
