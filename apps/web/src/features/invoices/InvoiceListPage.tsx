import { useEffect, useState } from 'react';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { Link, useNavigate, useSearchParams } from 'react-router-dom';
import {
  DOCUMENT_TYPE,
  INVOICE_SORT_FIELD,
  INVOICE_SORT_FIELD_VALUES,
  INVOICE_STATUS,
  INVOICE_STATUS_LABELS,
  describeRange,
  formatCents,
  formatDateDe,
  invoiceDisplayName,
  isOverdue,
  toIsoDate,
  type InvoiceListResponse,
  type InvoiceResponse,
  type InvoiceSortField,
  type InvoiceStatus,
  type SortOrder,
} from '@agentur-tool/shared';
import { apiClient } from '../../lib/apiClient.js';
import { queryKeys } from '../../lib/queryKeys.js';
import { useDocumentTitle } from '../../lib/useDocumentTitle.js';
import { useDebounced } from '../../lib/useDebounced.js';
import { Badge } from '../../components/ui/Badge.js';
import { Button } from '../../components/ui/Button.js';
import { EmptyState } from '../../components/ui/EmptyState.js';
import { ErrorNotice } from '../../components/ui/ErrorNotice.js';
import { LoadingNote } from '../../components/ui/LoadingNote.js';
import { Input } from '../../components/ui/Input.js';
import { PageHeader } from '../../components/ui/PageHeader.js';
import { SegmentedControl } from '../../components/ui/SegmentedControl.js';
import { Select } from '../../components/ui/Select.js';
import { RebillDialog } from './RebillDialog.js';

/** Statusfilter und der Sonderfall „überfällig", der kein Status ist. */
const FILTERS: { value: string; label: string }[] = [
  { value: '', label: 'Alle' },
  { value: INVOICE_STATUS.DRAFT, label: 'Entwürfe' },
  { value: INVOICE_STATUS.ISSUED, label: 'Ausgestellt' },
  { value: INVOICE_STATUS.PAID, label: 'Bezahlt' },
  { value: INVOICE_STATUS.CANCELLED, label: 'Storniert' },
  { value: 'overdue', label: 'Überfällig' },
];

const STATUS_TONES: Record<InvoiceStatus, 'neutral' | 'info' | 'success' | 'danger'> = {
  DRAFT: 'neutral',
  ISSUED: 'info',
  PAID: 'success',
  CANCELLED: 'danger',
};

const PAGE_SIZE = 25;

/** Die letzten Jahre zur Auswahl — weiter zurück gibt es keine Rechnungen. */
function selectableYears(): number[] {
  const current = new Date().getFullYear();
  return [current, current - 1, current - 2, current - 3, current - 4];
}

