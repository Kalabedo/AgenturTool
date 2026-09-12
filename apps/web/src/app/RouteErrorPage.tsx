import { Link, isRouteErrorResponse, useRouteError } from 'react-router-dom';
import { messageOf } from '../lib/errorMessage.js';

/**
 * Fehlerseite des Routers.
 *
 * Sie fängt, was beim Rendern einer Seite schiefgeht, und hält dabei die
 * Navigation am Leben: Wer hier landet, kommt mit einem Klick zurück, statt
 * die Anwendung neu laden zu müssen.
 */
export function RouteErrorPage(): JSX.Element {
  const error = useRouteError();
  const description = isRouteErrorResponse(error)
    ? `${error.status} ${error.statusText}`
    : messageOf(error, 'Diese Seite konnte nicht angezeigt werden.');

  return (
    <div className="rounded-lg border border-border bg-surface p-8 text-center">
      <h1 className="text-lg font-semibold text-ink">Diese Seite konnte nicht geladen werden</h1>
      <p className="mt-2 text-sm text-ink-muted">{description}</p>
      <div className="mt-4 flex justify-center gap-3">
        <Link
          to="/"
          className="rounded-md bg-inverse px-4 py-2 text-sm font-medium text-on-inverse hover:bg-inverse-hover focus:outline-none focus-visible:ring-2 focus-visible:ring-focus"
        >
          Zum Dashboard
        </Link>
        <button
          type="button"
          className="rounded-md border border-border-strong bg-surface px-4 py-2 text-sm font-medium text-ink-muted hover:bg-surface-sunken focus:outline-none focus-visible:ring-2 focus-visible:ring-focus"
          onClick={() => window.location.reload()}
        >
          Neu laden
        </button>
      </div>
    </div>
  );
}
