import { useQuery } from '@tanstack/react-query';
import { Link } from 'react-router-dom';
import { missingCompanyFieldsForInvoicing, COMPANY_FIELD_LABELS } from '@agentur-tool/shared';
import type { CompanyResponse } from '@agentur-tool/shared';
import { apiClient } from '../../lib/apiClient.js';
import { queryKeys } from '../../lib/queryKeys.js';
import { Card } from '../../components/ui/Card.js';

/**
 * Einstieg in die Anwendung.
 *
 * In diesem Schritt vor allem ein Wegweiser: Solange die Firmendaten
 * unvollständig sind, lässt sich später keine Rechnung finalisieren — das
 * soll man hier erfahren und nicht erst beim ersten Finalisierungsversuch.
 */
export function DashboardPage(): JSX.Element {
  const company = useQuery({
    queryKey: queryKeys.company,
    queryFn: () => apiClient.get<CompanyResponse>('/company'),
  });

  const missing = company.data === undefined ? [] : missingCompanyFieldsForInvoicing(company.data);

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-xl font-semibold text-slate-900">Dashboard</h1>
        <p className="mt-1 text-sm text-slate-500">Übersicht und Einstieg</p>
      </div>

      {company.isSuccess && missing.length > 0 && (
        <div className="rounded-lg border border-amber-200 bg-amber-50 p-5">
          <h2 className="text-sm font-semibold text-amber-900">
            Unternehmensdaten noch unvollständig
          </h2>
          <p className="mt-1 text-sm text-amber-800">
            Für eine Rechnung fehlen noch:{' '}
            {missing.map((field) => COMPANY_FIELD_LABELS[field] ?? field).join(', ')}.
          </p>
          <Link
            to="/settings/company"
            className="mt-3 inline-block text-sm font-medium text-amber-900 underline"
          >
            Jetzt ergänzen
          </Link>
        </div>
      )}

      {company.isSuccess && missing.length === 0 && (
        <div className="rounded-lg border border-emerald-200 bg-emerald-50 p-5">
          <h2 className="text-sm font-semibold text-emerald-900">Unternehmensdaten vollständig</h2>
          <p className="mt-1 text-sm text-emerald-800">
            Alle Pflichtangaben für eine Rechnung sind hinterlegt.
          </p>
        </div>
      )}

      <Card title="Nächste Schritte" description="Was diese Anwendung bisher kann">
        <ul className="space-y-2 text-sm text-slate-600">
          <li className="flex gap-2">
            <span className="text-emerald-600">✓</span>
            <span>
              Unternehmensdaten pflegen —{' '}
              <Link to="/settings/company" className="font-medium text-slate-900 underline">
                zu den Einstellungen
              </Link>
            </span>
          </li>
          <li className="flex gap-2 text-slate-400">
            <span>○</span>
            <span>Kundenverwaltung</span>
          </li>
          <li className="flex gap-2 text-slate-400">
            <span>○</span>
            <span>Steuerprofile</span>
          </li>
          <li className="flex gap-2 text-slate-400">
            <span>○</span>
            <span>Rechnungen erstellen und als PDF exportieren</span>
          </li>
        </ul>
      </Card>
    </div>
  );
}
