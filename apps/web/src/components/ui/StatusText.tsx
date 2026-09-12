import type { ReactNode } from 'react';

type Tone = 'success' | 'error' | 'muted';

const TONES: Record<Tone, string> = {
  success: 'text-emerald-700',
  error: 'text-rose-600',
  muted: 'text-slate-500',
};

/**
 * Eine kurze Rückmeldung neben einer Schaltfläche.
 *
 * Bis hierher hatte jede Seite ihre eigene: mal `text-emerald-700` ohne
 * Rolle, mal `role="alert"` ohne Farbe. Die Rolle folgt jetzt aus dem Ton —
 * ein Fehler unterbricht die Vorlesung eines Screenreaders (`alert`), eine
 * Bestätigung wartet, bis gerade nichts anderes gesprochen wird (`status`).
 */
export function StatusText({
  tone,
  children,
  className = '',
}: {
  tone: Tone;
  children: ReactNode;
  className?: string;
}): JSX.Element {
  return (
    <span
      role={tone === 'error' ? 'alert' : 'status'}
      className={`text-sm ${TONES[tone]} ${className}`}
    >
      {children}
    </span>
  );
}
