import { useQuery } from '@tanstack/react-query';
import { Link } from 'react-router-dom';
import {
  COMPANY_FIELD_LABELS,
  INVOICE_STATUS,
  INVOICE_STATUS_LABELS,
  formatCents,
  formatDateDe,
  invoiceDisplayName,
  missingCompanyFieldsForInvoicing,
  toIsoDate,
  type CompanyResponse,
  type InvoiceListResponse,
} from '@agentur-tool/shared';
import { apiClient } from '../../lib/apiClient.js';
import { queryKeys } from '../../lib/queryKeys.js';
import { useDocumentTitle } from '../../lib/useDocumentTitle.js';
import { Badge } from '../../components/ui/Badge.js';
import { Card } from '../../components/ui/Card.js';
import { ErrorNotice } from '../../components/ui/ErrorNotice.js';
import { LoadingNote } from '../../components/ui/LoadingNote.js';
import { PageHeader } from '../../components/ui/PageHeader.js';

/**
 * Einstieg in die Anwendung.
 *
 * Bewusst schmal: drei Zahlen, die man morgens wissen will, und die letzten
 * Rechnungen. Umsatzübersichten und offene Posten mit Altersstruktur sind
 * ausdrücklich Sache einer späteren Version (Abschnitt 21) — ein Dashboard,
 * das alles zeigt, beantwortet am Ende keine Frage.
 *
 * Die Zahlen kommen aus derselben Übersichtsabfrage wie die Liste, nur mit
 * `pageSize` klein und `total` als eigentlicher Antwort. Das erspart einen
 * eigenen Statistik-Endpunkt, der dieselben Filter noch einmal ausdrücken
 * müsste.
 */

function useInvoiceQuery(params: string) {
  return useQuery({
    queryKey: queryKeys.invoices.list(params),
    queryFn: () => apiClient.get<InvoiceListResponse>(`/invoices?${params}`),
  });
}

function StatTile({
  label,
  value,
  to,
  tone,
}: {
  label: string;
  value: number | undefined;
  to: string;
  tone: 'neutral' | 'warning';
}): JSX.Element {
  return (
    <Link
      to={to}
      className={[
        'rounded-lg border p-5 transition-colors',
        'focus:outline-none focus-visible:ring-2 focus-visible:ring-slate-300',
        tone === 'warning'
          ? 'border-amber-200 bg-amber-50 hover:bg-amber-100'
          : 'border-slate-200 bg-white hover:bg-slate-50',
      ].join(' ')}
    >
      <p className="text-sm text-slate-600">{label}</p>
      <p className="mt-1 text-2xl font-semibold tabular-nums text-slate-900">{value ?? '—'}</p>
    </Link>
  );
}

export function DashboardPage(): JSX.Element {
  useDocumentTitle('Dashboard');

  const company = useQuery({
    queryKey: queryKeys.company,
    queryFn: () => apiClient.get<CompanyResponse>('/company'),
  });

  const drafts = useInvoiceQuery('status=DRAFT&pageSize=1');
  const open = useInvoiceQuery('status=ISSUED&pageSize=1');
  const overdue = useInvoiceQuery('overdue=true&pageSize=5&sort=dueDate&order=asc');
  const latest = useInvoiceQuery('pageSize=5&sort=invoiceDate&order=desc');

  const missing = company.data === undefined ? [] : missingCompanyFieldsForInvoicing(company.data);

  /**
   * Vier Abfragen, eine Meldung.
   *
   * Sie treffen denselben Server; fällt er aus, fallen alle aus. Vier
   * gleichlautende rote Kästen untereinander wären nur lauter, nicht
   * hilfreicher.
   */
  const failed = [drafts, open, overdue, latest, company].find((query) => query.isError);

  return (
    <div className="space-y-6">
      <PageHeader title="Dashboard" description="Was gerade offen ist" />

      {company.isSuccess && missing.length > 0 && (
        <div className="rounded-lg border border-amber-200 bg-amber-50 p-5">
          <h2 className="text-sm font-semibold text-amber-900">
            Unternehmensdaten noch unvollständig
          </h2>
          <p className="mt-1 text-sm text-amber-800">
            Zum Ausstellen einer Rechnung fehlen noch:{' '}
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

      {failed !== undefined && (
        <ErrorNotice
          error={failed.error}
          title="Die Übersicht konnte nicht geladen werden."
          onRetry={() => {
            void drafts.refetch();
            void open.refetch();
            void overdue.refetch();
            void latest.refetch();
            void company.refetch();
          }}
        />
      )}

      <div className="grid gap-4 sm:grid-cols-3">
        <StatTile
          label="Entwürfe"
          value={drafts.data?.total}
          to="/invoices?filter=DRAFT"
          tone="neutral"
        />
        <StatTile
          label="Offene Rechnungen"
          value={open.data?.total}
          to="/invoices?filter=ISSUED"
          tone="neutral"
        />
        <StatTile
          label="Überfällig"
          value={overdue.data?.total}
          to="/invoices?filter=overdue&sort=dueDate&order=asc"
          tone={(overdue.data?.total ?? 0) > 0 ? 'warning' : 'neutral'}
        />
      </div>

      {(overdue.data?.items.length ?? 0) > 0 && (
        <Card title="Überfällig" description="Ausgestellt, Fälligkeit vorbei, noch nicht bezahlt">
          <ul className="divide-y divide-slate-100 text-sm">
            {overdue.data?.items.map((invoice) => (
              <li
                key={invoice.id}
                className="flex flex-wrap items-center justify-between gap-x-4 gap-y-1 py-2"
              >
                <Link to={`/invoices/${invoice.id}`} className="font-medium hover:underline">
                  {invoiceDisplayName(invoice)}
                </Link>
                <span className="truncate text-slate-500">{invoice.buyerData.companyName}</span>
                <span className="whitespace-nowrap text-amber-800">
                  fällig war {formatDateDe(toIsoDate(invoice.dueDate))}
                </span>
                <span className="whitespace-nowrap tabular-nums text-slate-900">
                  {formatCents(invoice.totals.grossCents)}
                </span>
              </li>
            ))}
          </ul>
        </Card>
      )}

      <Card title="Zuletzt" description="Die fünf neuesten Rechnungen">
        {latest.isLoading ? (
          <LoadingNote />
        ) : latest.data?.items.length === 0 ? (
          <p className="text-sm text-slate-500">
            Noch keine Rechnung angelegt —{' '}
            <Link to="/invoices" className="underline">
              hier geht es los
            </Link>
            .
          </p>
        ) : (
          <ul className="divide-y divide-slate-100 text-sm">
            {latest.data?.items.map((invoice) => (
              <li
                key={invoice.id}
                className="flex flex-wrap items-center justify-between gap-x-4 gap-y-1 py-2"
              >
                <Link to={`/invoices/${invoice.id}`} className="font-medium hover:underline">
                  {invoiceDisplayName(invoice)}
                </Link>
                <span className="truncate text-slate-500">
                  {invoice.buyerData.companyName === '' ? '—' : invoice.buyerData.companyName}
                </span>
                <span className="whitespace-nowrap text-slate-500">
                  {formatDateDe(toIsoDate(invoice.invoiceDate))}
                </span>
                <span className="whitespace-nowrap tabular-nums text-slate-900">
                  {formatCents(invoice.totals.grossCents)}
                </span>
                <Badge tone={invoice.status === INVOICE_STATUS.PAID ? 'success' : 'neutral'}>
                  {INVOICE_STATUS_LABELS[invoice.status]}
                </Badge>
              </li>
            ))}
          </ul>
        )}
      </Card>
    </div>
  );
}
