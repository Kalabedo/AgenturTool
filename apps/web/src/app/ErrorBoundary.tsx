import { Component, type ErrorInfo, type ReactNode } from 'react';

interface Props {
  children: ReactNode;
}

interface State {
  error: Error | null;
}

/**
 * Die letzte Wand vor der weißen Seite.
 *
 * React wirft bei einem Fehler im Rendern den gesamten Baum weg — ohne diese
 * Grenze bliebe ein leeres Fenster ohne jede Auskunft, und die Ursache stünde
 * nur in der Konsole, in die niemand schaut. Der Router hat für seine Routen
 * eine eigene Fehlerseite; diese Grenze fängt, was außerhalb davon passiert,
 * und deshalb steht sie ganz außen.
 *
 * Bewusst eine Klassenkomponente: Fehlergrenzen gibt es in React nur so.
 */
export class ErrorBoundary extends Component<Props, State> {
  override state: State = { error: null };

  static getDerivedStateFromError(error: Error): State {
    return { error };
  }

  override componentDidCatch(error: Error, info: ErrorInfo): void {
    // Nicht in einen Dienst gemeldet, sondern in die Konsole: Die Anwendung
    // läuft auf dem eigenen Rechner, und ein Absturzbericht an einen fremden
    // Server wäre das Gegenteil dessen, wofür sie gebaut ist.
    console.error('Unbehandelter Fehler im Frontend:', error, info.componentStack);
  }

  override render(): ReactNode {
    if (this.state.error === null) return this.props.children;

    return (
      <div className="flex min-h-screen items-center justify-center bg-surface-sunken px-6">
        <div className="max-w-lg rounded-lg border border-border bg-surface p-6">
          <h1 className="text-lg font-semibold text-ink">Da ist etwas schiefgegangen</h1>
          <p className="mt-2 text-sm text-ink-muted">
            Die Anwendung ist über einen Fehler gestolpert. Deine Daten sind davon nicht betroffen —
            gespeichert wird auf dem Server, nicht im Browser.
          </p>
          <p className="mt-2 break-words font-mono text-xs text-ink-subtle">
            {this.state.error.message}
          </p>
          <button
            type="button"
            className="mt-4 inline-flex rounded-md bg-inverse px-4 py-2 text-sm font-medium text-on-inverse hover:bg-inverse-hover focus:outline-none focus-visible:ring-2 focus-visible:ring-focus"
            onClick={() => window.location.reload()}
          >
            Neu laden
          </button>
        </div>
      </div>
    );
  }
}
