import { z } from 'zod';
import { isoDateSchema, type IsoDate } from './date.js';

/**
 * Verträge der Zeiterfassung.
 *
 * Eine erfasste Zeit ist ein Tag, ein Kunde und eine Spanne innerhalb dieses
 * Tages — bewusst kein Zeitstempel: Wer nachträgt, was er am Dienstag
 * gemacht hat, denkt in „9:00 bis 12:30", nicht in UTC. Der Tag ist deshalb
 * ein Kalenderdatum nach D21, die Uhrzeiten sind Minuten seit Mitternacht.
 *
 * ## Das Viertelstundenraster
 *
 * Abgerechnet wird in Viertelstunden, also wird auch nur in Viertelstunden
 * erfasst: 12:13 ist keine Eingabe, sondern ein Tippfehler mit Nachkommastellen.
 * Der Server rundet jede Eingabe **ab** — aus „12:13 bis 14:02" wird
 * „12:00 bis 14:00". Abrunden statt kaufmännisch runden, weil die
 * abgerechnete Zeit im Zweifel unter der geleisteten liegen soll: Eine
 * Rechnung, die mehr ausweist als im Kalender steht, muss man erklären.
 *
 * Das Runden gehört hierher und nicht in die Oberfläche. Ein `<input
 * type="time" step="900">` ist ein Vorschlag, keine Zusage — getippte Werte
 * kommen trotzdem an, und über die API sowieso.
 */

/** Länge eines Rasterschritts in Minuten. */
export const TIME_GRID_MINUTES = 15;

/** Genug für eine aussagekräftige Tätigkeit, begrenzt für Listen und PDFs. */
export const TIME_ENTRY_DESCRIPTION_MAX_LENGTH = 500;

/** Minuten eines Tages; 24:00 ist als Ende erlaubt, als Beginn nicht. */
export const MINUTES_PER_DAY = 24 * 60;

const TIME_OF_DAY_PATTERN = /^(\d{1,2}):(\d{2})$/u;

/**
 * Rundet auf das Viertelstundenraster ab.
 *
 * `Math.floor` und nicht `Math.round`: siehe oben — im Zweifel zugunsten
 * dessen, der die Rechnung bekommt.
 */
export function snapToGrid(minutes: number): number {
  return Math.floor(minutes / TIME_GRID_MINUTES) * TIME_GRID_MINUTES;
}

export function isOnGrid(minutes: number): boolean {
  return Number.isInteger(minutes) && minutes % TIME_GRID_MINUTES === 0;
}

/** „09:30" → 570. Liefert null, wenn der Wert keine Uhrzeit ist. */
export function parseTimeOfDay(value: string): number | null {
  const match = TIME_OF_DAY_PATTERN.exec(value.trim());
  if (match === null) return null;

  const hours = Number(match[1]);
  const minutes = Number(match[2]);
  if (hours > 24 || minutes > 59) return null;
  if (hours === 24 && minutes !== 0) return null;

  return hours * 60 + minutes;
}

/**
 * Eine getippte Uhrzeit, so nachsichtig wie möglich gelesen.
 *
 * Wer eine Woche nachträgt, tippt nicht „09:00" — er tippt „9". Diese
 * Funktion nimmt, was beim schnellen Schreiben entsteht, und macht Minuten
 * daraus:
 *
 * - `9`, `9.`, `9h`      → 09:00
 * - `930`, `9:30`, `9.30` → 09:30
 * - `1415`, `14:15`      → 14:15
 * - `24`, `24:00`        → 24:00 (nur als Ende zulässig, siehe Schema)
 *
 * Bewusst **kein** Runden hier: Diese Funktion liest, sie korrigiert nicht.
 * Das Abrunden aufs Viertelstundenraster bleibt an einer Stelle —
 * `snapToGrid` im Schema —, damit die Oberfläche dieselbe Zahl anzeigt, die
 * der Server später speichert.
 *
 * Liefert null bei allem, was sich nicht eindeutig als Uhrzeit lesen lässt.
 * Stilles Raten wäre hier schlimmer als eine rote Umrandung: Aus „12345"
 * eine Uhrzeit zu erfinden hieße, eine falsche Zeit abzurechnen.
 */
