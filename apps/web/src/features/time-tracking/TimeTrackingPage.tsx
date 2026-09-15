import { useEffect, useMemo, useState } from 'react';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { Link } from 'react-router-dom';
import {
  CUSTOMER_ARCHIVE_FILTER,
  TIME_ENTRY_BILLING_FILTER,
  formatDateDe,
  formatDecimalHours,
  formatDuration,
  summarizeTimeEntries,
  todayIso,
  type CustomerResponse,
  type IsoDate,
  type TimeEntryBillingResult,
  type TimeEntryOpenSummary,
  type TimeEntryPayload,
  type TimeEntryResponse,
} from '@privatura/shared';
import { apiClient, type DownloadedFile } from '../../lib/apiClient.js';
import { fieldErrorsOf, formErrorOf } from '../../lib/errorMessage.js';
import { queryKeys } from '../../lib/queryKeys.js';
import { useDocumentTitle } from '../../lib/useDocumentTitle.js';
import { Button, buttonClassName } from '../../components/ui/Button.js';
import { ConfirmDialog } from '../../components/ui/ConfirmDialog.js';
import { EmptyState } from '../../components/ui/EmptyState.js';
import { PageHeader } from '../../components/ui/PageHeader.js';
import { useToast } from '../../components/ui/Toast.js';
import { tabClassName } from '../../components/ui/tabs.js';
import { ErrorNotice } from '../../components/ui/ErrorNotice.js';
import { LoadingNote } from '../../components/ui/LoadingNote.js';
import { saveFile } from '../invoices/saveFile.js';
import { BilledArchive } from './BilledArchive.js';
import { CustomerTabs } from './CustomerTabs.js';
import { TimeEntryTable } from './TimeEntryTable.js';
import {
  TimeEntryForm,
  emptyTimeEntryValues,
  toTimeEntryValues,
  type TimeEntryFormValues,
} from './TimeEntryForm.js';

type Tab = 'open' | 'billed';

/** Liest die Kopfzeile, die das Abrechnen neben dem PDF mitschickt. */
function billingResultFrom(file: DownloadedFile): TimeEntryBillingResult | null {
  const header = file.headers.get('X-Billing-Result');
  if (header === null) return null;
  try {
    return JSON.parse(
      new TextDecoder().decode(Uint8Array.from(atob(header), (char) => char.charCodeAt(0))),
    ) as TimeEntryBillingResult;
  } catch {
    // Ohne die Kopfzeile fehlt nur das Rückgängigmachen — das PDF ist da
    // und die Zeiten sind abgerechnet. Kein Grund, den Vorgang als
    // gescheitert zu melden.
    return null;
  }
}

/**
 * Die Zeiterfassung.
 *
 * Die Seite ist ein Posteingang, kein Kalenderausschnitt: Oben steht das
 * Formular — die Handlung, die am häufigsten vorkommt —, darunter die
 * offenen Zeiten des gewählten Kunden. Erfassen füllt die Liste,
 * „Abrechnen" leert sie und erzeugt dabei den Zeitnachweis.
 *
 * Deshalb gibt es hier bewusst **keinen** Zeitraumfilter. Ein Eintrag vom
 * August, der im September noch offen ist, muss sichtbar bleiben — ein
 * Monatsfenster würde genau die Arbeit verstecken, für die noch kein Geld
 * geflossen ist. Wer zurückblicken will, wechselt in den Reiter
 * „Abgerechnet"; dort steht der Zeitraumfilter und der Nachweis lässt sich
 * für beliebige Zeiträume neu erzeugen.
 */
