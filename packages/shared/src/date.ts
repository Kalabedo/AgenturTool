import { z } from 'zod';

/**
 * Kalenderdaten (Rechnungs-, Leistungs-, Fälligkeitsdatum, Zahldatum) werden
 * als ISO-String "YYYY-MM-DD" gespeichert, nicht als Date/DateTime (D21).
 *
 * Grund: Ein Rechnungsdatum ist ein Kalendertag, kein Zeitpunkt. Als Date
 * müsste an jeder Grenze zwischen Browser, API und Datenbank auf
 * UTC-Mitternacht normalisiert werden; ein einziges `new Date(...)` in
 * lokaler Zeitzone macht aus dem 31.12. den 30.12. — und zwar genau bei
 * Rechnungen zum Jahreswechsel, wo es am teuersten ist. Als String kann das
 * strukturell nicht passieren.
 *
 * Echte Zeitstempel (createdAt, issuedAt, sentAt, cancelledAt) bleiben Date.
 */

/**
 * Ein validierter Kalendertag im Format "YYYY-MM-DD".
 *
 * Die Markierung verhindert, dass ein beliebiger String als geprüftes Datum
 * durchgereicht wird. Bewusst eine benannte Eigenschaft statt eines
 * `unique symbol`: Ein nicht exportiertes Symbol lässt sich in den erzeugten
 * Deklarationsdateien nicht benennen, und tsup bricht dann ab.
 */
export type IsoDate = string & { readonly __brand: 'IsoDate' };

const ISO_DATE_PATTERN = /^\d{4}-\d{2}-\d{2}$/;

/**
 * Prüft Format **und** Kalenderplausibilität.
 *
 * Die Formatprüfung allein reicht nicht: "2026-02-31" und "2026-13-01"
 * erfüllen das Muster, existieren aber nicht. Deshalb wird das Datum
 * zusätzlich in UTC gebaut und zurückverglichen — ein Rollover auf den
 * 3. März fällt so auf.
 */
export function isValidIsoDate(value: string): value is IsoDate {
  if (!ISO_DATE_PATTERN.test(value)) return false;

  const year = Number(value.slice(0, 4));
  const month = Number(value.slice(5, 7));
  const day = Number(value.slice(8, 10));

  if (month < 1 || month > 12 || day < 1 || day > 31) return false;

  const date = new Date(Date.UTC(year, month - 1, day));
  return (
    date.getUTCFullYear() === year && date.getUTCMonth() === month - 1 && date.getUTCDate() === day
  );
}

export const isoDateSchema = z
  .string()
  .refine(isValidIsoDate, {
    message: 'Erwartet wird ein gültiges Kalenderdatum im Format YYYY-MM-DD',
  })
  .transform((value) => value as IsoDate);

/** Wirft, wenn der String kein gültiges Kalenderdatum ist. */
export function toIsoDate(value: string): IsoDate {
  if (!isValidIsoDate(value)) {
    throw new RangeError(`Ungültiges Kalenderdatum: ${value}`);
  }
  return value;
}

/** Heutiges Datum in lokaler Zeitzone — der Tag, den der Benutzer auf seiner Uhr sieht. */
export function todayIso(now: Date = new Date()): IsoDate {
  const year = String(now.getFullYear()).padStart(4, '0');
  const month = String(now.getMonth() + 1).padStart(2, '0');
  const day = String(now.getDate()).padStart(2, '0');
  return `${year}-${month}-${day}` as IsoDate;
}

/** Addiert Tage; rechnet in UTC, damit keine Sommerzeit-Sprünge entstehen. */
export function addDays(date: IsoDate, days: number): IsoDate {
  const base = new Date(`${date}T00:00:00.000Z`);
  base.setUTCDate(base.getUTCDate() + days);
  return base.toISOString().slice(0, 10) as IsoDate;
}

/** Das Jahr eines Kalenderdatums — Grundlage der Nummernsequenz (Abschnitt 9). */
export function yearOf(date: IsoDate): number {
  return Number(date.slice(0, 4));
}

/** Lexikografischer Vergleich; bei ISO-Daten identisch mit chronologischem. */
export function compareIsoDates(a: IsoDate, b: IsoDate): number {
  return a < b ? -1 : a > b ? 1 : 0;
}

export function isBefore(a: IsoDate, b: IsoDate): boolean {
  return a < b;
}

/** Deutsche Darstellung: "2026-12-31" -> "31.12.2026" */
export function formatDateDe(date: IsoDate): string {
  return `${date.slice(8, 10)}.${date.slice(5, 7)}.${date.slice(0, 4)}`;
}
