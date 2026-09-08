import { useState } from 'react';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { Link, useNavigate } from 'react-router-dom';
import {
  INVOICE_STATUS,
  INVOICE_STATUS_LABELS,
  formatCents,
  formatDateDe,
  invoiceDisplayName,
  isOverdue,
  toIsoDate,
  type InvoiceResponse,
  type InvoiceStatus,
} from '@agentur-tool/shared';
import { apiClient } from '../../lib/apiClient.js';
import { queryKeys } from '../../lib/queryKeys.js';
import { useDebounced } from '../../lib/useDebounced.js';
import { Button } from '../../components/ui/Button.js';
import { EmptyState } from '../../components/ui/EmptyState.js';
import { Input } from '../../components/ui/Input.js';

const FILTERS: { value: '' | InvoiceStatus; label: string }[] = [
  { value: '', label: 'Alle' },
  { value: INVOICE_STATUS.DRAFT, label: 'Entwürfe' },
  { value: INVOICE_STATUS.ISSUED, label: 'Ausgestellt' },
  { value: INVOICE_STATUS.PAID, label: 'Bezahlt' },
];

const STATUS_STYLES: Record<InvoiceStatus, string> = {
  DRAFT: 'bg-slate-100 text-slate-600',
  ISSUED: 'bg-sky-100 text-sky-800',
  PAID: 'bg-emerald-100 text-emerald-800',
  CANCELLED: 'bg-rose-100 text-rose-800',
};

export function InvoiceListPage(): JSX.Element {
  const [search, setSearch] = useState('');
  const [status, setStatus] = useState<'' | InvoiceStatus>('');
  const debouncedSearch = useDebounced(search);
  const navigate = useNavigate();
  const queryClient = useQueryClient();

  const invoices = useQuery({
    queryKey: queryKeys.invoices.list(debouncedSearch, status),
    queryFn: () => {
      const params = new URLSearchParams();
      if (debouncedSearch !== '') params.set('q', debouncedSearch);
      if (status !== '') params.set('status', status);
      const suffix = params.toString();
      return apiClient.get<InvoiceResponse[]>(`/invoices${suffix === '' ? '' : `?${suffix}`}`);
    },
    placeholderData: (previous) => previous,
  });

  const create = useMutation({
    mutationFn: () => apiClient.post<InvoiceResponse>('/invoices', {}),
    onSuccess: async (invoice) => {
      await queryClient.invalidateQueries({ queryKey: queryKeys.invoices.all });
      navigate(`/invoices/${invoice.id}`);
    },
  });

  const hasResults = (invoices.data?.length ?? 0) > 0;
  const isSearching = search !== '' || status !== '';

  return (
    <div className="space-y-6">
      <div className="flex items-start justify-between gap-4">
        <div>
          <h1 className="text-xl font-semibold text-slate-900">Rechnungen</h1>
          <p className="mt-1 text-sm text-slate-500">
            Entwürfe lassen sich frei bearbeiten. Das Finalisieren mit Nummernvergabe und PDF folgt
            in einem späteren Schritt.
          </p>
        </div>
        <Button onClick={() => create.mutate()} disabled={create.isPending}>
          {create.isPending ? 'wird angelegt …' : 'Neue Rechnung'}
        </Button>
      </div>

      <div className="flex flex-wrap items-center gap-3">
        <Input
          type="search"
          value={search}
          onChange={(event) => setSearch(event.target.value)}
          placeholder="Suche nach Nummer oder Empfänger …"
          className="sm:max-w-sm"
          aria-label="Rechnungen durchsuchen"
        />
        <div className="flex rounded-md border border-slate-300 bg-white p-0.5">
          {FILTERS.map((filter) => (
            <button
              key={filter.value}
              type="button"
              onClick={() => setStatus(filter.value)}
              className={[
                'rounded px-3 py-1 text-sm transition-colors',
                status === filter.value
                  ? 'bg-slate-900 text-white'
                  : 'text-slate-600 hover:bg-slate-50',
              ].join(' ')}
            >
              {filter.label}
            </button>
          ))}
        </div>
      </div>

      {invoices.isLoading && <p className="text-sm text-slate-500">Wird geladen …</p>}

      {invoices.isSuccess && !hasResults && (
        <EmptyState
          title={isSearching ? 'Keine Treffer' : 'Noch keine Rechnungen'}
          description={
            isSearching
              ? 'Zu dieser Suche wurde nichts gefunden.'
              : 'Lege die erste Rechnung an — Kunde und Steuerprofil werden aus den Stammdaten vorbelegt.'
          }
          action={
            isSearching ? (
              <Button
                variant="secondary"
                onClick={() => {
                  setSearch('');
                  setStatus('');
                }}
              >
                Filter zurücksetzen
              </Button>
            ) : (
              <Button onClick={() => create.mutate()}>Neue Rechnung</Button>
            )
          }
        />
      )}

      {invoices.isSuccess && hasResults && (
        <div className="overflow-hidden rounded-lg border border-slate-200 bg-white">
          <table className="w-full text-sm">
            <thead className="border-b border-slate-200 bg-slate-50 text-left text-xs uppercase tracking-wide text-slate-500">
              <tr>
                <th className="px-4 py-2 font-medium">Rechnung</th>
                <th className="px-4 py-2 font-medium">Empfänger</th>
                <th className="px-4 py-2 font-medium">Datum</th>
                <th className="px-4 py-2 text-right font-medium">Betrag</th>
                <th className="px-4 py-2 font-medium">Status</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-100">
              {invoices.data.map((invoice) => (
                <tr key={invoice.id} className="hover:bg-slate-50">
                  <td className="px-4 py-3">
                    <Link
                      to={`/invoices/${invoice.id}`}
                      className="font-medium text-slate-900 hover:underline"
                    >
                      {invoiceDisplayName(invoice)}
                    </Link>
                  </td>
                  <td className="px-4 py-3 text-slate-600">
                    {invoice.buyerData.companyName === '' ? (
                      <span className="text-slate-400">kein Empfänger</span>
                    ) : (
                      invoice.buyerData.companyName
                    )}
                  </td>
                  <td className="px-4 py-3 text-slate-500">
                    {formatDateDe(toIsoDate(invoice.invoiceDate))}
                  </td>
                  <td className="px-4 py-3 text-right tabular-nums text-slate-900">
                    {formatCents(invoice.totals.grossCents)}
                  </td>
                  <td className="px-4 py-3">
                    <span
                      className={`rounded px-1.5 py-0.5 text-xs ${STATUS_STYLES[invoice.status]}`}
                    >
                      {INVOICE_STATUS_LABELS[invoice.status]}
                    </span>
                    {isOverdue(invoice) && (
                      <span className="ml-1 rounded bg-amber-100 px-1.5 py-0.5 text-xs text-amber-800">
                        überfällig
                      </span>
                    )}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </div>
  );
}
