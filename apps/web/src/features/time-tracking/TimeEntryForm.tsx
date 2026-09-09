import { useEffect, useMemo, useRef } from 'react';
import { Controller, useForm } from 'react-hook-form';
import { zodResolver } from '@hookform/resolvers/zod';
import {
  TIME_GRID_MINUTES,
  TIME_ENTRY_DESCRIPTION_MAX_LENGTH,
  formatDuration,
  formatTimeOfDay,
  parseTimeInput,
  snapToGrid,
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
import { TimeInput, gridHintFor } from './TimeInput.js';

/**
 * Das Formular ist durchgehend stringbasiert.
 *
 * `<select>` und `<input>` liefern ohnehin nur Strings; die Umwandlung in
 * Zahlen und die Rundung aufs Viertelstundenraster macht
 * `timeEntryInputSchema` — dieselbe Stelle, die auch der Server benutzt.
 */
export type TimeEntryFormValues = TimeEntryInput;

/**
 * Pausenlängen zur Auswahl, bis vier Stunden.
 *
 * Ein Auswahlfeld statt eines Zahlenfelds, weil die Pause im selben Raster
 * liegt wie alles andere: „20 Minuten Pause" gibt es in dieser Anwendung
 * nicht, und ein Feld, das die Eingabe still auf 15 zurückschneidet, wäre
 * ärgerlicher als eine Liste, die nur zeigt, was geht.
 */
const BREAK_OPTIONS = Array.from({ length: 17 }, (_, index) => index * TIME_GRID_MINUTES);

/**
 * Ein leeres Formular.
 *
 * Die Zeitfelder starten leer und werden es nach jedem Speichern wieder —
 * auch beim ersten Öffnen der Seite. Eine Vorbelegung mit „09:00 bis 17:00"
 * wäre bequem und gefährlich zugleich: Sie lässt sich absenden, ohne dass
 * jemand die Zeiten angesehen hat, und trägt dann einen Achtstundentag ein,
 * den es so nie gab.
 *
 * Datum und Kunde bleiben dagegen stehen — beim Nachtragen ändert sich
 * meist nur die Uhrzeit, und wer den Tag wechselt, tut es bewusst.
 */
export function emptyTimeEntryValues(date: string, customerId = ''): TimeEntryFormValues {
  return {
    date,
    customerId,
    startMinutes: '',
    endMinutes: '',
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
  /** Zählt hoch, wenn gespeichert wurde — setzt den Fokus zurück auf „Beginn". */
  savedCount: number;
  onSubmit: (payload: TimeEntryPayload) => void;
  onCancelEdit: () => void;
  fieldErrors?: Record<string, string>;
}

export function TimeEntryForm({
  values,
  customers,
  editingId,
  isSubmitting,
  savedCount,
  onSubmit,
  onCancelEdit,
  fieldErrors,
}: TimeEntryFormProps): JSX.Element {
  const form = useForm<TimeEntryFormValues, unknown, TimeEntryPayload>({
    resolver: zodResolver(timeEntryInputSchema),
    defaultValues: values,
  });
  const startRef = useRef<HTMLInputElement | null>(null);

  // Der Wechsel zwischen „neu" und „bearbeiten" tauscht die Werte, nicht die
  // Komponente: Ohne dieses Zurücksetzen bliebe beim Klick auf „Bearbeiten"
  // das stehen, was gerade im Formular stand.
  useEffect(() => {
    form.reset(values);
  }, [form, values]);

  /**
   * Nach dem Speichern zurück in die Schleife.
   *
   * Datum und Kunde stehen noch, die Zeitfelder sind leer — das erste Feld,
   * das wirklich ausgefüllt werden muss, ist „Beginn". Der Fokus springt
   * dorthin, damit Nachtragen aus tippen, tippen, Enter besteht und die
   * Hand nicht zur Maus wandert.
   *
   * Am Zähler und nicht an den Werten aufgehängt: Zwei identische Einträge
   * hintereinander ergäben dieselben Werte und der Fokus bliebe liegen.
   */
  useEffect(() => {
    if (savedCount > 0 && editingId === null) startRef.current?.focus();
  }, [savedCount, editingId]);

  const start = String(form.watch('startMinutes'));
  const end = String(form.watch('endMinutes'));
  const pause = Number(form.watch('breakMinutes'));

  /**
   * Die Dauer, während man sie einstellt.
   *
   * Sie steht im Formular, weil sie die eigentliche Angabe ist: Beginn und
   * Ende sind nur der Weg dorthin, und ein Vertipper fällt hier sofort auf
   * statt erst in der Monatssumme. Gerechnet wird mit den gerundeten
   * Werten — also mit dem, was gespeichert würde.
   */
  const duration = useMemo(() => {
    const from = parseTimeInput(start);
    const to = parseTimeInput(end);
    if (from === null || to === null) return null;

    const minutes =
      snapToGrid(to) - snapToGrid(from) - (Number.isFinite(pause) ? snapToGrid(pause) : 0);
    return minutes > 0 ? minutes : null;
  }, [start, end, pause]);

  const errors = form.formState.errors;
  const errorFor = (field: keyof TimeEntryFormValues): string | undefined =>
    fieldErrors?.[field] ?? errors[field]?.message;

  const isEditing = editingId !== null;

  return (
    <Card
      title={isEditing ? 'Eintrag bearbeiten' : 'Zeit erfassen'}
      description={
        isEditing
          ? 'Änderungen gelten nur für offene Einträge.'
          : 'Beginn und Ende lassen sich tippen: 9, 930 oder 14:15.'
      }
      className={isEditing ? 'border-slate-400 ring-1 ring-slate-200' : undefined}
    >
      <form onSubmit={form.handleSubmit(onSubmit)} className="space-y-4" noValidate>
        <div className="grid gap-4 sm:grid-cols-12">
          <Field
            label="Datum"
            htmlFor="date"
            required
            error={errorFor('date')}
            className="sm:col-span-3"
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
            hint={gridHintFor(start)}
            className="sm:col-span-2"
          >
            <Controller
              control={form.control}
              name="startMinutes"
              render={({ field }) => (
                <TimeInput
                  ref={startRef}
                  id="startMinutes"
                  value={String(field.value ?? '')}
                  onChange={field.onChange}
                  onBlur={field.onBlur}
                  invalid={errorFor('startMinutes') !== undefined}
                />
              )}
            />
          </Field>

          <Field
            label="Ende"
            htmlFor="endMinutes"
            required
            error={errorFor('endMinutes')}
            hint={gridHintFor(end)}
            className="sm:col-span-2"
          >
            <Controller
              control={form.control}
              name="endMinutes"
              render={({ field }) => (
                <TimeInput
                  id="endMinutes"
                  value={String(field.value ?? '')}
                  onChange={field.onChange}
                  onBlur={field.onBlur}
                  invalid={errorFor('endMinutes') !== undefined}
                />
              )}
            />
          </Field>

          <Field
            label="Pause"
            htmlFor="breakMinutes"
            error={errorFor('breakMinutes')}
            className="sm:col-span-1"
          >
            <Select
              id="breakMinutes"
              invalid={errorFor('breakMinutes') !== undefined}
              {...form.register('breakMinutes')}
            >
              {BREAK_OPTIONS.map((minutes) => (
                <option key={minutes} value={minutes}>
                  {minutes === 0 ? '—' : formatDuration(minutes)}
                </option>
              ))}
            </Select>
          </Field>

          <Field
            label="Tätigkeit"
            htmlFor="description"
            hint="Erscheint im Zeitnachweis neben der Zeit."
            error={errorFor('description')}
            className="sm:col-span-12"
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
            {isEditing ? 'Änderung speichern' : 'Zeit eintragen'}
          </Button>
          {isEditing && (
            <Button variant="secondary" onClick={onCancelEdit}>
              Abbrechen
            </Button>
          )}

          {/* Die Dauer steht rechts und in groß: Sie ist die Zahl, die am
              Ende abgerechnet wird, und der schnellste Weg, einen
              Zahlendreher zu bemerken. */}
          <span aria-live="polite" className="ml-auto text-sm">
            {duration === null ? (
              <span className="text-slate-400">Dauer ergibt sich aus Beginn und Ende</span>
            ) : (
              <>
                <span className="text-slate-500">Dauer</span>{' '}
                <span className="text-base font-semibold tabular-nums text-slate-900">
                  {formatDuration(duration)} h
                </span>
              </>
            )}
          </span>
        </div>
      </form>
    </Card>
  );
}
