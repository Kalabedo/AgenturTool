/**
 * Der Hinweis, dass gerade geladen wird.
 *
 * `aria-live="polite"` statt `role="status"` mit sofortiger Ansage: Ein
 * Ladehinweis ist keine Nachricht, die eine Vorlesung unterbrechen darf. Er
 * wird angesagt, sobald gerade nichts anderes gesprochen wird.
 */
export function LoadingNote({ children = 'Wird geladen …' }: { children?: string }): JSX.Element {
  return (
    <p aria-live="polite" className="text-sm text-slate-500">
      {children}
    </p>
  );
}
