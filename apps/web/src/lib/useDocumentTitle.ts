import { useEffect } from 'react';

/**
 * Setzt den Titel des Browserfensters.
 *
 * Wer mit zwei Rechnungen nebeneinander arbeitet, unterscheidet die Reiter
 * sonst nur an der Reihenfolge. Der Name der Anwendung bleibt hinten dran,
 * damit der Reiter auch schmal noch erkennbar bleibt.
 */
export function useDocumentTitle(title: string | undefined): void {
  useEffect(() => {
    if (title === undefined) return;

    const previous = document.title;
    document.title = `${title} · Privatura`;
    return () => {
      document.title = previous;
    };
  }, [title]);
}
