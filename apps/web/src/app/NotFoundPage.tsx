import { Link } from 'react-router-dom';

export function NotFoundPage(): JSX.Element {
  return (
    <div className="rounded-lg border border-border bg-surface p-8 text-center">
      <h1 className="text-lg font-semibold text-ink">Seite nicht gefunden</h1>
      <p className="mt-1 text-sm text-ink-subtle">
        Diese Adresse führt ins Leere. Vielleicht wurde der Datensatz gelöscht, vielleicht ist ein
        Tippfehler in der Adresszeile.
      </p>
      <Link to="/" className="mt-4 inline-block text-sm font-medium text-ink underline">
        Zurück zum Dashboard
      </Link>
    </div>
  );
}
