import { useMemo, useState } from 'react';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import {
  CUSTOMER_ARCHIVE_FILTER,
  addDays,
  formatDateDe,
  formatDecimalHours,
  formatDuration,
  formatTimeOfDay,
  monthRange,
  summarizeTimeEntries,
  todayIso,
  type CustomerResponse,
  type IsoDate,
  type TimeEntryPayload,
  type TimeEntryResponse,
} from '@agentur-tool/shared';
import { apiClient } from '../../lib/apiClient.js';
import { fieldErrorsOf, formErrorOf } from '../../lib/errorMessage.js';
import { queryKeys } from '../../lib/queryKeys.js';
import { useDocumentTitle } from '../../lib/useDocumentTitle.js';
import { Button } from '../../components/ui/Button.js';
import { Card } from '../../components/ui/Card.js';
import { EmptyState } from '../../components/ui/EmptyState.js';
import { ErrorNotice } from '../../components/ui/ErrorNotice.js';
import { Field } from '../../components/ui/Field.js';
import { Input } from '../../components/ui/Input.js';
import { LoadingNote } from '../../components/ui/LoadingNote.js';
import { Select } from '../../components/ui/Select.js';
import { saveFile } from '../invoices/saveFile.js';
import {
  TimeEntryForm,
  emptyTimeEntryValues,
  toTimeEntryValues,
  type TimeEntryFormValues,
} from './TimeEntryForm.js';

/** Der Zeitraum, den die Seite gerade zeigt — Filter der Liste und des PDFs. */
interface Range {
  from: string;
  to: string;
  customerId: string;
}

function currentMonth(): Range {
  const { from, to } = monthRange(todayIso());
  return { from, to, customerId: '' };
}

/**
 * Setzt den Zeitraum auf den vorigen oder nächsten Monat.
 *
 * Anker ist der Monat, in dem `from` liegt — nicht der Zeitraum selbst: Nach
 * einer Woche als Auswahl soll „Monat vor" einen Monat zeigen und nicht die
 * folgende Woche.
 */
function shiftMonth(range: Range, direction: -1 | 1): Range {
  const month = monthRange(range.from as IsoDate);
  const target = direction === -1 ? addDays(month.from, -1) : addDays(month.to, 1);
  const shifted = monthRange(target);
  return { ...range, from: shifted.from, to: shifted.to };
}

function toQueryString(range: Range): string {
  const params = new URLSearchParams({ from: range.from, to: range.to });
  if (range.customerId !== '') params.set('customerId', range.customerId);
  return params.toString();
}

/**
 * Die Zeiterfassung.
 *
 * Eine Seite statt Liste plus Detailseite: Zeiten werden nicht einzeln
 * gepflegt, sondern nachgetragen — meist mehrere hintereinander für
 * dieselbe Woche. Formular, Liste und Summe stehen deshalb untereinander,
 * und der Zeitraum oben gilt für alles darunter, das PDF eingeschlossen.
 */