export function InvoiceListPage(): JSX.Element {
  useDocumentTitle('Rechnungen');

  /*
   * Filter, Sortierung und Seite stehen in der Adresszeile, nicht im
   * Komponentenzustand. Damit ist eine Auswahl teilbar und überlebt das
   * Neuladen — und das Dashboard kann direkt auf „überfällig" verlinken,
   * statt die Auswahl nur zu beschreiben.
   */
  const [searchParams, setSearchParams] = useSearchParams();

  const filter = searchParams.get('filter') ?? '';
  const year = searchParams.get('year') ?? '';
  const sortParam = searchParams.get('sort');
  const sort: InvoiceSortField = INVOICE_SORT_FIELD_VALUES.includes(sortParam as InvoiceSortField)
    ? (sortParam as InvoiceSortField)
    : INVOICE_SORT_FIELD.INVOICE_DATE;
  const order: SortOrder = searchParams.get('order') === 'asc' ? 'asc' : 'desc';
  const page = Math.max(1, Number(searchParams.get('page') ?? 1) || 1);

  // Der Suchtext bleibt lokal und wandert erst entprellt in die Adresse —
  // sonst entstünde bei jedem Tastendruck ein Eintrag im Verlauf.
  const [search, setSearch] = useState(searchParams.get('q') ?? '');
  const debouncedSearch = useDebounced(search);

  /**
   * Die Rechnung, für die der Vorlagen-Dialog offen ist.
   *
   * Die Rechnung selbst und nicht nur ihre id: Der Dialog nennt sie im
   * Kopf, und beim Schließen soll der Name nicht vorher verschwinden.
   */
  const [rebillFor, setRebillFor] = useState<InvoiceResponse | null>(null);

  const navigate = useNavigate();
  const queryClient = useQueryClient();

  // Erst wenn das Tippen zur Ruhe kommt, landet die Suche in der Adresse.
  // Der Vergleich verhindert die Schleife: Ohne ihn schriebe jeder Lauf
  // erneut denselben Wert und löste den nächsten aus.
  useEffect(() => {
    if ((searchParams.get('q') ?? '') === debouncedSearch) return;
    update({ q: debouncedSearch });
  }, [debouncedSearch, searchParams]);

  /**
   * Ändert die Auswahl in der Adresszeile.
   *
   * Jede Änderung außer dem Blättern setzt auf Seite 1 zurück: Seite 3 eines
   * anderen Filters ist fast immer leer, und eine leere Liste nach einem
   * Klick sieht aus wie ein Fehler.
   */
  const update = (changes: Record<string, string>): void => {
    const next = new URLSearchParams(searchParams);
    for (const [key, value] of Object.entries(changes)) {
      if (value === '') next.delete(key);
      else next.set(key, value);
    }
    if (!('page' in changes)) next.delete('page');
    setSearchParams(next, { replace: true });
  };

  const params = new URLSearchParams({
    page: String(page),
    pageSize: String(PAGE_SIZE),
    sort,
    order,
  });
  if (debouncedSearch !== '') params.set('q', debouncedSearch);
  if (year !== '') params.set('year', year);
  if (filter === 'overdue') params.set('overdue', 'true');
  else if (filter !== '') params.set('status', filter);

  const queryString = params.toString();

  const invoices = useQuery({
    queryKey: queryKeys.invoices.list(queryString),
    queryFn: () => apiClient.get<InvoiceListResponse>(`/invoices?${queryString}`),
    // Beim Blättern und Filtern bleibt die vorige Seite stehen, statt kurz
    // zu verschwinden — sonst springt die Tabelle bei jedem Tastendruck.
    placeholderData: (previous) => previous,
  });

  const create = useMutation({
    mutationFn: () => apiClient.post<InvoiceResponse>('/invoices', {}),
    onSuccess: async (invoice) => {
      await queryClient.invalidateQueries({ queryKey: queryKeys.invoices.all });
      navigate(`/invoices/${invoice.id}`);
    },
  });

  const result = invoices.data;
  const hasResults = (result?.items.length ?? 0) > 0;
  const isFiltering = search !== '' || filter !== '' || year !== '';

  /** Ein Klick auf dieselbe Spalte dreht die Richtung um. */
  const sortBy = (field: InvoiceSortField): void => {
    if (field === sort) {
      update({ order: order === 'asc' ? 'desc' : 'asc' });
      return;
    }
    update({ sort: field, order: 'desc' });
  };

  const resetFilters = (): void => {
    setSearch('');
    setSearchParams(new URLSearchParams(), { replace: true });
  };

  const sortableHeader = (field: InvoiceSortField, label: string, align = 'left'): JSX.Element => (
    <th
      className={`px-4 py-2 font-medium ${align === 'right' ? 'text-right' : ''}`}
      // Ohne aria-sort ist eine sortierte Tabelle für einen Screenreader eine
      // unsortierte: Der Pfeil daneben ist nur ein Zeichen ohne Bedeutung.
      aria-sort={sort === field ? (order === 'asc' ? 'ascending' : 'descending') : 'none'}
    >
      <button
        type="button"
        onClick={() => sortBy(field)}
        className="inline-flex items-center gap-1 rounded uppercase tracking-wide hover:text-slate-900 focus:outline-none focus-visible:ring-2 focus-visible:ring-slate-300"
        aria-label={`Nach ${label} sortieren`}
      >
        {label}
        <span aria-hidden className={sort === field ? 'text-slate-900' : 'text-transparent'}>
          {order === 'asc' ? '▲' : '▼'}
        </span>
      </button>
    </th>
  );

  return (
    <div className="space-y-6">
      <PageHeader
        title="Rechnungen"
        description="Entwürfe lassen sich frei bearbeiten; ausgestellte Rechnungen sind unveränderlich."
        actions={
          <Button
            onClick={() => create.mutate()}
            pending={create.isPending}
            pendingLabel="wird angelegt …"
          >
            Neue Rechnung
          </Button>
        }
      />

      <div className="flex flex-wrap items-center gap-3">
        <Input
          type="search"
          value={search}
          onChange={(event) => setSearch(event.target.value)}
          placeholder="Suche nach Nummer oder Empfänger …"
          className="sm:max-w-xs"
          aria-label="Rechnungen durchsuchen"
        />

        <SegmentedControl
          label="Nach Status filtern"
          options={FILTERS}
          value={filter}
          onChange={(value) => update({ filter: value })}
        />

        {/* Feste Breite statt `w-auto`: Ein `Select` bringt `w-full` mit, und
            in der Filterzeile zog das Jahresfeld die ganze Breite an sich
            und rutschte in eine eigene Zeile. */}
        <div className="w-40">
          <Select
            value={year}
            onChange={(event) => update({ year: event.target.value })}
            aria-label="Jahr"
          >
            <option value="">Alle Jahre</option>
            {selectableYears().map((entry) => (
              <option key={entry} value={entry}>
                {entry}
              </option>
            ))}
          </Select>
        </div>
      </div>

      {invoices.isLoading && <LoadingNote>Rechnungen werden geladen …</LoadingNote>}

      {invoices.isError && (
        <ErrorNotice
          error={invoices.error}
          title="Die Rechnungen konnten nicht geladen werden."
          onRetry={() => void invoices.refetch()}
        />
      )}

      {create.isError && <ErrorNotice error={create.error} title="Anlegen fehlgeschlagen" />}

      {invoices.isSuccess && !hasResults && (
        <EmptyState
          title={isFiltering ? 'Keine Treffer' : 'Noch keine Rechnungen'}
          description={
            isFiltering
              ? 'Zu dieser Auswahl wurde nichts gefunden.'
              : 'Lege die erste Rechnung an — Kunde und Steuerprofil werden aus den Stammdaten vorbelegt.'
          }
          action={
            isFiltering ? (
              <Button variant="secondary" onClick={resetFilters}>
                Filter zurücksetzen
              </Button>
            ) : (
              <Button
                onClick={() => create.mutate()}
                pending={create.isPending}
                pendingLabel="wird angelegt …"
              >
                Neue Rechnung
              </Button>
            )
          }
        />
      )}

      {result !== undefined && hasResults && (
        <div className="space-y-3">
          {/* Sechs Spalten passen auf ein Telefon nicht nebeneinander. Statt
              Spalten zu verstecken — und damit ausgerechnet Betrag oder Status —
              darf die Tabelle in ihrem eigenen Kasten scrollen. */}
          <div className="overflow-x-auto rounded-lg border border-slate-200 bg-white">
            <table className="w-full min-w-[52rem] text-sm">
              <thead className="border-b border-slate-200 bg-slate-50 text-left text-xs uppercase tracking-wide text-slate-500">
                <tr>
                  {sortableHeader(INVOICE_SORT_FIELD.NUMBER, 'Rechnung')}
                  <th className="px-4 py-2 font-medium">Empfänger</th>
                  {sortableHeader(INVOICE_SORT_FIELD.INVOICE_DATE, 'Datum')}
                  {sortableHeader(INVOICE_SORT_FIELD.DUE_DATE, 'Fällig')}
                  <th className="px-4 py-2 text-right font-medium">Betrag</th>
                  <th className="px-4 py-2 font-medium">Status</th>
                  {/* Die Spalte trägt keine Überschrift: „Aktion" benennt
                      nichts, was die Schaltfläche nicht selbst sagt. */}
                  <th className="px-4 py-2">
                    <span className="sr-only">Aktionen</span>
                  </th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-100">
                {result.items.map((invoice) => (
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
                    <td className="px-4 py-3 text-slate-500">
                      {formatDateDe(toIsoDate(invoice.dueDate))}
                    </td>
                    <td className="px-4 py-3 text-right tabular-nums text-slate-900">
                      {formatCents(invoice.totals.grossCents)}
                    </td>
                    <td className="px-4 py-3">
                      <div className="flex flex-wrap gap-1">
                        <Badge tone={STATUS_TONES[invoice.status]}>
                          {INVOICE_STATUS_LABELS[invoice.status]}
                        </Badge>
                        {invoice.documentType === DOCUMENT_TYPE.CANCELLATION && (
                          <Badge>Storno</Badge>
                        )}
                        {isOverdue(invoice) && <Badge tone="warning">überfällig</Badge>}
                      </div>
                    </td>
                    <td className="px-4 py-3 text-right">
                      {/* Auf einem Storno gibt es diesen Weg nicht — Grundlage
                          einer Neuausstellung ist die Rechnung selbst. */}
                      {invoice.documentType !== DOCUMENT_TYPE.CANCELLATION && (
                        <Button
                          variant="ghost"
                          size="sm"
                          onClick={() => setRebillFor(invoice)}
                          aria-label={`Neue Rechnung auf Basis von ${invoiceDisplayName(invoice)}`}
                        >
                          Als Vorlage
                        </Button>
                      )}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>

          <div className="flex flex-wrap items-center justify-between gap-3 text-sm text-slate-500">
            <span>{describeRange(result)}</span>
            {result.pageCount > 1 && (
              <div className="flex items-center gap-2">
                <Button
                  variant="secondary"
                  size="sm"
                  disabled={page <= 1}
                  onClick={() => update({ page: String(page - 1) })}
                >
                  Zurück
                </Button>
                <span>
                  Seite {result.page} von {result.pageCount}
                </span>
                <Button
                  variant="secondary"
                  size="sm"
                  disabled={page >= result.pageCount}
                  onClick={() => update({ page: String(page + 1) })}
                >
                  Weiter
                </Button>
              </div>
            )}
          </div>
        </div>
      )}

      {rebillFor !== null && (
        <RebillDialog
          invoiceId={rebillFor.id}
          invoiceName={invoiceDisplayName(rebillFor)}
          open
          onClose={() => setRebillFor(null)}
        />
      )}
    </div>
  );
}
