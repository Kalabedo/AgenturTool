import { describe, expect, it } from 'vitest';
import { DOCUMENT_TYPE, TAX_CATEGORY_CODE, UNIT_CODE } from '@agentur-tool/shared';
import { buildEinvoiceModel, toCountryCode } from '../src/model.js';
import { SOURCE, TOTALS } from './fixtures.js';

describe('buildEinvoiceModel', () => {
  it('übernimmt die Beträge aus dem Snapshot, statt neu zu rechnen', () => {
    // Der wichtigste Test des Pakets. Die Summen kommen aus dem
    // eingefrorenen Snapshot — würde hier neu gerechnet, zeigte das XML
    // eines Tages andere Beträge als das PDF beim Kunden.
    const model = buildEinvoiceModel(SOURCE, TOTALS);

    expect(model.lineTotalCents).toBe(TOTALS.netCents);
    expect(model.taxBasisTotalCents).toBe(TOTALS.netCents);
    expect(model.taxTotalCents).toBe(TOTALS.taxCents);
    expect(model.grandTotalCents).toBe(TOTALS.grossCents);
    expect(model.duePayableCents).toBe(TOTALS.grossCents);
    expect(model.taxBasisTotalCents + model.taxTotalCents).toBe(model.grandTotalCents);
  });

  it('bildet beide Steuersätze ab', () => {
    const model = buildEinvoiceModel(SOURCE, TOTALS);

    expect(model.taxBreakdown).toHaveLength(2);
    expect(model.taxBreakdown.map((entry) => entry.rateBasisPoints)).toEqual([700, 1900]);
    expect(model.taxBreakdown.map((entry) => entry.taxCents)).toEqual([2_835, 17_100]);
    // Die Summe der Gruppen muss die Gesamtsteuer ergeben, sonst weist
    // jeder Prüfer die Rechnung wegen BR-CO-14 ab.
    const sum = model.taxBreakdown.reduce((total, entry) => total + entry.taxCents, 0);
    expect(sum).toBe(TOTALS.taxCents);
  });

  it('nimmt die Mengeneinheit als Code mit', () => {
    const model = buildEinvoiceModel(SOURCE, TOTALS);
    expect(model.lines.map((line) => line.unitCode)).toEqual([
      UNIT_CODE.HOUR,
      UNIT_CODE.SERVICE_UNIT,
    ]);
  });

  it('rechnet den Zeilenrabatt aus den Positionen', () => {
    // Zeilenbeträge haben keinen eigenen Snapshot; sie sind aus den
    // unveränderlichen Positionen reproduzierbar.
    const model = buildEinvoiceModel(SOURCE, TOTALS);
    expect(model.lines[0]?.netCents).toBe(90_000);
    expect(model.lines[0]?.discountCents).toBe(0);
    expect(model.lines[1]?.netCents).toBe(40_500);
    expect(model.lines[1]?.discountCents).toBe(4_500);
  });

  it('macht aus einem Storno eine Gutschrift mit Verweis', () => {
    const model = buildEinvoiceModel(
      { ...SOURCE, documentType: DOCUMENT_TYPE.CANCELLATION, number: '2026-0008' },
      TOTALS,
      { precedingInvoiceNumber: '2026-0007' },
    );

    expect(model.typeCode).toBe('381');
    expect(model.precedingInvoiceNumber).toBe('2026-0007');
  });

  it('ist bei einer normalen Rechnung eine Rechnung', () => {
    expect(buildEinvoiceModel(SOURCE, TOTALS).typeCode).toBe('380');
  });

  it('macht aus dem Leistungszeitraum einen Abrechnungszeitraum', () => {
    const model = buildEinvoiceModel(SOURCE, TOTALS);
    expect(model.periodStart).toBe('2026-02-01');
    expect(model.periodEnd).toBe('2026-02-28');

    // Ohne Enddatum gibt es keinen Zeitraum, nur den Leistungstag.
    const single = buildEinvoiceModel({ ...SOURCE, serviceDateTo: null }, TOTALS);
    expect(single.periodStart).toBeNull();
    expect(single.periodEnd).toBeNull();
    expect(single.deliveryDate).toBe('2026-02-01');
  });

  it('trägt die Steuerkategorie in jede Zeile', () => {
    const model = buildEinvoiceModel(SOURCE, TOTALS);
    expect(model.lines.every((line) => line.categoryCode === TAX_CATEGORY_CODE.STANDARD)).toBe(
      true,
    );
  });

  it('weist einen Entwurf ab', () => {
    // BT-1 ist Pflicht. Ein Entwurf hat keine Nummer — das ist kein
    // Eingabefehler, sondern ein Aufruf an der falschen Stelle.
    expect(() => buildEinvoiceModel({ ...SOURCE, number: null }, TOTALS)).toThrow(
      /ausgestellten Rechnung/,
    );
  });
});

describe('toCountryCode', () => {
  it('lässt echte Codes durch', () => {
    expect(toCountryCode('DE')).toBe('DE');
    expect(toCountryCode('cy')).toBe('CY');
  });

  it('übersetzt die Schreibweisen, die in Stammdaten stehen', () => {
    expect(toCountryCode('Deutschland')).toBe('DE');
    expect(toCountryCode('Österreich')).toBe('AT');
    expect(toCountryCode('Zypern')).toBe('CY');
  });

  it('fällt auf DE zurück', () => {
    // Eine Anwendung, die in Deutschland betrieben wird. Der Prüfbericht
    // nennt das Feld, falls die Vorgabe im Einzelfall falsch ist.
    expect(toCountryCode('Absurdistan')).toBe('DE');
    expect(toCountryCode('')).toBe('DE');
  });
});