export function parseTimeInput(value: string): number | null {
  const trimmed = value.trim().replace(/\s*(?:uhr|h)$/iu, '');
  if (trimmed === '') return null;

  // Mit Trenner: Punkt und Komma sind auf dem Zehnerblock schneller als der
  // Doppelpunkt, meinen aber dasselbe.
  const separated = /^(\d{1,2})[.:,](\d{1,2})$/u.exec(trimmed);
  if (separated !== null) {
    return toMinutesOfDay(Number(separated[1]), Number(separated[2]).toString().padStart(2, '0'));
  }

  // Ohne Trenner: Die Ziffernzahl entscheidet, wo die Stunde endet.
  const digits = /^(\d{1,4})[.]?$/u.exec(trimmed);
  if (digits === null) return null;

  const raw = digits[1] as string;
  if (raw.length <= 2) return toMinutesOfDay(Number(raw), '00');
  // „930" ist 9:30, „1415" ist 14:15 — die letzten beiden Ziffern sind immer
  // die Minuten.
  return toMinutesOfDay(Number(raw.slice(0, raw.length - 2)), raw.slice(raw.length - 2));
}

function toMinutesOfDay(hours: number, minutes: string): number | null {
  const parsedMinutes = Number(minutes);
  if (!Number.isInteger(hours) || hours > 24 || parsedMinutes > 59) return null;
  if (hours === 24 && parsedMinutes !== 0) return null;
  return hours * 60 + parsedMinutes;
}

/** 570 → „09:30". Zweistellig, damit Uhrzeiten in Listen untereinander fluchten. */
export function formatTimeOfDay(minutes: number): string {
  const hours = Math.floor(minutes / 60);
  return `${String(hours).padStart(2, '0')}:${String(minutes % 60).padStart(2, '0')}`;
}

/** Dauer als „2:15" — die Form, in der man Arbeitszeit liest. */
export function formatDuration(minutes: number): string {
  const sign = minutes < 0 ? '-' : '';
  const absolute = Math.abs(minutes);
  return `${sign}${Math.floor(absolute / 60)}:${String(absolute % 60).padStart(2, '0')}`;
}

/** Dezimalstunden, wie sie in eine Rechnungsposition wandern: 135 → 2,25. */
export function toDecimalHours(minutes: number): number {
  return minutes / 60;
}

/** Dezimalstunden in deutscher Schreibweise: 135 → „2,25". */
export function formatDecimalHours(minutes: number): string {
  return toDecimalHours(minutes).toFixed(2).replace('.', ',');
}

/**
 * Alle Uhrzeiten des Rasters.
 *
 * Für die Auswahl in der Oberfläche: 96 Schritte von 00:00 bis 23:45, auf
 * Wunsch mit 24:00 am Ende — ein Arbeitstag, der um Mitternacht endet, ist
 * selten, aber kein Fehler.
 */
export function gridTimes(includeEndOfDay = false): string[] {
  const times: string[] = [];
  for (let minutes = 0; minutes < MINUTES_PER_DAY; minutes += TIME_GRID_MINUTES) {
    times.push(formatTimeOfDay(minutes));
  }
  if (includeEndOfDay) times.push('24:00');
  return times;
}

/**
 * Eine Uhrzeit aus dem Formular: geprüft, aufs Raster abgerundet, als Minuten.
 *
 * Nimmt auch eine Zahl entgegen, damit ein API-Aufruf die Minuten direkt
 * schicken kann, ohne den Umweg über einen String.
 */
const timeOfDaySchema = z.union([z.string(), z.number()]).transform((value, ctx) => {
  // `parseTimeInput` und nicht `parseTimeOfDay`: Das Formular schickt, was
  // getippt wurde. „930" ist eine Uhrzeit, kein Fehler — und die Regel, was
  // als Uhrzeit gilt, soll für Formular und API dieselbe sein.
  const minutes = typeof value === 'number' ? value : parseTimeInput(value);

  if (minutes === null || !Number.isFinite(minutes)) {
    ctx.addIssue({
      code: z.ZodIssueCode.custom,
      message: 'Erwartet wird eine Uhrzeit, z. B. 09:30',
    });
    return z.NEVER;
  }
  if (minutes < 0 || minutes > MINUTES_PER_DAY) {
    ctx.addIssue({ code: z.ZodIssueCode.custom, message: 'Die Uhrzeit liegt außerhalb des Tages' });
    return z.NEVER;
  }

  return snapToGrid(minutes);
});

/** Pausenlänge in Minuten; ebenfalls auf Viertelstunden abgerundet. */
const breakMinutesSchema = z
  .union([z.string().trim(), z.number(), z.null(), z.undefined()])
  .transform((value, ctx) => {
    if (value === null || value === undefined || value === '') return 0;

    const parsed = typeof value === 'number' ? value : Number(value);
    if (!Number.isFinite(parsed) || parsed < 0 || parsed >= MINUTES_PER_DAY) {
      ctx.addIssue({
        code: z.ZodIssueCode.custom,
        message: 'Die Pause muss eine Minutenzahl innerhalb eines Tages sein',
      });
      return z.NEVER;
    }

    return snapToGrid(parsed);
  });

