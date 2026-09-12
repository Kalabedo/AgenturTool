import { useEffect, useId, useRef, type ReactNode } from 'react';

interface DialogProps {
  open: boolean;
  onClose: () => void;
  title: string;
  description?: string;
  children: ReactNode;
  /** Die Schaltflächen am Fuß — rechtsbündig, Hauptaktion zuletzt. */
  footer: ReactNode;
  /**
   * Wie breit der Dialog höchstens wird.
   *
   * `normal` ist auf Formularbreite ausgelegt. `wide` ist für Inhalte
   * gedacht, die sich nicht kürzen lassen — die Dokumentvorschau etwa
   * zeigt ein A4-Blatt und schrumpft sonst auf Briefmarkengröße.
   */
  size?: 'normal' | 'wide';
}

/**
 * Ein modaler Dialog auf Basis des `<dialog>`-Elements.
 *
 * Bewusst das native Element statt eines nachgebauten Overlays: `showModal()`
 * bringt das mit, was an selbstgebauten Dialogen regelmäßig fehlt — der Fokus
 * bleibt im Dialog gefangen, Escape schließt ihn, der Rest der Seite wird für
 * Tastatur und Screenreader unerreichbar, und die Darstellung liegt in der
 * Top-Layer statt in einem z-index-Wettbewerb.
 *
 * Der Zustand wird als Eigenschaft geführt und nicht dem DOM überlassen: React
 * soll die Wahrheit halten, und `showModal()`/`close()` sind dann nur noch die
 * Wirkung davon.
 */
export function Dialog({
  open,
  onClose,
  title,
  description,
  children,
  footer,
  size = 'normal',
}: DialogProps): JSX.Element {
  const ref = useRef<HTMLDialogElement>(null);
  // Erzeugt statt fest verdrahtet: Zwei Dialoge auf einer Seite teilten sich
  // sonst dieselbe Kennung, und die Beschriftung zeigte auf den falschen.
  const titleId = useId();

  useEffect(() => {
    const element = ref.current;
    if (element === null) return;

    // Die Abfragen auf `element.open` sind nötig, nicht vorsichtshalber:
    // `showModal()` auf einem bereits offenen Dialog wirft.
    if (open && !element.open) element.showModal();
    if (!open && element.open) element.close();
  }, [open]);

  return (
    <dialog
      ref={ref}
      aria-labelledby={titleId}
      // Escape löst `cancel` aus. Ohne diesen Abfang schlösse der Browser den
      // Dialog, während die Eigenschaft weiter „offen" sagt — beim nächsten
      // Öffnen bliebe er dann unsichtbar.
      onCancel={(event) => {
        event.preventDefault();
        onClose();
      }}
      onClose={onClose}
      className={[
        'm-auto rounded-lg border border-slate-200 bg-white p-0',
        size === 'wide' ? 'w-[min(64rem,calc(100vw-2rem))]' : 'w-[min(40rem,calc(100vw-2rem))]',
        'text-slate-900 shadow-xl backdrop:bg-slate-900/40',
      ].join(' ')}
    >
      {/* Der Inhalt scrollt in sich selbst, damit eine lange Feldliste den
          Dialog nicht über den Bildschirmrand hinauswachsen lässt und die
          Schaltflächen am Fuß immer erreichbar bleiben. */}
      <div
        className={[
          'flex flex-col',
          size === 'wide' ? 'max-h-[calc(100vh-4rem)]' : 'max-h-[min(44rem,calc(100vh-4rem))]',
        ].join(' ')}
      >
        <header className="border-b border-slate-200 px-6 py-4">
          <h2 id={titleId} className="text-base font-semibold text-slate-900">
            {title}
          </h2>
          {description !== undefined && (
            <p className="mt-1 text-sm text-slate-500">{description}</p>
          )}
        </header>

        <div className="min-h-0 flex-1 overflow-y-auto px-6 py-5">{children}</div>

        <footer className="flex flex-wrap items-center justify-end gap-3 border-t border-slate-200 bg-slate-50 px-6 py-4">
          {footer}
        </footer>
      </div>
    </dialog>
  );
}
