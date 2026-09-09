import { z } from 'zod';
import { yearOf, type IsoDate } from './date.js';

/**
 * Rechnungsnummern (Abschnitt 9).
 *
 * Die Nummer entsteht aus zwei Teilen: dem Zählerstand aus
 * `NumberSequence` und einem Muster, das ihn zusammen mit dem Datum in eine
 * Zeichenkette bringt. Hier steht nur der zweite Teil — reine Funktionen,
 * kein Datenbankzugriff. Das Ziehen der Nummer ist eine
 * Transaktionsangelegenheit und liegt im Backend.
 *
 * Warum überhaupt ein Muster: Wer von einer anderen Software kommt, hat
 * eine laufende Nummernkreisform, die er nicht ändern will oder darf. Ein
 * fest verdrahtetes Format wäre der Grund, die Anwendung nicht zu benutzen.
 */

/** `2026-001` — Jahr aus dem Rechnungsdatum, dreistellig aufgefüllt. */
export const DEFAULT_NUMBER_PATTERN = '{YYYY}-{SEQ:3}';

/** Schlüssel, unter dem das Muster in `AppSetting` liegt. */
export const NUMBER_PATTERN_SETTING_KEY = 'invoice.numberPattern';

const PLACEHOLDER = /\{(YYYY|YY|MM|SEQ(?::(\d))?)\}/gu;

/**
 * Muss ein `{SEQ}` enthalten — ohne den Zähler wäre die zweite Rechnung
 * eines Jahres nicht mehr eindeutig, und das fiele erst beim Speichern auf,
 * mit einer bereits gezogenen Nummer.
 */
export const numberPatternSchema = z
  .string()
  .trim()
  .min(1, 'Das Muster darf nicht leer sein.')
  .refine((value) => /\{SEQ(?::\d)?\}/u.test(value), {
    message: 'Das Muster braucht einen Platzhalter {SEQ} für die laufende Nummer.',
  })
  .refine((value) => !/[\\/:*?"<>|]/u.test(value.replace(PLACEHOLDER, '')), {
    message: 'Das Muster darf keine Zeichen enthalten, die in Dateinamen unzulässig sind.',
  });

export interface InvoiceNumberParts {
  /** Jahr des Nummernkreises — aus dem Rechnungsdatum, nicht aus heute. */
  year: number;
  /** Monat 1–12, nur für Muster mit `{MM}`. */
  month: number;
  /** Laufende Nummer innerhalb des Jahres, beginnend bei 1. */
  seq: number;
}

/**
 * Setzt die Nummer aus Muster und Zählerstand zusammen.
 *
 * Unterstützt `{YYYY}`, `{YY}`, `{MM}` und `{SEQ}` bzw. `{SEQ:n}` mit n
 * Stellen. Alles andere im Muster bleibt, wie es ist — so sind Präfixe wie
 * `RE-{YYYY}-{SEQ:4}` ohne Sonderbehandlung möglich.
 */
export function formatInvoiceNumber(pattern: string, parts: InvoiceNumberParts): string {
  return pattern.replace(PLACEHOLDER, (match, token: string, digits: string | undefined) => {
    if (token === 'YYYY') return String(parts.year).padStart(4, '0');
    if (token === 'YY') return String(parts.year % 100).padStart(2, '0');
    if (token === 'MM') return String(parts.month).padStart(2, '0');
    if (token.startsWith('SEQ')) {
      return String(parts.seq).padStart(digits === undefined ? 1 : Number(digits), '0');
    }
    return match;
  });
}

/**
 * Der Nummernkreis einer Rechnung: Jahr und Monat des **Rechnungsdatums**.
 *
 * Nicht `now()`: Wer am 3. Januar eine Rechnung mit Datum 31. Dezember
 * finalisiert, gehört in den Kreis des alten Jahres. Andernfalls entstünde
 * eine Rechnung mit Datum 2026 und Nummer 2027-001 — im Zweifel bei einer
 * Prüfung genau die Zeile, nach der gefragt wird.
 */
export function numberScopeOf(invoiceDate: IsoDate): { year: number; month: number } {
  return { year: yearOf(invoiceDate), month: Number(invoiceDate.slice(5, 7)) };
}
