import { useEffect, useMemo } from 'react';
import { useForm } from 'react-hook-form';
import { zodResolver } from '@hookform/resolvers/zod';
import {
  TIME_GRID_MINUTES,
  TIME_ENTRY_DESCRIPTION_MAX_LENGTH,
  formatDuration,
  formatTimeOfDay,
  gridTimes,
  parseTimeOfDay,
  timeEntryInputSchema,
  type CustomerResponse,
  type TimeEntryInput,
  type TimeEntryPayload,
  type TimeEntryResponse,
} from '@agentur-tool/shared';
import { Button } from '../../components/ui/Button.js';
import { Card } from '../../components/ui/Card.js';
import { Field } from '../../components/ui/Field.js';
import { Input } from '../../components/ui/Input.js';
import { Select } from '../../components/ui/Select.js';

/**
 * Das Formular ist durchgehend stringbasiert.
 *
 * `<select>` und `<input>` liefern ohnehin nur Strings; die Umwandlung in
 * Zahlen und die Rundung aufs Viertelstundenraster macht
 * `timeEntryInputSchema` — dieselbe Stelle, die auch der Server benutzt.
 */
export type TimeEntryFormValues = TimeEntryInput;

/** Uhrzeiten der Auswahl: 00:00 bis 23:45 für den Beginn, plus 24:00 fürs Ende. */
const START_TIMES = gridTimes();
const END_TIMES = gridTimes(true).slice(1);

/**
 * Pausenlängen zur Auswahl, bis vier Stunden.
 *
 * Ein Auswahlfeld statt eines Zahlenfelds, weil die Pause im selben Raster
 * liegt wie alles andere: „20 Minuten Pause" gibt es in dieser Anwendung
 * nicht, und ein Feld, das die Eingabe still auf 15 zurückschneidet, wäre
 * ärgerlicher als eine Liste, die nur zeigt, was geht.
 */
const BREAK_OPTIONS = Array.from({ length: 17 }, (_, index) => index * TIME_GRID_MINUTES);

export function emptyTimeEntryValues(date: string, customerId = ''): TimeEntryFormValues {
  return {
    date,
    customerId,
    startMinutes: '09:00',
    endMinutes: '17:00',
    breakMinutes: '0',
    description: '',
  };
}

export function toTimeEntryValues(entry: TimeEntryResponse): TimeEntryFormValues {
  return {
    date: entry.date,
    customerId: String(entry.customerId),
    startMinutes: formatTimeOfDay(entry.startMinutes),
    endMinutes: formatTimeOfDay(entry.endMinutes),
    breakMinutes: String(entry.breakMinutes),
    description: entry.description ?? '',
  };
}

interface TimeEntryFormProps {
  values: TimeEntryFormValues;
  customers: CustomerResponse[];
  /** Gesetzt, solange ein vorhandener Eintrag bearbeitet wird. */
  editingId: number | null;
  isSubmitting: boolean;
  onSubmit: (payload: TimeEntryPayload) => void;
  onCancelEdit: () => void;
  fieldErrors?: Record<string, string>;
}

