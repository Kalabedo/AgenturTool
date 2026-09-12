import type { ReactNode } from 'react';

type Tone = 'neutral' | 'success' | 'info' | 'warning' | 'danger';

const TONES: Record<Tone, string> = {
  neutral: 'bg-slate-100 text-slate-600',
  success: 'bg-emerald-100 text-emerald-800',
  info: 'bg-sky-100 text-sky-800',
  warning: 'bg-amber-100 text-amber-800',
  danger: 'bg-rose-100 text-rose-800',
};

/**
 * Ein kurzes Etikett: Status, „archiviert", „Storno".
 *
 * Eine einzige Größe für alle. Vorher trugen dieselben Zustände je nach
 * Seite `px-1.5` oder `px-2` — nebeneinander in einer Liste fiel das als
 * Unruhe auf, ohne dass ein Unterschied gemeint war.
 */
export function Badge({
  tone = 'neutral',
  children,
  className = '',
}: {
  tone?: Tone;
  children: ReactNode;
  className?: string;
}): JSX.Element {
  return (
    <span
      className={`inline-block whitespace-nowrap rounded px-2 py-0.5 text-xs ${TONES[tone]} ${className}`}
    >
      {children}
    </span>
  );
}
