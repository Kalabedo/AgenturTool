import { useMemo, useState } from 'react';
import { useMutation, useQuery } from '@tanstack/react-query';
import {
  CUSTOMER_ARCHIVE_FILTER,
  TIME_ENTRY_BILLING_FILTER,
  addDays,
  formatDecimalHours,
  formatDuration,
  monthRange,
  summarizeTimeEntries,
  todayIso,
  type CustomerResponse,
  type IsoDate,
  type TimeEntryResponse,
} from '@agentur-tool/shared';
import { apiClient } from '../../lib/apiClient.js';
import { queryKeys } from '../../lib/queryKeys.js';
import { Button } from '../../components/ui/Button.js';
import { Card } from '../../components/ui/Card.js';
import { EmptyState } from '../../components/ui/EmptyState.js';
import { ErrorNotice } from '../../components/ui/ErrorNotice.js';
import { Field } from '../../components/ui/Field.js';
import { Input } from '../../components/ui/Input.js';
import { LoadingNote } from '../../components/ui/LoadingNote.js';
import { Select } from '../../components/ui/Select.js';
import { useToast } from '../../components/ui/Toast.js';
import { SendMailDialog } from '../mail/SendMailDialog.js';
import { saveFile } from '../invoices/saveFile.js';
import { TimeEntryTable } from './TimeEntryTable.js';

interface Range {
  from: string;
  to: string;
  customerId: string;
}

function currentMonth(customerId = ''): Range {
  const { from, to } = monthRange(todayIso());
  return { from, to, customerId };
}

/** Anker ist der Monat, in dem `from` liegt — nach einer Wochenauswahl soll
 *  „Monat zurück" einen Monat zeigen und nicht die vorige Woche. */
function shiftMonth(range: Range, direction: -1 | 1): Range {
  const month = monthRange(range.from as IsoDate);
  const target = direction === -1 ? addDays(month.from, -1) : addDays(month.to, 1);
  const shifted = monthRange(target);
  return { ...range, from: shifted.from, to: shifted.to };
}

/**
 * Der Blick zurück auf abgerechnete Zeiten.
 *
 * Der Nebenweg, nicht der Normalweg: Hier steht der Zeitraumfilter, den die
 * Hauptansicht bewusst nicht hat, und hier lässt sich für einen beliebigen
 * Zeitraum ein Nachweis neu erzeugen. Weil das Abrechnen nur markiert und
 * nicht löscht, sind die Zeilen vollständig erhalten — das PDF entsteht aus
 * denselben Daten wie beim ersten Mal und muss nirgends aufbewahrt werden.
 */
