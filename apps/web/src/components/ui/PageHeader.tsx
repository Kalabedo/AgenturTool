import type { ReactNode } from 'react';
import { Link } from 'react-router-dom';

interface PageHeaderProps {
  title: string;
  /** Ein Satz darunter, was die Seite tut. */
  description?: ReactNode;
  /** Der Weg zurück zur Liste, über der Überschrift. */
  back?: { to: string; label: string };
  /** Etiketten neben der Überschrift — Status, „archiviert". */
  badges?: ReactNode;
  /** Die Handlung der Seite, rechts außen. Höchstens eine hervorgehobene. */
  actions?: ReactNode;
}

/**
 * Der Kopf einer Seite.
 *
 * Jede Seite hatte ihren eigenen: mal `text-ink-subtle` unter der
 * Überschrift, mal `text-ink-muted`, mal gar keine Beschreibung, und die
 * Handlung mal rechts daneben, mal darunter. Beim Wechsel zwischen zwei
 * Seiten sprang dadurch genau das, was gleich bleiben sollte.
 *
 * `min-h` auf der Zeile mit der Überschrift: Ob rechts eine Schaltfläche
 * steht oder nicht, ändert sonst die Höhe des Kopfes — und damit die Lage
 * von allem darunter.
 */
export function PageHeader({
  title,
  description,
  back,
  badges,
  actions,
}: PageHeaderProps): JSX.Element {
  return (
    <div>
      {back !== undefined && (
        <Link to={back.to} className="text-sm text-ink-subtle hover:underline">
          ← {back.label}
        </Link>
      )}

      <div
        className={[
          'flex min-h-[2.375rem] flex-wrap items-center gap-x-4 gap-y-2',
          back === undefined ? '' : 'mt-1',
        ].join(' ')}
      >
        <div className="flex min-w-0 flex-wrap items-center gap-3">
          <h1 className="text-xl font-semibold text-ink">{title}</h1>
          {badges}
        </div>
        {actions !== undefined && <div className="ml-auto flex items-center gap-3">{actions}</div>}
      </div>

      {description !== undefined && (
        // Die Breite ist begrenzt, damit der Erklärsatz auf einer breiten
        // Seite nicht über 1400 Pixel läuft — gelesen wird er sonst nicht.
        <p className="mt-1 max-w-3xl text-sm text-ink-subtle">{description}</p>
      )}
    </div>
  );
}
