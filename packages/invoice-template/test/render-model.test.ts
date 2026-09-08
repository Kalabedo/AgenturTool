import { describe, expect, it } from 'vitest';
import { CURRENT_SNAPSHOT_VERSION, DISCOUNT_TYPE, type TotalsSnapshot } from '@agentur-tool/shared';
import { buildRenderModel } from '../src/render-model.js';
import { REFERENCE_INVOICE, STANDARD_TAX } from './fixtures.js';

describe('buildRenderModel', () => {
  it('rechnet die Referenzrechnung nach', () => {
    const model = buildRenderModel(REFERENCE_INVOICE);

    expect(model.items.map((item) => item.netCents)).toEqual([19500, 2400, 4000]);
    expect(model.totals.netCents).toBe(25900);
    expect(model.totals.taxCents).toBe(0);
    expect(model.totals.grossCents).toBe(25900);
  });

  it('nummeriert die Positionen fortlaufend ab 1', () => {
    const model = buildRenderModel(REFERENCE_INVOICE);
    expect(model.items.map((item) => item.position)).toEqual([1, 2, 3]);
  });

  it('legt den ausgerechneten Rabattbetrag auch bei Prozentangaben bei', () => {
    const model = buildRenderModel({
      ...REFERENCE_INVOICE,
      items: [
        {
          description: 'Beratung',
          quantity: 10000,
          unit: 'Std.',
          unitPriceCents: 12000,
          discountType: DISCOUNT_TYPE.PERCENT,
          discountValue: 1250,
          taxRateBasisPoints: 1900,
        },
      ],
    });

    // 10 × 120,00 € = 1.200,00 €, davon 12,5 % = 150,00 €
    expect(model.items[0]?.discountCents).toBe(15000);
    expect(model.items[0]?.netCents).toBe(105000);
    // Der Prozentwert bleibt erhalten, damit die Spalte „12,5 %" zeigen kann.
    expect(model.items[0]?.discountValue).toBe(1250);
  });

  it('bildet Steuergruppen je Satz, nicht je Position', () => {
    const model = buildRenderModel({
      ...REFERENCE_INVOICE,
      tax: STANDARD_TAX,
      items: [
        {
          description: 'A',
          quantity: 1000,
          unit: null,
          unitPriceCents: 10000,
          discountType: DISCOUNT_TYPE.PERCENT,
          discountValue: 0,
          taxRateBasisPoints: 1900,
        },
        {
          description: 'B',
          quantity: 1000,
          unit: null,
          unitPriceCents: 5000,
          discountType: DISCOUNT_TYPE.PERCENT,
          discountValue: 0,
          taxRateBasisPoints: 1900,
        },
        {
          description: 'C',
          quantity: 1000,
          unit: null,
          unitPriceCents: 2000,
          discountType: DISCOUNT_TYPE.PERCENT,
          discountValue: 0,
          taxRateBasisPoints: 700,
        },
      ],
    });

    expect(model.totals.taxGroups).toEqual([
      { rateBasisPoints: 700, netCents: 2000, taxCents: 140 },
      { rateBasisPoints: 1900, netCents: 15000, taxCents: 2850 },
    ]);
  });

  /**
   * Der wichtigste Test dieser Datei.
   *
   * Eine finalisierte Rechnung muss ihre eingefrorenen Summen zeigen, auch
   * wenn eine spätere Änderung am Rechenweg etwas anderes ergäbe. Sonst
   * druckte ein Nachdruck andere Beträge als das Exemplar beim Kunden.
   */
  it('übernimmt eingefrorene Summen unverändert, statt neu zu rechnen', () => {
    const frozen: TotalsSnapshot = {
      snapshotVersion: CURRENT_SNAPSHOT_VERSION,
      netCents: 12345,
      taxCents: 2345,
      grossCents: 14690,
      totalDiscountCents: 500,
      taxGroups: [{ rateBasisPoints: 1900, netCents: 12345, taxCents: 2345 }],
    };

    const model = buildRenderModel(REFERENCE_INVOICE, frozen);

    expect(model.totals).toEqual(frozen);
    // Die Zeilenbeträge bleiben reproduzierbar — sie haben keinen Snapshot.
    expect(model.items.map((item) => item.netCents)).toEqual([19500, 2400, 4000]);
  });

  it('kommt mit einer Rechnung ohne Positionen zurecht', () => {
    const model = buildRenderModel({ ...REFERENCE_INVOICE, items: [] });
    expect(model.items).toEqual([]);
    expect(model.totals.grossCents).toBe(0);
  });
});
