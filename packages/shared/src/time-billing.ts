import { formatDateDe, type IsoDate } from './date.js';
import { DISCOUNT_TYPE, type DiscountType } from './enums.js';
import { UNIT_CODE, type UnitCode } from './einvoice/codes.js';
import { multiplyQuantity, roundHalfAwayFromZero } from './money.js';
import { groupTimeEntriesByDay } from './time-entry.js';

/**
 * Aus erfassten Zeiten werden Rechnungspositionen.
 *
 * Das Stück, das zwischen Zeiterfassung und Rechnung gefehlt hat: Bisher
 * markierte „Abrechnen" die Zeiten nur als abgerechnet, und die
 * Rechnungszeile tippte man danach von Hand ab.
 *
 * ## Eine Zeile ist der Normalfall
 *
 * So wird abgerechnet:
 *
 * > Arbeit im Zeitraum 01.02.–28.02.2026 · 40,00 Std · 50,00 € · 2.000,00 €
 *
 * Nicht vierzig Zeilen mit Einzelterminen. Die Aufschlüsselung gehört auf
 * den **Zeitnachweis** — er ist der Beleg, den man bei Rückfragen
 * mitschickt, nicht der Inhalt der Rechnung. Vierzig Termine auf einer
 * Rechnung laden zur Diskussion über einzelne Stunden ein.
 *
 * Die beiden anderen Arten gibt es, weil es Auftraggeber gibt, die es
 * anders verlangen — nicht, weil sie besser wären.
 *
 * ## Warum die Beträge exakt aufgehen
 *
 * Die Zeiterfassung liegt auf dem Viertelstundenraster, und zwar nicht nur
 * laut Formular: Fünf CHECK-Constraints erzwingen es in der Datenbank.
 * Damit ist jede Dauer ein Vielfaches von 15 Minuten, und 15 Minuten sind
 * exakt 250 Tausendstel Stunden. Wie auch gruppiert wird — jede Teilsumme
 * ist ohne Rest darstellbar, und alle drei Arten ergeben auf den Cent
 * dieselbe Summe.
 *
 * Trotzdem wird **erst summiert und dann umgerechnet**, nie umgekehrt. Das
 * ist die Absicherung für den Tag, an dem jemand das Raster lockert.
 */

export const BILLING_MODE = {
  /** Eine Position über alles. Die Vorgabe. */
  SAMMEL: 'SAMMEL',
  /** Eine Position je Tag. */
  PRO_TAG: 'PRO_TAG',
  /** Zusammengefasst nach gleicher Beschreibung. */
  PRO_BESCHREIBUNG: 'PRO_BESCHREIBUNG',
} as const;
export type BillingMode = (typeof BILLING_MODE)[keyof typeof BILLING_MODE];
export const BILLING_MODE_VALUES = Object.values(BILLING_MODE);

export const DEFAULT_BILLING_MODE: BillingMode = BILLING_MODE.SAMMEL;

/** Beschriftungen für die Auswahl in der Oberfläche. */
export const BILLING_MODE_LABELS: Record<BillingMode, string> = {
  [BILLING_MODE.SAMMEL]: 'Eine Sammelzeile',
  [BILLING_MODE.PRO_TAG]: 'Eine Zeile je Tag',
  [BILLING_MODE.PRO_BESCHREIBUNG]: 'Eine Zeile je Beschreibung',
};

export const BILLING_MODE_DESCRIPTIONS: Record<BillingMode, string> = {
  [BILLING_MODE.SAMMEL]:
    'Alle Stunden in einer Position. Der Normalfall — Einzeltermine stehen auf dem Zeitnachweis.',
  [BILLING_MODE.PRO_TAG]: 'Je Arbeitstag eine Position. Für Auftraggeber, die es verlangen.',
  [BILLING_MODE.PRO_BESCHREIBUNG]:
    'Gleiche Beschreibungen werden zusammengefasst. Für die Trennung nach Projekt oder Aufgabe.',
};

/** Was aus einem Zeiteintrag gebraucht wird — nicht mehr. */
export interface TimeEntryForBilling {
  /** Kalendertag „YYYY-MM-DD". */
  date: string;
  startMinutes: number;
  /** Ende minus Beginn minus Pause, wie der Server sie rechnet. */
  durationMinutes: number;
  description: string | null;
}

/**
 * Eine Position, fertig zum Schreiben in den Entwurf.
 *
 * Dieselben Felder wie `invoiceItemInputSchema`, aber schon in den
 * Einheiten der Datenbank — Tausendstel, Cent, Basispunkte.
 */
export interface TimeBillingItem {
  description: string;
  /** Tausendstel Stunden: 7,5 h = 7500 */
  quantity: number;
  /** Das gedruckte Etikett. */
  unit: string;
  /** BT-130 für die E-Rechnung. */
  unitCode: UnitCode;
  unitPriceCents: number;
  discountType: DiscountType;
  discountValue: number;
  taxRateBasisPoints: number;
}

export interface TimeBillingOptions {
  /** Stundensatz in Cent. */
  rateCents: number;
  mode: BillingMode;
  /** Der Satz des gewählten Steuerprofils, in Basispunkten. */
  taxRateBasisPoints: number;
}

/** Das gedruckte Etikett der Stunde. Frei änderbar, sobald die Zeile steht. */
const HOUR_LABEL = 'Std.';

/** Wenn eine Zeit keine Beschreibung trägt. */
const FALLBACK_DESCRIPTION = 'Arbeit';