export function TimeEntryForm({
  values,
  customers,
  editingId,
  isSubmitting,
  onSubmit,
  onCancelEdit,
  fieldErrors,
}: TimeEntryFormProps): JSX.Element {
  const form = useForm<TimeEntryFormValues, unknown, TimeEntryPayload>({
    resolver: zodResolver(timeEntryInputSchema),
    defaultValues: values,
  });

  // Der Wechsel zwischen „neu" und „bearbeiten" tauscht die Werte, nicht die
  // Komponente: Ohne dieses Zurücksetzen bliebe beim Klick auf „Bearbeiten"
  // das stehen, was gerade im Formular stand.
  useEffect(() => {
    form.reset(values);
  }, [form, values]);

  const start = String(form.watch('startMinutes'));
  const end = String(form.watch('endMinutes'));
  const pause = Number(form.watch('breakMinutes'));

  /**
   * Die Dauer, während man sie einstellt.
   *
   * Sie steht im Formular, weil sie die eigentliche Angabe ist: Beginn und
   * Ende sind nur der Weg dorthin, und ein Vertipper fällt hier sofort auf
   * statt erst in der Monatssumme.
   */
  const duration = useMemo(() => {
    const from = parseTimeOfDay(start);
    const to = parseTimeOfDay(end);
    if (from === null || to === null) return null;

    const minutes = to - from - (Number.isFinite(pause) ? pause : 0);
    return minutes > 0 ? minutes : null;
  }, [start, end, pause]);

  const errors = form.formState.errors;
  const errorFor = (field: keyof TimeEntryFormValues): string | undefined =>
    fieldErrors?.[field] ?? errors[field]?.message;

  return (
    <Card
      title={editingId === null ? 'Zeit erfassen' : 'Eintrag bearbeiten'}
      description="Beginn, Ende und Pause in Viertelstunden — so, wie später abgerechnet wird."
    >
      <form onSubmit={form.handleSubmit(onSubmit)} className="space-y-4" noValidate>
        <div className="grid gap-4 sm:grid-cols-6">
          <Field
            label="Datum"
            htmlFor="date"
            required
            error={errorFor('date')}
            className="sm:col-span-2"
          >
            <Input
              id="date"
              type="date"
              invalid={errorFor('date') !== undefined}
              {...form.register('date')}
            />
          </Field>

          <Field
            label="Kunde"
            htmlFor="customerId"
            required
            error={errorFor('customerId')}
            className="sm:col-span-4"
          >
            <Select
              id="customerId"
              invalid={errorFor('customerId') !== undefined}
              {...form.register('customerId')}
            >
              <option value="">Bitte wählen …</option>
              {customers.map((customer) => (
                <option key={customer.id} value={customer.id}>
                  {customer.companyName}
                </option>
              ))}
            </Select>
          </Field>

          <Field
            label="Beginn"
            htmlFor="startMinutes"
            required
            error={errorFor('startMinutes')}
            className="sm:col-span-2"
          >
            <Select
              id="startMinutes"
              invalid={errorFor('startMinutes') !== undefined}
              {...form.register('startMinutes')}
            >
              {START_TIMES.map((time) => (
                <option key={time} value={time}>
                  {time}
                </option>
              ))}
            </Select>
          </Field>

          <Field
            label="Ende"
            htmlFor="endMinutes"
            required
            error={errorFor('endMinutes')}
            className="sm:col-span-2"
          >
            <Select
              id="endMinutes"
              invalid={errorFor('endMinutes') !== undefined}
              {...form.register('endMinutes')}
            >
              {END_TIMES.map((time) => (
                <option key={time} value={time}>
                  {time}
                </option>
              ))}
            </Select>
          </Field>

          <Field
            label="Pause"
            htmlFor="breakMinutes"
            error={errorFor('breakMinutes')}
            className="sm:col-span-2"
          >
            <Select
              id="breakMinutes"
              invalid={errorFor('breakMinutes') !== undefined}
              {...form.register('breakMinutes')}
            >
              {BREAK_OPTIONS.map((minutes) => (
                <option key={minutes} value={minutes}>
                  {minutes === 0 ? 'keine' : `${formatDuration(minutes)} h`}
                </option>
              ))}
            </Select>
          </Field>

          <Field
            label="Tätigkeit"
            htmlFor="description"
            hint="Erscheint im Zeitnachweis neben der Zeit."
            error={errorFor('description')}
            className="sm:col-span-6"
          >
            <Input
              id="description"
              placeholder="z. B. Konzept Startseite"
              maxLength={TIME_ENTRY_DESCRIPTION_MAX_LENGTH}
              invalid={errorFor('description') !== undefined}
              {...form.register('description')}
            />
          </Field>
        </div>

        <div className="flex flex-wrap items-center gap-3">
          <Button type="submit" disabled={isSubmitting}>
            {editingId === null ? 'Zeit eintragen' : 'Änderung speichern'}
          </Button>
          {editingId !== null && (
            <Button variant="secondary" onClick={onCancelEdit}>
              Abbrechen
            </Button>
          )}
          <span aria-live="polite" className="text-sm text-slate-500">
            {duration === null
              ? 'Das Ende muss nach dem Beginn liegen.'
              : `Erfasste Zeit: ${formatDuration(duration)} h`}
          </span>
        </div>
      </form>
    </Card>
  );
}