export function TimeTrackingPage(): JSX.Element {
  useDocumentTitle('Zeiterfassung');

  const queryClient = useQueryClient();
  const toast = useToast();
  const [tab, setTab] = useState<Tab>('open');
  const [activeCustomerId, setActiveCustomerId] = useState<number | null>(null);
  const [editingId, setEditingId] = useState<number | null>(null);
  const [savedCount, setSavedCount] = useState(0);
  const [values, setValues] = useState<TimeEntryFormValues>(() => emptyTimeEntryValues(todayIso()));
  const [billingError, setBillingError] = useState<unknown>(null);
  /** Der Eintrag, für den gerade die Löschrückfrage offen steht. */
  const [entryToDelete, setEntryToDelete] = useState<TimeEntryResponse | null>(null);

  const customers = useQuery({
    queryKey: queryKeys.customers.list('', CUSTOMER_ARCHIVE_FILTER.ALL),
    queryFn: () =>
      apiClient.get<CustomerResponse[]>(`/customers?archived=${CUSTOMER_ARCHIVE_FILTER.ALL}`),
  });

  /** Die Reiterleiste: welche Kunden haben offene Zeiten, und wie viel. */
  const openSummary = useQuery({
    queryKey: queryKeys.timeEntries.openSummary,
    queryFn: () => apiClient.get<TimeEntryOpenSummary[]>('/time-entries/open-summary'),
  });

  const openCustomers = useMemo(() => openSummary.data ?? [], [openSummary.data]);

  /**
   * Hält die Kundenauswahl gültig.
   *
   * Nach dem Abrechnen verschwindet ein Reiter; die Auswahl springt dann auf
   * den nächsten, statt auf eine leere Tabelle zu zeigen. Ebenso beim ersten
   * Laden, wenn noch nichts gewählt ist.
   */
  useEffect(() => {
    if (openCustomers.length === 0) {
      setActiveCustomerId(null);
      return;
    }
    const stillOpen = openCustomers.some((entry) => entry.customerId === activeCustomerId);
    if (!stillOpen) setActiveCustomerId(openCustomers[0]?.customerId ?? null);
  }, [openCustomers, activeCustomerId]);

  const listQueryString = useMemo(() => {
    const params = new URLSearchParams({ billing: TIME_ENTRY_BILLING_FILTER.OPEN });
    if (activeCustomerId !== null) params.set('customerId', String(activeCustomerId));
    return params.toString();
  }, [activeCustomerId]);

  const entries = useQuery({
    queryKey: queryKeys.timeEntries.list(listQueryString),
    queryFn: () => apiClient.get<TimeEntryResponse[]>(`/time-entries?${listQueryString}`),
    enabled: activeCustomerId !== null,
    placeholderData: (previous) => previous,
  });

  const items = useMemo(
    () => (activeCustomerId === null ? [] : (entries.data ?? [])),
    [entries.data, activeCustomerId],
  );
  const summary = useMemo(() => summarizeTimeEntries(items), [items]);
  const activeCustomer = openCustomers.find((entry) => entry.customerId === activeCustomerId);

  /** Nach jeder Änderung: Liste und Reiterleiste neu holen — beide hängen daran. */
  const refresh = async (): Promise<void> => {
    await queryClient.invalidateQueries({ queryKey: queryKeys.timeEntries.all });
  };

  const resetForm = (): void => {
    setEditingId(null);
    setValues(emptyTimeEntryValues(String(values.date), String(values.customerId)));
  };

  const save = useMutation({
    mutationFn: (payload: TimeEntryPayload) =>
      editingId === null
        ? apiClient.post<TimeEntryResponse>('/time-entries', payload)
        : apiClient.patch<TimeEntryResponse>(`/time-entries/${editingId}`, payload),
    onSuccess: async (entry) => {
      await refresh();
      setEditingId(null);
      // Datum und Kunde bleiben stehen, die Zeiten sind wieder leer: Der
      // nächste Eintrag betrifft fast immer denselben Tag und Kunden.
      setValues(emptyTimeEntryValues(entry.date, String(entry.customerId)));
      setSavedCount((count) => count + 1);
      // Die Tabelle folgt dem Formular: Wer für einen anderen Kunden
      // erfasst, will dessen Liste sehen — sonst wäre der eben gespeicherte
      // Eintrag nirgends zu finden.
      setActiveCustomerId(entry.customerId);
    },
  });

  const remove = useMutation({
    mutationFn: (id: number) => apiClient.delete<void>(`/time-entries/${id}`),
    onSuccess: async (_result, id) => {
      await refresh();
      setEntryToDelete(null);
      if (editingId === id) resetForm();
    },
  });

  /**
   * Abrechnen: markiert die offenen Zeiten und lädt den Nachweis herunter.
   *
   * Ein Aufruf für beides — zwischen zwei Aufrufen könnte das Markieren
   * gelingen und das Drucken scheitern, und dann gälten Zeiten als
   * abgerechnet, für die es kein Dokument gibt.
   */
  const undo = useMutation({
    mutationFn: (ids: number[]) =>
      apiClient.post<{ count: number }>('/time-entries/unbill', { ids }),
    onSuccess: async (_result, ids) => {
      await refresh();
      toast.success(
        `${ids.length === 1 ? 'Ein Eintrag steht' : `${ids.length} Einträge stehen`} wieder in der offenen Liste.`,
      );
    },
    onError: (error) => setBillingError(error),
  });

  const bill = useMutation({
    mutationFn: (customerId: number) =>
      apiClient.downloadFromPost('/time-entries/bill', { customerId }, 'Zeitnachweis.pdf'),
    onSuccess: async (file) => {
      setBillingError(null);
      saveFile(file);
      await refresh();

      const result = billingResultFrom(file);
      if (result === null) return;

      /*
       * Die Meldung ist die einzige Absicherung gegen einen Fehlklick:
       * Abgerechnet wird ohne Rückfrage, und ohne den Weg zurück
       * verschwänden ein Dutzend Einträge lautlos aus der offenen Liste —
       * beim nächsten echten Abrechnen fehlten sie, und auffallen würde es
       * erst beim Nachrechnen.
       *
       * Deshalb `duration: null`: Diese eine Meldung läuft nicht von selbst
       * ab, sie wird geschlossen. Dass sie unten schwebt statt im Seitenfluss
       * zu stehen, ist der Grund für den Umzug — der alte Balken schob beim
       * Erscheinen die Reiter und die ganze Tabelle nach unten.
       */
      toast.success(
        `${result.entryCount} ${result.entryCount === 1 ? 'Eintrag' : 'Einträge'} für ` +
          `${result.customerName} abgerechnet — ${formatDuration(result.durationMinutes)} h. ` +
          'Der Zeitnachweis wurde heruntergeladen.',
        {
          duration: null,
          action: { label: 'Rückgängig', onClick: () => undo.mutate(result.ids) },
        },
      );
    },
    onError: (error) => setBillingError(error),
  });

  const customerOptions = customers.data ?? [];
  const noCustomers = customers.isSuccess && customerOptions.length === 0;

  return (
    <div className="space-y-6">
      <PageHeader
        title="Zeiterfassung"
        description="Zeiten sammeln sich hier, bis sie abgerechnet werden. Erfasst wird in Viertelstunden."
      />

      {customers.isLoading && <LoadingNote>Kunden werden geladen …</LoadingNote>}

      {customers.isError && (
        <ErrorNotice
          error={customers.error}
          title="Die Kundenauswahl konnte nicht geladen werden."
          onRetry={() => void customers.refetch()}
        />
      )}

      {noCustomers ? (
        <EmptyState
          title="Noch keine Kunden"
          description="Zeiten werden immer für einen Kunden erfasst. Lege zuerst einen Kunden an."
          action={
            <Link to="/customers/new" className={buttonClassName()}>
              Ersten Kunden anlegen
            </Link>
          }
        />
      ) : (
        customers.isSuccess && (
          <TimeEntryForm
            values={values}
            customers={customerOptions}
            editingId={editingId}
            isSubmitting={save.isPending}
            savedCount={savedCount}
            onSubmit={(payload) => save.mutate(payload)}
            onCancelEdit={resetForm}
            fieldErrors={fieldErrorsOf(save.error)}
          />
        )
      )}

      {formErrorOf(save.error) !== null && (
        <ErrorNotice error={save.error} title="Der Eintrag konnte nicht gespeichert werden." />
      )}

      {remove.isError && (
        <ErrorNotice error={remove.error} title="Der Eintrag konnte nicht gelöscht werden." />
      )}

      {billingError !== null && (
        <ErrorNotice
          error={billingError}
          title="Die Zeiten konnten nicht abgerechnet werden."
          onRetry={() => setBillingError(null)}
        />
      )}

      {!noCustomers && (
        <div>
          <div className="flex gap-1 border-b border-border" role="tablist">
            <TabButton active={tab === 'open'} onClick={() => setTab('open')}>
              Offen
              {openCustomers.length > 0 && (
                <span className="ml-2 rounded-full bg-inverse px-2 py-0.5 text-xs text-on-inverse">
                  {openCustomers.reduce((total, entry) => total + entry.entryCount, 0)}
                </span>
              )}
            </TabButton>
            <TabButton active={tab === 'billed'} onClick={() => setTab('billed')}>
              Abgerechnet
            </TabButton>
          </div>

          <div className="pt-4">
            {tab === 'billed' ? (
              <BilledArchive />
            ) : (
              <OpenTab
                openCustomers={openCustomers}
                activeCustomerId={activeCustomerId}
                activeCustomer={activeCustomer}
                entries={entries}
                items={items}
                summary={summary}
                editingId={editingId}
                isBilling={bill.isPending}
                isDeleting={remove.isPending}
                onSelectCustomer={(customerId) => {
                  setActiveCustomerId(customerId);
                  // Umschalten heißt „ich arbeite jetzt an diesem Kunden" —
                  // der wahrscheinlichste nächste Schritt ist ein Eintrag
                  // für ihn.
                  setEditingId(null);
                  setValues((current) => ({ ...current, customerId: String(customerId) }));
                }}
                onEdit={(entry) => {
                  setEditingId(entry.id);
                  setValues(toTimeEntryValues(entry));
                  window.scrollTo({ top: 0, behavior: 'smooth' });
                }}
                onDelete={(entry) => setEntryToDelete(entry)}
                onBill={() => {
                  if (activeCustomerId !== null) bill.mutate(activeCustomerId);
                }}
              />
            )}
          </div>
        </div>
      )}

      {entryToDelete !== null && (
        <ConfirmDialog
          open
          title="Eintrag löschen"
          description={`Der Eintrag vom ${formatDateDe(entryToDelete.date as IsoDate)} wird gelöscht. Das lässt sich nicht rückgängig machen.`}
          confirmLabel="Löschen"
          pendingLabel="wird gelöscht …"
          tone="danger"
          isPending={remove.isPending}
          onConfirm={() => remove.mutate(entryToDelete.id)}
          onClose={() => setEntryToDelete(null)}
        />
      )}
    </div>
  );
}

