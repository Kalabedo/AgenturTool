import type { ReactNode } from 'react';

interface FormActionsProps {
  /** Die Schaltflächen, Hauptaktion zuerst. */
  children: ReactNode;
  /** Rückmeldung zur Leiste — „Gespeichert.", „Ungespeicherte Änderungen". */
  status?: ReactNode;
  /** Steht ganz rechts und ist vom Rest abgesetzt: das Zerstörende. */
  destructive?: ReactNode;
  className?: string;
}

/**
 * Die Schaltflächenleiste unter einem Formular.
 *
 * Überall dieselbe Ordnung: Hauptaktion links außen, die übrigen Knöpfe
 * daneben, die Rückmeldung rechts, und ganz rechts — durch den Zwischenraum
 * sichtbar getrennt — das, was löscht. Wer ein Formular kennt, kennt damit
 * alle.
 *
 * Die Knöpfe stehen in einer eigenen Gruppe und nicht mit der Rückmeldung im
 * selben Fluss: Sonst schöbe jedes erscheinende „Ungespeicherte Änderungen"
 * die Nachbarknöpfe zur Seite oder in die nächste Zeile — ausgerechnet
 * während man klickt.
 *
 * `min-h-[1.25rem]` hält die Zeile der Rückmeldung frei, auch wenn dort
 * gerade nichts steht. Ohne das wüchse die Leiste in dem Moment, in dem eine
 * Meldung erscheint, und alles darunter rutschte nach.
 */
export function FormActions({
  children,
  status,
  destructive,
  className = '',
}: FormActionsProps): JSX.Element {
  return (
    <div className={`flex flex-wrap items-center gap-x-4 gap-y-3 ${className}`}>
      <div className="flex flex-wrap items-center gap-3">{children}</div>

      <div className="min-h-[1.25rem] min-w-0 flex-1 text-sm">{status}</div>

      {destructive !== undefined && <div className="flex items-center gap-3">{destructive}</div>}
    </div>
  );
}
