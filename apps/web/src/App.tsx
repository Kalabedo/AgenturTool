import { useEffect, useState } from 'react';
import { formatCents, formatDateDe, todayIso } from '@agentur-tool/shared';

interface HealthResponse {
  status: string;
  database: string;
  timestamp: string;
}

/**
 * Platzhalterseite für Schritt 0.
 *
 * Sie prüft die Kette, auf der alles Weitere aufbaut: Vite-Proxy erreicht
 * die API, die API erreicht die Datenbank, und das gemeinsame Paket
 * `@agentur-tool/shared` ist im Browser benutzbar. Ab Schritt 2 wird sie
 * durch das Dashboard ersetzt.
 */
export function App(): JSX.Element {
  const [health, setHealth] = useState<HealthResponse | null>(null);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    fetch('/api/health')
      .then((response) => {
        if (!response.ok) throw new Error(`HTTP ${response.status}`);
        return response.json() as Promise<HealthResponse>;
      })
      .then(setHealth)
      .catch((cause: unknown) => setError(cause instanceof Error ? cause.message : String(cause)));
  }, []);

  return (
    <main className="mx-auto max-w-xl p-8 font-sans">
      <h1 className="text-2xl font-semibold text-slate-900">AgenturTool</h1>
      <p className="mt-1 text-sm text-slate-500">Gerüst steht — Stand {formatDateDe(todayIso())}</p>

      <section className="mt-6 rounded-lg border border-slate-200 p-4">
        <h2 className="text-sm font-medium text-slate-700">Systemstatus</h2>
        {error !== null && (
          <p className="mt-2 text-sm text-red-600">API nicht erreichbar: {error}</p>
        )}
        {error === null && health === null && (
          <p className="mt-2 text-sm text-slate-500">wird geprüft …</p>
        )}
        {health !== null && (
          <dl className="mt-2 grid grid-cols-2 gap-x-4 gap-y-1 text-sm">
            <dt className="text-slate-500">API</dt>
            <dd className="text-slate-900">{health.status}</dd>
            <dt className="text-slate-500">Datenbank</dt>
            <dd className="text-slate-900">{health.database}</dd>
          </dl>
        )}
      </section>

      <section className="mt-4 rounded-lg border border-slate-200 p-4">
        <h2 className="text-sm font-medium text-slate-700">Gemeinsames Paket</h2>
        <p className="mt-2 text-sm text-slate-600">
          Beträge werden als Integer in Cent geführt: 123456 ={' '}
          <span className="font-medium text-slate-900">{formatCents(123456)}</span>
        </p>
      </section>
    </main>
  );
}
