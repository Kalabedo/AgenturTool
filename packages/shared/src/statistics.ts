import { z } from 'zod';
import { isoDateSchema, type IsoDate } from './date.js';

/**
 * Die kleine Auswertung (Abschnitt 30).
 *
 * Bewusst wenige Zahlen: Umsatz, offene Posten, Stunden. Ein Dashboard, das
 * alles zeigt, beantwortet am Ende keine Frage — und eine Solo-Agentur
 * braucht keine Business Intelligence, sondern die drei Zahlen, nach denen
 * der Steuerberater fragt.
 *
 * **Grundlage ist das Rechnungsdatum** (Soll-Versteuerung), wie beim
 * Steuerberater-Export. Wer nach vereinnahmten Entgelten versteuert (§ 20
 * UStG), liest die Zahlen mit leichtem Vorlauf; die Seite sagt das dazu,
 * statt eine Genauigkeit zu behaupten, die sie nicht hat.
 *
 * Gezählt werden nur **ausgestellte** Belege. Ein Entwurf ist kein Umsatz,
 * und ein Storno trägt negative Beträge und zieht sich damit selbst ab.
 */

export const statisticsQuerySchema = z
  .object({
    from: isoDateSchema,
    to: isoDateSchema,
  })
  .superRefine((value, ctx) => {
    if (value.to < value.from) {
      ctx.addIssue({
        code: z.ZodIssueCode.custom,
        path: ['to'],
        message: 'Das Enddatum darf nicht vor dem Anfangsdatum liegen',
      });
    }
  });
export type StatisticsQuery = z.output<typeof statisticsQuerySchema>;

/** Umsatz eines Abschnitts — Monat, Quartal oder Jahr. */
export interface RevenueBucket {
  /** `2026-03`, `2026-Q1` oder `2026`. */
  key: string;
  label: string;
  netCents: number;
  grossCents: number;
  /** Anzahl der Belege, Stornos eingeschlossen. */
  count: number;
}

export interface CustomerRevenue {
  customerId: number | null;
  /** Der eingefrorene Name des Belegs, nicht der heutige Stammdatensatz. */
  customerName: string;
  netCents: number;
  count: number;
}

/**
 * Offene Posten.
 *
 * „Überfällig" ist hier dasselbe wie in der Rechnungsliste und auf dem
 * Dashboard: ausgestellt, Fälligkeit vorbei, nicht bezahlt. Zwei
 * Definitionen desselben Wortes wären ein Fehler, den niemand bemerkt, bis
 * die Zahlen auseinanderlaufen.
 */
export interface OpenItems {
  openNetCents: number;
  openGrossCents: number;
  openCount: number;
  overdueNetCents: number;
  overdueGrossCents: number;
  overdueCount: number;
}

/**
 * Stunden aus der Zeiterfassung.
 *
 * Der **Wert** offener Stunden ist eine Schätzung und heißt hier auch so:
 * Ein Zeiteintrag trägt keinen Stundensatz — der entsteht erst auf der
 * Rechnung. Ohne hinterlegten Standardsatz bleibt `openEstimatedCents`
 * deshalb `null`, und das ist etwas anderes als 0 €.
 */
export interface HoursSummary {
  billedMinutes: number;
  openMinutes: number;
  /** Geschätzter Wert der offenen Stunden zum heutigen Satz, oder null. */
  openEstimatedCents: number | null;
  /** Der Satz, mit dem geschätzt wurde — für die Fußnote. */
  hourlyRateCents: number | null;
}

export interface StatisticsResponse {
  period: { from: IsoDate; to: IsoDate };
  /** Netto und brutto über den ganzen Zeitraum. */
  totalNetCents: number;
  totalGrossCents: number;
  totalCount: number;
  byMonth: RevenueBucket[];
  byQuarter: RevenueBucket[];
  byYear: RevenueBucket[];
  byCustomer: CustomerRevenue[];
  openItems: OpenItems;
  hours: HoursSummary;
}

const MONTH_LABELS = [
  'Januar',
  'Februar',
  'März',
  'April',
  'Mai',
  'Juni',
  'Juli',
  'August',
  'September',
  'Oktober',
  'November',
  'Dezember',
];

/** `2026-03` → `März 2026`. */
export function monthLabel(key: string): string {
  const month = Number(key.slice(5, 7));
  return `${MONTH_LABELS[month - 1] ?? key} ${key.slice(0, 4)}`;
}

/** Das Quartal eines Kalenderdatums: `2026-05-01` → `2026-Q2`. */
export function quarterKeyOf(isoDate: string): string {
  const month = Number(isoDate.slice(5, 7));
  return `${isoDate.slice(0, 4)}-Q${String(Math.ceil(month / 3))}`;
}

/** `2026-Q2` → `2. Quartal 2026`. */
export function quarterLabel(key: string): string {
  return `${key.slice(6)}. Quartal ${key.slice(0, 4)}`;
}

/**
 * Sinnvolle Zeiträume für die Auswahl.
 *
 * Kein freier Kalender als erster Eindruck: In neun von zehn Fällen will man
 * das laufende Jahr, und die Auswahl soll das vorwegnehmen.
 */
export function defaultPeriods(today: IsoDate): { label: string; from: IsoDate; to: IsoDate }[] {
  const year = Number(today.slice(0, 4));
  const quarter = Math.ceil(Number(today.slice(5, 7)) / 3);
  const quarterStartMonth = (quarter - 1) * 3 + 1;
  const quarterEndMonth = quarterStartMonth + 2;
  const pad = (value: number): string => String(value).padStart(2, '0');
  const lastDay = new Date(Date.UTC(year, quarterEndMonth, 0)).getUTCDate();

  return [
    {
      label: 'Laufendes Jahr',
      from: `${String(year)}-01-01` as IsoDate,
      to: `${String(year)}-12-31` as IsoDate,
    },
    {
      label: 'Laufendes Quartal',
      from: `${String(year)}-${pad(quarterStartMonth)}-01` as IsoDate,
      to: `${String(year)}-${pad(quarterEndMonth)}-${pad(lastDay)}` as IsoDate,
    },
    {
      label: 'Vorjahr',
      from: `${String(year - 1)}-01-01` as IsoDate,
      to: `${String(year - 1)}-12-31` as IsoDate,
    },
  ];
}