function TabButton({
  active,
  onClick,
  children,
}: {
  active: boolean;
  onClick: () => void;
  children: React.ReactNode;
}): JSX.Element {
  return (
    <button
      type="button"
      role="tab"
      aria-selected={active}
      onClick={onClick}
      className={`flex items-center ${tabClassName(active)}`}
    >
      {children}
    </button>
  );
}

function OpenTab({
  openCustomers,
  activeCustomerId,
  activeCustomer,
  entries,
  items,
  summary,
  editingId,
  isBilling,
  isDeleting,
  onSelectCustomer,
  onEdit,
  onDelete,
  onBill,
}: {
  openCustomers: readonly TimeEntryOpenSummary[];
  activeCustomerId: number | null;
  activeCustomer: TimeEntryOpenSummary | undefined;
  entries: { isLoading: boolean; isError: boolean; error: unknown; refetch: () => unknown };
  items: readonly TimeEntryResponse[];
  summary: ReturnType<typeof summarizeTimeEntries>;
  editingId: number | null;
  isBilling: boolean;
  isDeleting: boolean;
  onSelectCustomer: (customerId: number) => void;
  onEdit: (entry: TimeEntryResponse) => void;
  onDelete: (entry: TimeEntryResponse) => void;
  onBill: () => void;
}): JSX.Element {
  if (openCustomers.length === 0) {
    return (
      <EmptyState
        title="Alles abgerechnet"
        description="Für keinen Kunden stehen offene Zeiten an. Neu erfasste Zeiten erscheinen hier."
      />
    );
  }

  return (
    <div className="space-y-4">
      <CustomerTabs
        customers={openCustomers}
        activeId={activeCustomerId}
        onSelect={onSelectCustomer}
      />

      <div className="flex flex-wrap items-center justify-between gap-3 rounded-lg border border-border bg-surface-sunken px-4 py-3">
        <div className="text-sm">
          <span className="font-medium text-ink">
            {summary.entryCount} {summary.entryCount === 1 ? 'Eintrag' : 'Einträge'}
          </span>
          <span className="mx-2 text-ink-faint">·</span>
          <span className="font-semibold tabular-nums text-ink">
            {formatDuration(summary.durationMinutes)} h
          </span>
          <span className="ml-2 tabular-nums text-ink-subtle">
            ({formatDecimalHours(summary.durationMinutes)} Std.)
          </span>
          {activeCustomer !== undefined && (
            <span className="ml-2 block text-xs text-ink-subtle sm:ml-3 sm:inline">
              {activeCustomer.from === activeCustomer.to
                ? formatDateDe(activeCustomer.from as IsoDate)
                : `${formatDateDe(activeCustomer.from as IsoDate)} – ${formatDateDe(activeCustomer.to as IsoDate)}`}
            </span>
          )}
        </div>

        <Button
          disabled={items.length === 0}
          pending={isBilling}
          pendingLabel="wird abgerechnet …"
          onClick={onBill}
        >
          Abrechnen
        </Button>
      </div>

      {entries.isLoading && <LoadingNote>Zeiten werden geladen …</LoadingNote>}

      {entries.isError && (
        <ErrorNotice
          error={entries.error}
          title="Die erfassten Zeiten konnten nicht geladen werden."
          onRetry={() => void entries.refetch()}
        />
      )}

      {items.length > 0 && (
        <TimeEntryTable
          entries={items}
          editingId={editingId}
          isDeleting={isDeleting}
          onEdit={onEdit}
          onDelete={onDelete}
        />
      )}
    </div>
  );
}
