import { useState } from 'react';
import { useQuery } from '@tanstack/react-query';
import { Link } from 'react-router-dom';
import {
  CUSTOMER_ARCHIVE_FILTER,
  formatCustomerLocation,
  type CustomerArchiveFilter,
  type CustomerResponse,
} from '@privatura/shared';
import { apiClient } from '../../lib/apiClient.js';
import { queryKeys } from '../../lib/queryKeys.js';
import { useDocumentTitle } from '../../lib/useDocumentTitle.js';
import { useDebounced } from '../../lib/useDebounced.js';
import { Badge } from '../../components/ui/Badge.js';
import { Button, buttonClassName } from '../../components/ui/Button.js';
import { EmptyState } from '../../components/ui/EmptyState.js';
import { ErrorNotice } from '../../components/ui/ErrorNotice.js';
import { LoadingNote } from '../../components/ui/LoadingNote.js';
import { Input } from '../../components/ui/Input.js';
import { PageHeader } from '../../components/ui/PageHeader.js';
import { SegmentedControl } from '../../components/ui/SegmentedControl.js';

const FILTERS: { value: CustomerArchiveFilter; label: string }[] = [
  { value: CUSTOMER_ARCHIVE_FILTER.ACTIVE, label: 'Aktiv' },
  { value: CUSTOMER_ARCHIVE_FILTER.ARCHIVED, label: 'Archiviert' },
  { value: CUSTOMER_ARCHIVE_FILTER.ALL, label: 'Alle' },
];

export function CustomerListPage(): JSX.Element {
  useDocumentTitle('Kunden');

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
      <PageHeader
        title="Kunden"
        description="Rechnungsempfänger verwalten. Beim Erstellen einer Rechnung werden diese Daten übernommen und lassen sich dort einmalig anpassen."
        actions={
          <Link to="/customers/new" className={buttonClassName()}>
            Neuer Kunde
          </Link>
        }
      />

      <div className="flex flex-wrap items-center gap-3">
        <Input
          type="search"
          value={search}
          onChange={(event) => setSearch(event.target.value)}
          placeholder="Suche nach Name, Ort, Kundennummer …"
          className="sm:max-w-xs"
          aria-label="Kunden durchsuchen"
        />
        <SegmentedControl
          label="Nach Archivstatus filtern"
          options={FILTERS}
          value={archived}
          onChange={setArchived}
        />
      </div>

      {customers.isLoading && <LoadingNote>Kunden werden geladen …</LoadingNote>}

      {customers.isError && (
        <ErrorNotice
          error={customers.error}
          title="Die Kundenliste konnte nicht geladen werden."
          onRetry={() => void customers.refetch()}
        />
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
              <Link to="/customers/new" className={buttonClassName()}>
                Neuer Kunde
              </Link>
            )
          }
        />
      )}

      {customers.isSuccess && hasResults && (
        <div className="overflow-x-auto rounded-lg border border-border bg-surface">
          <table className="w-full min-w-[36rem] text-sm">
            <thead className="border-b border-border bg-surface-sunken text-left text-xs uppercase tracking-wide text-ink-subtle">
              <tr>
                <th className="px-4 py-2 font-medium">Kunde</th>
                <th className="px-4 py-2 font-medium">Nr.</th>
                <th className="px-4 py-2 font-medium">Ort</th>
                <th className="px-4 py-2 font-medium">Rechnungen</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-border">
              {customers.data.map((customer) => (
                <tr key={customer.id} className="hover:bg-surface-hover">
                  <td className="px-4 py-3">
                    <Link
                      to={`/customers/${customer.id}`}
                      className="font-medium text-ink hover:underline"
                    >
                      {customer.companyName}
                    </Link>
                    {customer.contactName !== null && (
                      <span className="block text-xs text-ink-subtle">{customer.contactName}</span>
                    )}
                    {customer.archivedAt !== null && <Badge className="mt-1">archiviert</Badge>}
                  </td>
                  <td className="px-4 py-3 text-ink-subtle">{customer.customerNumber ?? '—'}</td>
                  <td className="px-4 py-3 text-ink-subtle">
                    {formatCustomerLocation(customer) || '—'}
                  </td>
                  <td className="px-4 py-3 text-ink-subtle">{customer.invoiceCount}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </div>
  );
}
