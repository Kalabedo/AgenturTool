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
    <div className="rounded-lg border border-slate-200 bg-white p-8 text-center">
      <h1 className="text-lg font-semibold text-slate-900">
        Diese Seite konnte nicht geladen werden
      </h1>
      <p className="mt-2 text-sm text-slate-600">{description}</p>
      <div className="mt-4 flex justify-center gap-3">
        <Link
          to="/"
          className="rounded-md bg-slate-900 px-4 py-2 text-sm font-medium text-white hover:bg-slate-800 focus:outline-none focus-visible:ring-2 focus-visible:ring-slate-300"
        >
          Zum Dashboard
        </Link>
        <button
          type="button"
          className="rounded-md border border-slate-300 bg-white px-4 py-2 text-sm font-medium text-slate-700 hover:bg-slate-50 focus:outline-none focus-visible:ring-2 focus-visible:ring-slate-200"
          onClick={() => window.location.reload()}
        >
          Neu laden
        </button>
      </div>
    </div>
  );
}