const optionalText = z
  .string()
  .trim()
  .max(
    TIME_ENTRY_DESCRIPTION_MAX_LENGTH,
    `Die Tätigkeit darf höchstens ${TIME_ENTRY_DESCRIPTION_MAX_LENGTH} Zeichen lang sein`,
  )
  .transform((value) => (value === '' ? null : value))
  .nullable()
  .optional()
  .transform((value) => value ?? null);

export const timeEntryInputSchema = z
  .object({
    /** Der Tag, an dem gearbeitet wurde. */
    date: isoDateSchema,

    /**
     * Der Kunde, für den gearbeitet wurde.
     *
     * Pflicht, anders als bei fast allem sonst: Eine Stunde ohne Kunden
     * taucht in keiner Auswertung auf und ließe sich nie abrechnen — sie
     * wäre nur ein Datensatz, der Arbeit vortäuscht.
     */
    customerId: z.union([z.string().trim(), z.number()]).transform((value, ctx) => {
      const parsed = typeof value === 'number' ? value : Number(value);
      if (!Number.isInteger(parsed) || parsed < 1) {
        ctx.addIssue({ code: z.ZodIssueCode.custom, message: 'Bitte einen Kunden auswählen' });
        return z.NEVER;
      }
      return parsed;
    }),

    startMinutes: timeOfDaySchema,
    endMinutes: timeOfDaySchema,
    /** Unbezahlte Unterbrechung; wird von der Spanne abgezogen. */
    breakMinutes: breakMinutesSchema,

    /** Was gemacht wurde. Steht später im PDF neben der Zeit. */
    description: optionalText,
  })
  .superRefine((value, ctx) => {
    if (value.endMinutes <= value.startMinutes) {
      ctx.addIssue({
        code: z.ZodIssueCode.custom,
        path: ['endMinutes'],
        message: 'Das Ende muss nach dem Beginn liegen',
      });
      return;
    }

    if (value.breakMinutes >= value.endMinutes - value.startMinutes) {
      ctx.addIssue({
        code: z.ZodIssueCode.custom,
        path: ['breakMinutes'],
        message: 'Die Pause ist länger als die erfasste Zeit',
      });
    }
  });
export type TimeEntryInput = z.input<typeof timeEntryInputSchema>;
export type TimeEntryPayload = z.output<typeof timeEntryInputSchema>;

export const timeEntryResponseSchema = z.object({
  id: z.number().int(),
  date: z.string(),
  customerId: z.number().int(),
  /** Für Listen mitgeliefert; sonst müsste die Oberfläche jede Zeile nachschlagen. */
  customerName: z.string(),
  startMinutes: z.number().int(),
  endMinutes: z.number().int(),
  breakMinutes: z.number().int(),
  /** Ende minus Beginn minus Pause — vom Server gerechnet, nicht geschätzt. */
  durationMinutes: z.number().int(),
  description: z.string().nullable(),
  /**
   * Wann dieser Eintrag abgerechnet wurde; null, solange er offen ist.
   *
   * Das Feld ist der ganze Unterschied zwischen „steht noch in meiner Liste"
   * und „ist beim Kunden": Die Zeiterfassung zeigt im Normalbetrieb die
   * offenen Einträge, und „Abrechnen" setzt diesen Zeitstempel, statt zu
   * löschen. Erhalten bleibt damit alles — der Zeitnachweis lässt sich
   * jederzeit neu erzeugen (D-Zeit-2).
   */
  billedAt: z.string().nullable(),
  createdAt: z.string(),
  updatedAt: z.string(),
});
export type TimeEntryResponse = z.infer<typeof timeEntryResponseSchema>;

/**
 * Welche Einträge eine Liste zeigt.
 *
 * `OPEN` ist der Normalbetrieb: der Posteingang, der sich beim Erfassen
 * füllt und beim Abrechnen leert. `BILLED` ist der Blick zurück, `ALL` gibt
 * es für Auswertungen über beides.
 */
export const TIME_ENTRY_BILLING_FILTER = {
  OPEN: 'open',
  BILLED: 'billed',
  ALL: 'all',
} as const;
export type TimeEntryBillingFilter =
  (typeof TIME_ENTRY_BILLING_FILTER)[keyof typeof TIME_ENTRY_BILLING_FILTER];

