import { describe, expect, it } from 'vitest';
import {
  DEFAULT_NUMBER_PATTERN,
  formatInvoiceNumber,
  numberPatternSchema,
  numberScopeOf,
  toIsoDate,
} from '../src/index.js';

describe('formatInvoiceNumber', () => {
  it('erzeugt die Standardform 2026-001', () => {
    expect(formatInvoiceNumber(DEFAULT_NUMBER_PATTERN, { year: 2026, month: 3, seq: 1 })).toBe(
      '2026-001',
    );
  });

  it('füllt den Zähler auf die geforderte Stellenzahl auf', () => {
    expect(formatInvoiceNumber('RE-{YYYY}-{SEQ:4}', { year: 2026, month: 3, seq: 42 })).toBe(
      'RE-2026-0042',
    );
  });

  it('lässt einen zu großen Zähler stehen, statt ihn abzuschneiden', () => {
    // Die tausendste Rechnung eines Jahres bekommt vier Stellen. Eine
    // abgeschnittene Nummer wäre nicht mehr eindeutig — der Unique-Index
    // schlüge zu, und zwar mitten im Finalisieren.
    expect(formatInvoiceNumber('{YYYY}-{SEQ:3}', { year: 2026, month: 1, seq: 1000 })).toBe(
      '2026-1000',
    );
  });

  it('kennt Jahr zweistellig und Monat', () => {
    expect(formatInvoiceNumber('{YY}{MM}-{SEQ:2}', { year: 2026, month: 7, seq: 5 })).toBe(
      '2607-05',
    );
  });

  it('lässt unbekannte Zeichen unangetastet', () => {
    expect(formatInvoiceNumber('A_{SEQ}/B', { year: 2026, month: 1, seq: 9 })).toBe('A_9/B');
  });
});

describe('numberPatternSchema', () => {
  it('nimmt das Standardmuster an', () => {
    expect(numberPatternSchema.parse(DEFAULT_NUMBER_PATTERN)).toBe(DEFAULT_NUMBER_PATTERN);
  });

  it('lehnt ein Muster ohne Zähler ab', () => {
    expect(numberPatternSchema.safeParse('{YYYY}').success).toBe(false);
  });

  it('lehnt Zeichen ab, die keinen Dateinamen ergeben', () => {
    // Die Nummer wird zum Dateinamen des PDFs (Abschnitt 13).
    expect(numberPatternSchema.safeParse('{YYYY}/{SEQ:3}').success).toBe(false);
  });
});

describe('numberScopeOf', () => {
  it('nimmt Jahr und Monat aus dem Rechnungsdatum', () => {
    expect(numberScopeOf(toIsoDate('2026-12-31'))).toEqual({ year: 2026, month: 12 });
  });

  it('bleibt beim alten Jahr, wenn im neuen finalisiert wird', () => {
    // Der Fall aus Abschnitt 9: Datum 31.12., Klick am 3. Januar.
    expect(numberScopeOf(toIsoDate('2026-12-31')).year).toBe(2026);
  });
});
