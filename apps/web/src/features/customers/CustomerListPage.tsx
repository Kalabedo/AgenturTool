import { useState } from 'react';
import { useQuery } from '@tanstack/react-query';
import { Link } from 'react-router-dom';
import {
  CUSTOMER_ARCHIVE_FILTER,
  formatCustomerLocation,
  type CustomerArchiveFilter,
  type CustomerResponse,
} from '@agentur-tool/shared';
import { apiClient } from '../../lib/apiClient.js';
import { queryKeys } from '../../lib/queryKeys.js';
import { useDebounced } from '../../lib/useDebounced.js';
import { Button } from '../../components/ui/Button.js';
import { EmptyState } from '../../components/ui/EmptyState.js';
import { Input } from '../../components/ui/Input.js';

const FILTERS: { value: CustomerArchiveFilter; label: string }[] = [
  { value: CUSTOMER_ARCHIVE_FILTER.ACTIVE, label: 'Aktiv' },
  { value: CUSTOMER_ARCHIVE_FILTER.ARCHIVED, label: 'Archiviert' },
  { value: CUSTOMER_ARCHIVE_FILTER.ALL, label: 'Alle' },
];

export function CustomerListPage(): JSX.Element {
  const [search, setSearch] = useState('');
  const [archived, setArchived] = useState<CustomerArchiveFilter>(CUSTOMER_ARCHIVE_FILTER.ACTIVE);
  const debouncedSearch = useDebounced(search);

  const customers = useQuery({
    queryKey: queryKeys.customers.list(debouncedSearch, archived),
    queryFn: () => {
      const params = new URLSearchParams({ archived });
      if (debouncedSearch !== '') params.set('q', debouncedSearch);
      return apiClient.get<CustomerResponse[]>(`/customers?${params.toString()}`);
    },
    // Beim Tippen die vorherige Liste stehen lassen, statt sie durch einen
    // Ladezustand zu ersetzen — das Springen wäre bei jedem Zeichen sichtbar.
    placeholderData: (previous) => previous,
  });

  const isSearching = search !== '';
  const hasResults = (customers.data?.length ?? 0) > 0;

  return (
    <div className="space-y-6">
      <div className="flex items-start justify-between gap-4">
        <div>
          <h1 className="text-xl font-semibold text-slate-900">Kunden</h1>
          <p className="mt-1 text-sm text-slate-500">
            Rechnungsempfänger verwalten. Beim Erstellen einer Rechnung werden diese Daten
            übernommen und lassen sich dort einmalig anpassen.
          </p>
        </div>
        <Link to="/customers/new">
          <Button>Neuer Kunde</Button>
        </Link>
      </div>

      <div className="flex flex-wrap items-center gap-3">
        <Input
          type="search"
          value={search}
          onChange={(event) => setSearch(event.target.value)}
          placeholder="Suche nach Name, Ort, Kundennummer …"
          className="sm:max-w-sm"
          aria-label="Kunden durchsuchen"
        />
        <div className="flex rounded-md border border-slate-300 bg-white p-0.5">
          {FILTERS.map((filter) => (
            <button
              key={filter.value}
              type="button"
              onClick={() => setArchived(filter.value)}
              className={[
                'rounded px-3 py-1 text-sm transition-colors',
                archived === filter.value
                  ? 'bg-slate-900 text-white'
                  : 'text-slate-600 hover:bg-slate-50',
              ].join(' ')}
            >
              {filter.label}
            </button>
          ))}
        </div>
      </div>

      {customers.isLoading && <p className="text-sm text-slate-500">Kunden werden geladen …</p>}

      {customers.isError && (
        <div className="rounded-lg border border-rose-200 bg-rose-50 p-5">
          <p className="text-sm text-rose-800">Die Kundenliste konnte nicht geladen werden.</p>
        </div>
      )}

      {customers.isSuccess && !hasResults && (
        <EmptyState
          title={isSearching ? 'Keine Treffer' : 'Noch keine Kunden'}
          description={
            isSearching
              ? `Zu „${search}" wurde nichts gefunden.`
              : 'Lege den ersten Kunden an, um ihn später auf einer Rechnung auszuwählen.'
          }
          action={
            isSearching ? (
              <Button variant="secondary" onClick={() => setSearch('')}>
                Suche zurücksetzen
              </Button>
            ) : (
              <Link to="/customers/new">
                <Button>Neuer Kunde</Button>
              </Link>
            )
          }
        />
      )}

      {customers.isSuccess && hasResults && (
        <div className="overflow-hidden rounded-lg border border-slate-200 bg-white">
          <table className="w-full text-sm">
            <thead className="border-b border-slate-200 bg-slate-50 text-left text-xs uppercase tracking-wide text-slate-500">
              <tr>
                <th className="px-4 py-2 font-medium">Kunde</th>
                <th className="px-4 py-2 font-medium">Nr.</th>
                <th className="px-4 py-2 font-medium">Ort</th>
                <th className="px-4 py-2 font-medium">Rechnungen</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-100">
              {customers.data.map((customer) => (
                <tr key={customer.id} className="hover:bg-slate-50">
                  <td className="px-4 py-3">
                    <Link
                      to={`/customers/${customer.id}`}
                      className="font-medium text-slate-900 hover:underline"
                    >
                      {customer.companyName}
                    </Link>
                    {customer.contactName !== null && (
                      <span className="block text-xs text-slate-500">{customer.contactName}</span>
                    )}
                    {customer.archivedAt !== null && (
                      <span className="mt-1 inline-block rounded bg-slate-100 px-1.5 py-0.5 text-xs text-slate-600">
                        archiviert
                      </span>
                    )}
                  </td>
                  <td className="px-4 py-3 text-slate-500">{customer.customerNumber ?? '—'}</td>
                  <td className="px-4 py-3 text-slate-500">
                    {formatCustomerLocation(customer) || '—'}
                  </td>
                  <td className="px-4 py-3 text-slate-500">{customer.invoiceCount}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </div>
  );
}