/**
 * Zeitraum und Filter — für die Liste wie für das PDF dieselbe Form.
 *
 * `from` und `to` sind beide einschließlich: „01.09. bis 30.09." meint den
 * ganzen September, und ein Monatsende, das nicht mitzählt, wäre genau die
 * Art Fehler, die erst beim Abgleich mit der Rechnung auffällt.
 */
const optionalIsoDate = z
  .union([isoDateSchema, z.literal(''), z.null()])
  .optional()
  .transform((value) => (value === undefined || value === null || value === '' ? null : value));

const optionalCustomerId = z
  .union([z.string().trim(), z.number(), z.null()])
  .optional()
  .transform((value, ctx) => {
    if (value === undefined || value === null || value === '') return null;
    const parsed = typeof value === 'number' ? value : Number(value);
    if (!Number.isInteger(parsed) || parsed < 1) {
      ctx.addIssue({ code: z.ZodIssueCode.custom, message: 'Ungültige Kundenauswahl' });
      return z.NEVER;
    }
    return parsed;
  });

export const timeEntryRangeSchema = z
  .object({
    /**
     * Der Zeitraum ist optional.
     *
     * Die Zeiterfassung fragt im Normalbetrieb ohne Datum an — sie will
     * alles Offene sehen, auch den Eintrag vom August, der im September
     * noch nicht abgerechnet ist. Ein Zeitraum als Pflichtangabe würde
     * genau diese Arbeit verstecken, und Verstecktes wird nicht bezahlt.
     */
    from: optionalIsoDate,
    to: optionalIsoDate,
    customerId: optionalCustomerId,
    /** Ohne Angabe: alles. Die Oberfläche fragt gezielt nach `open`. */
    billing: z
      .union([
        z.literal(TIME_ENTRY_BILLING_FILTER.OPEN),
        z.literal(TIME_ENTRY_BILLING_FILTER.BILLED),
        z.literal(TIME_ENTRY_BILLING_FILTER.ALL),
        z.literal(''),
        z.null(),
      ])
      .optional()
      .transform((value): TimeEntryBillingFilter =>
        value === undefined || value === null || value === ''
          ? TIME_ENTRY_BILLING_FILTER.ALL
          : value,
      ),
  })
  .superRefine((value, ctx) => {
    if (value.from !== null && value.to !== null && value.to < value.from) {
      ctx.addIssue({
        code: z.ZodIssueCode.custom,
        path: ['to'],
        message: 'Das Ende des Zeitraums liegt vor seinem Beginn',
      });
    }
  });
export type TimeEntryRangeQuery = z.output<typeof timeEntryRangeSchema>;

/**
 * Die Einträge, die eine Abrechnung erfasst.
 *
 * Immer genau ein Kunde: Ein Zeitnachweis geht an diesen einen Kunden, und
 * ein Dokument mit fremden Kunden darin könnte man niemandem schicken
 * (D-Zeit-1). Der Zeitraum steht bewusst nicht darin — er ergibt sich aus
 * den offenen Einträgen selbst.
 */
export const timeEntryBillingSchema = z.object({
  customerId: z.union([z.string().trim(), z.number()]).transform((value, ctx) => {
    const parsed = typeof value === 'number' ? value : Number(value);
    if (!Number.isInteger(parsed) || parsed < 1) {
      ctx.addIssue({ code: z.ZodIssueCode.custom, message: 'Bitte einen Kunden auswählen' });
      return z.NEVER;
    }
    return parsed;
  }),
});
export type TimeEntryBillingPayload = z.output<typeof timeEntryBillingSchema>;

/** Die Ids einer Abrechnung — genug, um sie zurückzunehmen. */
export const timeEntryUnbillSchema = z.object({
  ids: z.array(z.number().int().positive()).min(1, 'Es wurde kein Eintrag angegeben'),
});
export type TimeEntryUnbillPayload = z.output<typeof timeEntryUnbillSchema>;

/** Summe je Kunde — die Zeile, die im PDF unter dem jeweiligen Block steht. */
export interface TimeEntryCustomerSummary {
  customerId: number;
  customerName: string;
  entryCount: number;
  durationMinutes: number;
}

export interface TimeEntrySummary {
  entryCount: number;
  durationMinutes: number;
  byCustomer: TimeEntryCustomerSummary[];
}

/**
 * Ein Kunde mit offenen Zeiten — eine Zeile der Reiterleiste.
 *
 * Trägt Zeitraum und Summe mit, weil das die Angaben sind, die vor dem
 * Abrechnen zählen: Der Reiter zeigt, wie viel offen ist, und der Nachweis
 * bekommt daraus seinen Zeitraum, ohne dass ihn jemand eintippen muss.
 */