/**
 * Minuten in Tausendstel Stunden.
 *
 * 15 Minuten → 250. Auf dem Viertelstundenraster ist das Ergebnis immer
 * ganzzahlig; gerundet wird nur für den Fall, dass das Raster einmal nicht
 * gilt — und dann mit **derselben** Regel wie überall sonst im Rechenweg.
 */
function toThousandthHours(minutes: number): number {
  return roundHalfAwayFromZero((minutes * 1000) / 60);
}

function totalMinutes(entries: readonly TimeEntryForBilling[]): number {
  return entries.reduce((sum, entry) => sum + entry.durationMinutes, 0);
}

/** Der abgedeckte Zeitraum, aus den Einträgen selbst. */
function periodOf(entries: readonly TimeEntryForBilling[]): { from: string; to: string } {
  const dates = entries.map((entry) => entry.date).sort((a, b) => a.localeCompare(b));
  return { from: dates[0] ?? '', to: dates[dates.length - 1] ?? '' };
}

/**
 * Beschreibt einen Zeitraum in der Form, in der man ihn liest.
 *
 * Ein einzelner Tag bekommt „am", eine Spanne „im Zeitraum" — und zwei
 * gleiche Daten ergeben nicht „vom 03.02. bis 03.02.".
 */
export function describePeriod(from: string, to: string): string {
  if (from === '') return FALLBACK_DESCRIPTION;
  if (from === to) return `Arbeit am ${formatDateDe(from as IsoDate)}`;
  return `Arbeit im Zeitraum ${formatDateDe(from as IsoDate)}–${formatDateDe(to as IsoDate)}`;
}

function itemFrom(
  description: string,
  minutes: number,
  options: TimeBillingOptions,
): TimeBillingItem {
  return {
    description,
    quantity: toThousandthHours(minutes),
    unit: HOUR_LABEL,
    unitCode: UNIT_CODE.HOUR,
    unitPriceCents: options.rateCents,
    // Ein Nachlass entsteht hier nicht. Wer einen geben will, trägt ihn
    // danach an der Position ein — sie ist ein gewöhnlicher Entwurf.
    discountType: DISCOUNT_TYPE.PERCENT,
    discountValue: 0,
    taxRateBasisPoints: options.taxRateBasisPoints,
  };
}

/**
 * Setzt die Positionen zusammen.
 *
 * Leere Eingabe ergibt eine leere Liste — die Prüfung, ob überhaupt etwas
 * offen ist, gehört an die Stelle, die den Entwurf anlegt, und nicht hierher.
 */
export function timeEntriesToInvoiceItems(
  entries: readonly TimeEntryForBilling[],
  options: TimeBillingOptions,
): TimeBillingItem[] {
  if (entries.length === 0) return [];

  switch (options.mode) {
    case BILLING_MODE.SAMMEL: {
      const { from, to } = periodOf(entries);
      return [itemFrom(describePeriod(from, to), totalMinutes(entries), options)];
    }

    case BILLING_MODE.PRO_TAG: {
      // Aufsteigend: Eine Rechnung liest sich vorwärts, anders als die
      // Erfassungsliste, die den neuesten Eintrag oben zeigt.
      return groupTimeEntriesByDay(entries, false).map((day) => {
        const texts = distinctDescriptions(day.entries);
        const label = `${formatDateDe(day.date as IsoDate)}`;
        return itemFrom(
          texts.length === 0
            ? `${FALLBACK_DESCRIPTION} am ${label}`
            : `${label}: ${texts.join(', ')}`,
          day.durationMinutes,
          options,
        );
      });
    }

    case BILLING_MODE.PRO_BESCHREIBUNG: {
      // Reihenfolge des ersten Auftretens, nicht alphabetisch: So steht
      // oben, womit angefangen wurde.
      const byText = new Map<string, number>();
      for (const entry of entries) {
        const text = normalizeDescription(entry.description);
        byText.set(text, (byText.get(text) ?? 0) + entry.durationMinutes);
      }
      return [...byText.entries()].map(([text, minutes]) => itemFrom(text, minutes, options));
    }
  }
}

function normalizeDescription(description: string | null): string {
  const trimmed = (description ?? '').trim();
  return trimmed === '' ? FALLBACK_DESCRIPTION : trimmed;
}

function distinctDescriptions(entries: readonly TimeEntryForBilling[]): string[] {
  const seen = new Set<string>();
  for (const entry of entries) {
    const trimmed = (entry.description ?? '').trim();
    if (trimmed !== '') seen.add(trimmed);
  }
  return [...seen];
}

/**
 * Was der Knopf anzeigt, bevor er gedrückt wird.
 *
 * „1 Position · 40,00 Std · 2.000,00 €" — wer auf einen Knopf drückt, der
 * eine Rechnung anlegt, soll vorher wissen, was entsteht.
 */
export interface TimeBillingPreview {
  itemCount: number;
  durationMinutes: number;
  netCents: number;
}

export function previewTimeBilling(
  entries: readonly TimeEntryForBilling[],
  options: TimeBillingOptions,
): TimeBillingPreview {
  const items = timeEntriesToInvoiceItems(entries, options);
  return {
    itemCount: items.length,
    durationMinutes: totalMinutes(entries),
    // `multiplyQuantity` und nicht selbst gerechnet: Die Vorschau muss
    // denselben Betrag zeigen, den der Server später schreibt — bis auf den
    // Cent. Eine zweite Rundungsregel wäre genau der Fehler, der erst an
    // einer Rechnung beim Kunden auffällt.
    netCents: items.reduce(
      (sum, item) => sum + multiplyQuantity(item.quantity, item.unitPriceCents),
      0,
    ),
  };
}
