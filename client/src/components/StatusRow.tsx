export type StatusTone = 'ok' | 'warn' | 'error' | 'idle';

interface Props {
  label: string;
  value: string;
  tone: StatusTone;
  hint?: string;
}

/** Linha do painel de diagnóstico: indicador colorido, rótulo e valor. */
export function StatusRow({ label, value, tone, hint }: Props) {
  return (
    <div className="status-row" title={hint}>
      <span className={`status-dot status-dot--${tone}`} aria-hidden="true" />
      <span className="status-label">{label}</span>
      <span className="status-value">{value}</span>
    </div>
  );
}