export interface TimeEntryOpenSummary {
  customerId: number;
  customerName: string;
  entryCount: number;
  durationMinutes: number;
  /** Frühester und spätester offener Tag; der abgeleitete Zeitraum des PDFs. */
  from: string;
  to: string;
}

/** Was nach dem Abrechnen zurückkommt: genug, um es rückgängig zu machen. */
export interface TimeEntryBillingResult {
  customerId: number;
  customerName: string;
  entryCount: number;
  durationMinutes: number;
  from: string;
  to: string;
  billedAt: string;
  /** Die abgerechneten Einträge — die Grundlage für „Rückgängig". */
  ids: number[];
}

/**
 * Fasst erfasste Zeiten zusammen.
 *
 * Geteilt zwischen Oberfläche und PDF, damit die Summe unter der Liste und
 * die Summe im Dokument nicht auseinanderlaufen können — sie kommen aus
 * derselben Funktion.
 */
export function summarizeTimeEntries(
  entries: readonly Pick<TimeEntryResponse, 'customerId' | 'customerName' | 'durationMinutes'>[],
): TimeEntrySummary {
  const byCustomer = new Map<number, TimeEntryCustomerSummary>();
  let durationMinutes = 0;

  for (const entry of entries) {
    durationMinutes += entry.durationMinutes;

    const existing = byCustomer.get(entry.customerId);
    if (existing === undefined) {
      byCustomer.set(entry.customerId, {
        customerId: entry.customerId,
        customerName: entry.customerName,
        entryCount: 1,
        durationMinutes: entry.durationMinutes,
      });
    } else {
      existing.entryCount += 1;
      existing.durationMinutes += entry.durationMinutes;
    }
  }

  return {
    entryCount: entries.length,
    durationMinutes,
    byCustomer: [...byCustomer.values()].sort((a, b) =>
      a.customerName.localeCompare(b.customerName, 'de'),
    ),
  };
}

/** Ein Tag der Liste: seine Einträge und was an ihm zusammenkam. */
export interface TimeEntryDayGroup<T> {
  date: string;
  durationMinutes: number;
  entries: T[];
}

/**
 * Gruppiert Einträge nach Tag.
 *
 * Die Liste zeigt einen Kunden über viele Wochen; ohne Tagesköpfe steht das
 * Datum in jeder Zeile wieder da und der Tag als Einheit ist nicht zu
 * sehen. Leere Tage tauchen hier nicht auf — in der Ansicht eines einzelnen
 * Kunden wären die meisten Tage leer, und eine Liste, die zu vier Fünfteln
 * aus Lücken besteht, zeigt nichts.
 *
 * `newestFirst` sortiert die Tage absteigend: Beim Nachtragen soll der
 * eben gespeicherte Eintrag oben stehen, nicht ans Ende einer langen Liste
 * rutschen. Innerhalb eines Tages bleibt es chronologisch — ein Tag liest
 * sich vorwärts.
 */
export function groupTimeEntriesByDay<
  T extends Pick<TimeEntryResponse, 'date' | 'startMinutes' | 'durationMinutes'>,
>(entries: readonly T[], newestFirst = true): TimeEntryDayGroup<T>[] {
  const days = new Map<string, TimeEntryDayGroup<T>>();

  for (const entry of entries) {
    const day = days.get(entry.date);
    if (day === undefined) {
      days.set(entry.date, {
        date: entry.date,
        durationMinutes: entry.durationMinutes,
        entries: [entry],
      });
    } else {
      day.durationMinutes += entry.durationMinutes;
      day.entries.push(entry);
    }
  }

  const groups = [...days.values()].sort((a, b) =>
    newestFirst ? b.date.localeCompare(a.date) : a.date.localeCompare(b.date),
  );
  for (const group of groups) {
    group.entries.sort((a, b) => a.startMinutes - b.startMinutes);
  }
  return groups;
}

/** Erster und letzter Tag eines Monats — die übliche Auswahl im Zeitraumfilter. */
export function monthRange(date: IsoDate): { from: IsoDate; to: IsoDate } {
  const year = Number(date.slice(0, 4));
  const month = Number(date.slice(5, 7));
  const lastDay = new Date(Date.UTC(year, month, 0)).getUTCDate();

  const prefix = `${date.slice(0, 4)}-${date.slice(5, 7)}`;
  return {
    from: `${prefix}-01` as IsoDate,
    to: `${prefix}-${String(lastDay).padStart(2, '0')}` as IsoDate,
  };
}