export function TimeTrackingPage(): JSX.Element {
  useDocumentTitle('Zeiterfassung');

  const queryClient = useQueryClient();
  const [range, setRange] = useState<Range>(currentMonth);
  const [editingId, setEditingId] = useState<number | null>(null);
  const [values, setValues] = useState<TimeEntryFormValues>(() => emptyTimeEntryValues(todayIso()));
  const [exportError, setExportError] = useState<unknown>(null);

  const rangeIsValid = range.from !== '' && range.to !== '' && range.to >= range.from;
  const queryString = toQueryString(range);

  const customers = useQuery({
    queryKey: queryKeys.customers.list('', CUSTOMER_ARCHIVE_FILTER.ALL),
    queryFn: () =>
      apiClient.get<CustomerResponse[]>(`/customers?archived=${CUSTOMER_ARCHIVE_FILTER.ALL}`),
  });

  const entries = useQuery({
    queryKey: queryKeys.timeEntries.list(queryString),
    queryFn: () => apiClient.get<TimeEntryResponse[]>(`/time-entries?${queryString}`),
    enabled: rangeIsValid,
    placeholderData: (previous) => previous,
  });

  const items = useMemo(() => entries.data ?? [], [entries.data]);
  const summary = useMemo(() => summarizeTimeEntries(items), [items]);

  /** Nach dem Speichern zurück zum leeren Formular — der nächste Tag folgt gleich. */
  const resetForm = (date?: string): void => {
    setEditingId(null);
    setValues(emptyTimeEntryValues(date ?? String(values.date), String(values.customerId)));
  };

  const save = useMutation({
    mutationFn: (payload: TimeEntryPayload) =>
      editingId === null
        ? apiClient.post<TimeEntryResponse>('/time-entries', payload)
        : apiClient.patch<TimeEntryResponse>(`/time-entries/${editingId}`, payload),
    onSuccess: async (entry) => {
      await queryClient.invalidateQueries({ queryKey: queryKeys.timeEntries.all });
      resetForm(entry.date);
    },
  });

  const remove = useMutation({
    mutationFn: (id: number) => apiClient.delete<void>(`/time-entries/${id}`),
    onSuccess: async (_result, id) => {
      await queryClient.invalidateQueries({ queryKey: queryKeys.timeEntries.all });
      if (editingId === id) resetForm();
    },
  });

  const exportPdf = useMutation({
    mutationFn: () =>
      apiClient.download(`/time-entries/report/pdf?${queryString}`, 'Zeitnachweis.pdf'),
    onSuccess: (file) => {
      setExportError(null);
      saveFile(file);
    },
    onError: (error) => setExportError(error),
  });

  const customerOptions = customers.data ?? [];

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-xl font-semibold text-slate-900">Zeiterfassung</h1>
        <p className="mt-1 text-sm text-slate-500">
          Gearbeitete Zeit je Kunde festhalten und als Zeitnachweis für einen Zeitraum exportieren.
          Erfasst wird in Viertelstunden.
        </p>
      </div>

      <Card title="Zeitraum" description="Gilt für die Liste unten und für den PDF-Export.">
        <div className="grid gap-4 sm:grid-cols-6">
          <Field label="Von" htmlFor="from" className="sm:col-span-2">
            <Input
              id="from"
              type="date"
              value={range.from}
              onChange={(event) => setRange({ ...range, from: event.target.value })}
            />
          </Field>
          <Field
            label="Bis"
            htmlFor="to"
            className="sm:col-span-2"
            error={rangeIsValid ? undefined : 'Das Ende liegt vor dem Beginn.'}
          >
            <Input
              id="to"
              type="date"
              value={range.to}
              invalid={!rangeIsValid}
              onChange={(event) => setRange({ ...range, to: event.target.value })}
            />
          </Field>
          <Field label="Kunde" htmlFor="filterCustomer" className="sm:col-span-2">
            <Select
              id="filterCustomer"
              value={range.customerId}
              onChange={(event) => setRange({ ...range, customerId: event.target.value })}
            >
              <option value="">Alle Kunden</option>
              {customerOptions.map((customer) => (
                <option key={customer.id} value={customer.id}>
                  {customer.companyName}
                </option>
              ))}
            </Select>
          </Field>
        </div>

        <div className="mt-4 flex flex-wrap items-center gap-2">
          <Button variant="secondary" onClick={() => setRange(shiftMonth(range, -1))}>
            ← Monat zurück
          </Button>
          <Button
            variant="secondary"
            onClick={() => setRange({ ...currentMonth(), customerId: range.customerId })}
          >
            Dieser Monat
          </Button>
          <Button variant="secondary" onClick={() => setRange(shiftMonth(range, 1))}>
            Monat vor →
          </Button>
          <Button
            className="ml-auto"
            disabled={!rangeIsValid || exportPdf.isPending}
            onClick={() => exportPdf.mutate()}
          >
            {exportPdf.isPending ? 'PDF wird erzeugt …' : 'Zeitnachweis als PDF'}
          </Button>
        </div>

        {exportError !== null && (
          <ErrorNotice
            className="mt-4"
            error={exportError}
            title="Der Zeitnachweis konnte nicht erzeugt werden."
          />
        )}
      </Card>

      {customers.isSuccess && customerOptions.length === 0 ? (
        <EmptyState
          title="Noch keine Kunden"
          description="Zeiten werden immer für einen Kunden erfasst. Lege zuerst einen Kunden an."
        />
      ) : (
        <TimeEntryForm
          values={values}
          customers={customerOptions}
          editingId={editingId}
          isSubmitting={save.isPending}
          onSubmit={(payload) => save.mutate(payload)}
          onCancelEdit={() => resetForm()}
          fieldErrors={fieldErrorsOf(save.error)}
        />
      )}

      {formErrorOf(save.error) !== null && (
        <ErrorNotice error={save.error} title="Der Eintrag konnte nicht gespeichert werden." />
      )}

      {remove.isError && (
        <ErrorNotice error={remove.error} title="Der Eintrag konnte nicht gelöscht werden." />
      )}

      {entries.isLoading && <LoadingNote>Zeiten werden geladen …</LoadingNote>}

      {entries.isError && (
        <ErrorNotice
          error={entries.error}
          title="Die erfassten Zeiten konnten nicht geladen werden."
          onRetry={() => void entries.refetch()}
        />
      )}

      {entries.isSuccess && items.length === 0 && (
        <EmptyState
          title="Keine Zeiten in diesem Zeitraum"
          description={`Zwischen ${formatDateDe(range.from as IsoDate)} und ${formatDateDe(
            range.to as IsoDate,
          )} wurde nichts erfasst.`}
        />
      )}

      {items.length > 0 && (
        <>
          <div className="overflow-x-auto rounded-lg border border-slate-200 bg-white">
            <table className="w-full min-w-[48rem] text-sm">
              <thead className="border-b border-slate-200 bg-slate-50 text-left text-xs uppercase tracking-wide text-slate-500">
                <tr>
                  <th className="px-4 py-2 font-medium">Datum</th>
                  <th className="px-4 py-2 font-medium">Kunde</th>
                  <th className="px-4 py-2 text-right font-medium">Beginn</th>
                  <th className="px-4 py-2 text-right font-medium">Ende</th>
                  <th className="px-4 py-2 text-right font-medium">Pause</th>
                  <th className="px-4 py-2 text-right font-medium">Dauer</th>
                  <th className="px-4 py-2 font-medium">Tätigkeit</th>
                  <th className="px-4 py-2">
                    <span className="sr-only">Aktionen</span>
                  </th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-100">
                {items.map((entry) => (
                  <tr
                    key={entry.id}
                    className={entry.id === editingId ? 'bg-slate-50' : 'hover:bg-slate-50'}
                  >
                    <td className="whitespace-nowrap px-4 py-3">
                      {formatDateDe(entry.date as IsoDate)}
                    </td>
                    <td className="px-4 py-3">{entry.customerName}</td>
                    <td className="px-4 py-3 text-right tabular-nums text-slate-600">
                      {formatTimeOfDay(entry.startMinutes)}
                    </td>
                    <td className="px-4 py-3 text-right tabular-nums text-slate-600">
                      {formatTimeOfDay(entry.endMinutes)}
                    </td>
                    <td className="px-4 py-3 text-right tabular-nums text-slate-500">
                      {entry.breakMinutes === 0 ? '—' : formatDuration(entry.breakMinutes)}
                    </td>
                    <td className="px-4 py-3 text-right font-medium tabular-nums text-slate-900">
                      {formatDuration(entry.durationMinutes)}
                    </td>
                    <td className="px-4 py-3 text-slate-600">{entry.description ?? '—'}</td>
                    <td className="whitespace-nowrap px-4 py-3 text-right">
                      <button
                        type="button"
                        className="text-sm text-slate-600 hover:underline"
                        onClick={() => {
                          setEditingId(entry.id);
                          setValues(toTimeEntryValues(entry));
                        }}
                      >
                        Bearbeiten
                      </button>
                      <button
                        type="button"
                        className="ml-3 text-sm text-rose-700 hover:underline"
                        disabled={remove.isPending}
                        onClick={() => {
                          if (
                            window.confirm(
                              `Den Eintrag vom ${formatDateDe(entry.date as IsoDate)} wirklich löschen?`,
                            )
                          ) {
                            remove.mutate(entry.id);
                          }
                        }}
                      >
                        Löschen
                      </button>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>

          <Card title="Summe" description={`${summary.entryCount} Einträge im gewählten Zeitraum.`}>
            <dl className="divide-y divide-slate-100">
              {summary.byCustomer.map((customer) => (
                <div key={customer.customerId} className="flex justify-between gap-4 py-2 text-sm">
                  <dt className="text-slate-600">{customer.customerName}</dt>
                  <dd className="tabular-nums text-slate-900">
                    {formatDuration(customer.durationMinutes)} h
                    <span className="ml-2 text-slate-500">
                      ({formatDecimalHours(customer.durationMinutes)} Std.)
                    </span>
                  </dd>
                </div>
              ))}
              <div className="flex justify-between gap-4 border-t border-slate-300 pt-3 text-sm font-semibold">
                <dt>Gesamt</dt>
                <dd className="tabular-nums">
                  {formatDuration(summary.durationMinutes)} h
                  <span className="ml-2 font-normal text-slate-500">
                    ({formatDecimalHours(summary.durationMinutes)} Std.)
                  </span>
                </dd>
              </div>
            </dl>
          </Card>
        </>
      )}
    </div>
  );
}
