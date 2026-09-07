import { Link } from 'react-router-dom';

export function NotFoundPage(): JSX.Element {
  return (
    <div className="rounded-lg border border-slate-200 bg-white p-8 text-center">
      <h1 className="text-lg font-semibold text-slate-900">Seite nicht gefunden</h1>
      <p className="mt-1 text-sm text-slate-500">
        Diese Seite gibt es nicht — oder sie entsteht erst in einem späteren Schritt.
      </p>
      <Link to="/" className="mt-4 inline-block text-sm font-medium text-slate-900 underline">
        Zurück zum Dashboard
      </Link>
    </div>
  );
}