export function BilledArchive(): JSX.Element {
  const toast = useToast();
  const [range, setRange] = useState<Range>(() => currentMonth());
  const [exportError, setExportError] = useState<unknown>(null);
  const [mailOpen, setMailOpen] = useState(false);

  const rangeIsValid = range.from !== '' && range.to !== '' && range.to >= range.from;

  const queryString = useMemo(() => {
    const params = new URLSearchParams({
      from: range.from,
      to: range.to,
      billing: TIME_ENTRY_BILLING_FILTER.BILLED,
    });
    if (range.customerId !== '') params.set('customerId', range.customerId);
    return params.toString();
  }, [range]);

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

  const items = entries.data ?? [];
  const summary = useMemo(() => summarizeTimeEntries(items), [items]);

  const exportPdf = useMutation({
    mutationFn: () =>
      apiClient.download(`/time-entries/report/pdf?${queryString}`, 'Zeitnachweis.pdf'),
    onSuccess: (file) => {
      setExportError(null);
      saveFile(file);
      toast.success('Der Zeitnachweis wurde heruntergeladen.');
    },
    onError: (error) => setExportError(error),
  });

  return (
    <div className="space-y-4">
      <Card
        title="Zeitraum"
        description="Gilt für die Liste unten und für den Nachweis, der daraus entsteht."
      >
        <div className="grid gap-4 sm:grid-cols-6">
          <Field label="Von" htmlFor="archiveFrom" className="sm:col-span-2">
            <Input
              id="archiveFrom"
              type="date"
              value={range.from}
              onChange={(event) => setRange({ ...range, from: event.target.value })}
            />
          </Field>
          <Field
            label="Bis"
            htmlFor="archiveTo"
            className="sm:col-span-2"
            error={rangeIsValid ? undefined : 'Das Ende liegt vor dem Beginn.'}
          >
            <Input
              id="archiveTo"
              type="date"
              value={range.to}
              invalid={!rangeIsValid}
              onChange={(event) => setRange({ ...range, to: event.target.value })}
            />
          </Field>
          <Field label="Kunde" htmlFor="archiveCustomer" className="sm:col-span-2">
            <Select
              id="archiveCustomer"
              value={range.customerId}
              onChange={(event) => setRange({ ...range, customerId: event.target.value })}
            >
              <option value="">Alle Kunden</option>
              {(customers.data ?? []).map((customer) => (
                <option key={customer.id} value={customer.id}>
                  {customer.companyName}
                  {customer.archivedAt === null ? '' : ' (archiviert)'}
                </option>
              ))}
            </Select>
          </Field>
        </div>

        <div className="mt-4 flex flex-wrap items-center gap-2">
          <Button variant="secondary" onClick={() => setRange(shiftMonth(range, -1))}>
            ← Monat zurück
          </Button>
          <Button variant="secondary" onClick={() => setRange(currentMonth(range.customerId))}>
            Dieser Monat
          </Button>
          <Button variant="secondary" onClick={() => setRange(shiftMonth(range, 1))}>
            Monat vor →
          </Button>
          <Button
            className="ml-auto"
            variant="secondary"
            disabled={!rangeIsValid || items.length === 0 || exportPdf.isPending}
            onClick={() => exportPdf.mutate()}
          >
            {exportPdf.isPending ? 'PDF wird erzeugt …' : 'Nachweis erneut erzeugen'}
          </Button>
          {/* Der Versand braucht einen Empfänger, und den gibt es erst mit
              einem ausgewählten Kunden — „Alle Kunden" hat keine Adresse. */}
          <Button
            variant="secondary"
            disabled={!rangeIsValid || range.customerId === '' || items.length === 0}
            title={
              range.customerId === '' ? 'Dafür bitte einen einzelnen Kunden wählen.' : undefined
            }
            onClick={() => setMailOpen(true)}
          >
            Per E-Mail senden
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

      {entries.isLoading && <LoadingNote>Abgerechnete Zeiten werden geladen …</LoadingNote>}

      {entries.isError && (
        <ErrorNotice
          error={entries.error}
          title="Die abgerechneten Zeiten konnten nicht geladen werden."
          onRetry={() => void entries.refetch()}
        />
      )}

      {rangeIsValid && entries.isSuccess && items.length === 0 && (
        <EmptyState
          title="Keine abgerechneten Zeiten in diesem Zeitraum"
          description="Wähle einen anderen Zeitraum oder einen anderen Kunden."
        />
      )}

      {items.length > 0 && (
        <>
          <div className="flex flex-wrap items-baseline justify-between gap-3 px-1">
            <p className="text-sm text-ink-subtle">
              {summary.entryCount} {summary.entryCount === 1 ? 'Eintrag' : 'Einträge'}
            </p>
            <p className="text-sm tabular-nums text-ink">
              <span className="font-semibold">{formatDuration(summary.durationMinutes)} h</span>
              <span className="ml-2 text-ink-subtle">
                ({formatDecimalHours(summary.durationMinutes)} Std.)
              </span>
            </p>
          </div>

          <TimeEntryTable entries={items} editingId={null} showBilledAt />
        </>
      )}

      {mailOpen && range.customerId !== '' && (
        <SendMailDialog
          source={{
            kind: 'TIME_REPORT',
            customerId: Number(range.customerId),
            from: range.from,
            to: range.to,
          }}
          title="Zeitnachweis per E-Mail senden"
          description="Der Nachweis entsteht aus dem Zeitraum und dem Kunden, die oben eingestellt sind."
          open
          onClose={() => setMailOpen(false)}
        />
      )}
    </div>
  );
}
