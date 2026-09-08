import { describe, expect, it } from 'vitest';
import {
  calculateInvoice,
  calculateItem,
  itemGrossForDisplay,
  negateInvoiceItems,
  resolvePaymentTermDays,
  toTotalsSnapshot,
  type InvoiceCalculationItem,
} from '../src/invoice-calculation.js';
import { DISCOUNT_TYPE } from '../src/enums.js';
import { applyBasisPoints } from '../src/money.js';
import { CURRENT_SNAPSHOT_VERSION, totalsSnapshotSchema } from '../src/snapshots.js';

/** Kurzschreibweise: Menge in Stück, Preis in Cent, Satz in Basispunkten. */
function item(overrides: Partial<InvoiceCalculationItem> = {}): InvoiceCalculationItem {
  return {
    quantity: 1000,
    unitPriceCents: 10000,
    discountType: DISCOUNT_TYPE.PERCENT,
    discountValue: 0,
    taxRateBasisPoints: 1900,
    ...overrides,
  };
}

describe('calculateItem', () => {
  it('rechnet Menge mal Einzelpreis', () => {
    expect(calculateItem(item()).netCents).toBe(10000);
    // 7,5 Stunden zu 120,00 € = 900,00 €
    expect(calculateItem(item({ quantity: 7500, unitPriceCents: 12000 })).netCents).toBe(90000);
  });

  it('zieht einen prozentualen Rabatt ab', () => {
    const result = calculateItem(item({ discountValue: 1000 })); // 10 %
    expect(result.baseCents).toBe(10000);
    expect(result.discountCents).toBe(1000);
    expect(result.netCents).toBe(9000);
  });

  it('zieht einen absoluten Rabatt ab', () => {
    const result = calculateItem(item({ discountType: DISCOUNT_TYPE.AMOUNT, discountValue: 2500 }));
    expect(result.discountCents).toBe(2500);
    expect(result.netCents).toBe(7500);
  });

  it('rundet den Rabatt auf den Cent, bevor er abgezogen wird', () => {
    // 12,5 % von 10,01 € = 1,25125 € -> 1,25 €. Ohne die Rundung schleppte
    // man Bruchteile in die Gruppensumme, und die Zeile ließe sich auf dem
    // Papier nicht mehr nachrechnen.
    const result = calculateItem(item({ unitPriceCents: 1001, discountValue: 1250 }));
    expect(result.discountCents).toBe(125);
    expect(result.netCents).toBe(876);
  });

  it('erlaubt 100 % Rabatt', () => {
    expect(calculateItem(item({ discountValue: 10000 })).netCents).toBe(0);
  });

  it('kommt mit Menge null zurecht', () => {
    expect(calculateItem(item({ quantity: 0 })).netCents).toBe(0);
  });

  it('rechnet Bruchteile von Mengen korrekt', () => {
    // 0,333 Einheiten zu 10,00 € = 3,33 €
    expect(calculateItem(item({ quantity: 333, unitPriceCents: 1000 })).netCents).toBe(333);
  });
});

describe('calculateInvoice', () => {
  it('liefert für eine leere Rechnung lauter Nullen', () => {
    const result = calculateInvoice([]);
    expect(result).toMatchObject({
      netCents: 0,
      taxCents: 0,
      grossCents: 0,
      totalDiscountCents: 0,
      taxGroups: [],
      items: [],
    });
  });

  it('rechnet eine einfache Rechnung durch', () => {
    // 1.234,00 € netto zu 19 % = 234,46 € Steuer
    const result = calculateInvoice([item({ unitPriceCents: 123400 })]);
    expect(result.netCents).toBe(123400);
    expect(result.taxCents).toBe(23446);
    expect(result.grossCents).toBe(146846);
  });

  it('fasst gleiche Steuersätze zu einer Gruppe zusammen', () => {
    const result = calculateInvoice([
      item({ unitPriceCents: 10000 }),
      item({ unitPriceCents: 20000 }),
    ]);
    expect(result.taxGroups).toHaveLength(1);
    expect(result.taxGroups[0]).toEqual({
      rateBasisPoints: 1900,
      netCents: 30000,
      taxCents: 5700,
    });
  });

  it('trennt unterschiedliche Steuersätze und sortiert aufsteigend', () => {
    const result = calculateInvoice([
      item({ unitPriceCents: 10000, taxRateBasisPoints: 1900 }),
      item({ unitPriceCents: 20000, taxRateBasisPoints: 700 }),
      item({ unitPriceCents: 5000, taxRateBasisPoints: 0 }),
    ]);

    expect(result.taxGroups.map((g) => g.rateBasisPoints)).toEqual([0, 700, 1900]);
    expect(result.taxGroups).toEqual([
      { rateBasisPoints: 0, netCents: 5000, taxCents: 0 },
      { rateBasisPoints: 700, netCents: 20000, taxCents: 1400 },
      { rateBasisPoints: 1900, netCents: 10000, taxCents: 1900 },
    ]);
    expect(result.netCents).toBe(35000);
    expect(result.taxCents).toBe(3300);
    expect(result.grossCents).toBe(38300);
  });

  it('summiert die Rabatte über alle Positionen', () => {
    const result = calculateInvoice([
      item({ discountValue: 1000 }),
      item({ discountType: DISCOUNT_TYPE.AMOUNT, discountValue: 500 }),
    ]);
    expect(result.totalDiscountCents).toBe(1500);
    expect(result.netCents).toBe(9000 + 9500);
  });

  it('behält die Reihenfolge der Positionen bei', () => {
    const result = calculateInvoice([
      item({ unitPriceCents: 300 }),
      item({ unitPriceCents: 100 }),
      item({ unitPriceCents: 200 }),
    ]);
    expect(result.items.map((i) => i.netCents)).toEqual([300, 100, 200]);
  });

  it('Netto plus Steuer ergibt immer den Bruttobetrag', () => {
    const invoices: InvoiceCalculationItem[][] = [
      [item()],
      [item({ unitPriceCents: 1 })],
      [item({ unitPriceCents: 999 }), item({ taxRateBasisPoints: 700, unitPriceCents: 777 })],
      [item({ quantity: 333, unitPriceCents: 3333, discountValue: 1234 })],
    ];

    for (const items of invoices) {
      const result = calculateInvoice(items);
      expect(result.netCents + result.taxCents).toBe(result.grossCents);
    }
  });
});

describe('Rundung je Gruppe statt je Position', () => {
  it('weicht nachweislich von der zeilenweisen Summierung ab', () => {
    // Genau der Fall, der die Entscheidung begründet: drei Positionen zu
    // 10,01 € bei 19 %.
    //   zeilenweise:  round(1001 × 0,19) = 190  ×3 = 570
    //   je Gruppe:    round(3003 × 0,19) = 571
    // Ein Cent Unterschied — und nur der zweite Wert entspricht der Steuer
    // auf das Gesamtentgelt, also dem, was tatsächlich geschuldet wird.
    const items = [
      item({ unitPriceCents: 1001 }),
      item({ unitPriceCents: 1001 }),
      item({ unitPriceCents: 1001 }),
    ];

    const perLineSum = items.reduce(
      (sum, current) => sum + applyBasisPoints(calculateItem(current).netCents, 1900),
      0,
    );
    const result = calculateInvoice(items);

    expect(perLineSum).toBe(570);
    expect(result.taxCents).toBe(571);
    expect(result.taxCents).not.toBe(perLineSum);
  });

  it('stimmt mit der Steuer auf das Gesamtentgelt überein', () => {
    const items = [
      item({ unitPriceCents: 1001 }),
      item({ unitPriceCents: 2003 }),
      item({ unitPriceCents: 5007 }),
    ];
    const result = calculateInvoice(items);
    expect(result.taxCents).toBe(applyBasisPoints(result.netCents, 1900));
  });
});

describe('Storno', () => {
  it('gleicht die Originalrechnung exakt aus', () => {
    // Der Kern von D12 und des symmetrischen Rundens: Original und Storno
    // müssen sich auf null summieren, sonst bliebe ein Restcent stehen.
    const items = [
      item({ quantity: 7500, unitPriceCents: 12345, discountValue: 1250 }),
      item({ quantity: 3000, unitPriceCents: 3333, taxRateBasisPoints: 700 }),
      item({ quantity: 1000, unitPriceCents: 1001 }),
    ];

    const original = calculateInvoice(items);
    const storno = calculateInvoice(negateInvoiceItems(items));

    expect(original.netCents + storno.netCents).toBe(0);
    expect(original.taxCents + storno.taxCents).toBe(0);
    expect(original.grossCents + storno.grossCents).toBe(0);
  });

  it('gleicht auch bei Beträgen auf halbem Cent exakt aus', () => {
    // Konstruierte Fälle, in denen die Rundung auf .5 trifft — hier würde
    // Math.round auseinanderlaufen.
    for (const unitPriceCents of [1, 3, 5, 7, 11, 1001, 3333]) {
      for (const quantity of [500, 1500, 2500, 333]) {
        const items = [item({ quantity, unitPriceCents })];
        const original = calculateInvoice(items);
        const storno = calculateInvoice(negateInvoiceItems(items));

        expect(original.grossCents + storno.grossCents, `${quantity}×${unitPriceCents}`).toBe(0);
      }
    }
  });

  it('dreht einen absoluten Rabatt mit, einen prozentualen nicht', () => {
    const withAmount = item({ discountType: DISCOUNT_TYPE.AMOUNT, discountValue: 2500 });
    const withPercent = item({ discountValue: 1000 });

    const [negatedAmount, negatedPercent] = negateInvoiceItems([withAmount, withPercent]);

    expect(negatedAmount?.discountValue).toBe(-2500);
    // Der Prozentsatz gilt unverändert, nur die Bezugsgröße ist negativ.
    expect(negatedPercent?.discountValue).toBe(1000);

    expect(calculateItem(negatedAmount!).netCents).toBe(-7500);
    expect(calculateItem(negatedPercent!).netCents).toBe(-9000);
  });

  it('behält die Steuersatzgruppen bei', () => {
    const items = [item({ taxRateBasisPoints: 1900 }), item({ taxRateBasisPoints: 700 })];
    const storno = calculateInvoice(negateInvoiceItems(items));
    expect(storno.taxGroups.map((g) => g.rateBasisPoints)).toEqual([700, 1900]);
    expect(storno.taxGroups.every((g) => g.netCents < 0)).toBe(true);
  });
});

describe('toTotalsSnapshot', () => {
  it('erzeugt einen gültigen Snapshot', () => {
    const calculation = calculateInvoice([
      item({ unitPriceCents: 123400 }),
      item({ unitPriceCents: 10000, taxRateBasisPoints: 700 }),
    ]);
    const snapshot = toTotalsSnapshot(calculation);

    // Muss durch das Schema gehen, mit dem der Snapshot später aus der
    // Datenbank gelesen wird.
    expect(() => totalsSnapshotSchema.parse(JSON.parse(JSON.stringify(snapshot)))).not.toThrow();
    expect(snapshot.snapshotVersion).toBe(CURRENT_SNAPSHOT_VERSION);
    expect(snapshot.taxGroups).toHaveLength(2);
    expect(snapshot.netCents + snapshot.taxCents).toBe(snapshot.grossCents);
  });
});

describe('itemGrossForDisplay', () => {
  it('liefert den Bruttobetrag einer Zeile', () => {
    expect(itemGrossForDisplay(item({ unitPriceCents: 10000 }))).toBe(11900);
  });

  it('summiert sich absichtlich nicht zwingend zum Rechnungsbetrag', () => {
    // Dokumentiert die Falle: Wer die Zeilen-Bruttobeträge addiert, bekommt
    // hier 3 × 1191 = 3573, während die Rechnung 3574 ausweist.
    const items = [
      item({ unitPriceCents: 1001 }),
      item({ unitPriceCents: 1001 }),
      item({ unitPriceCents: 1001 }),
    ];
    const displaySum = items.reduce((sum, current) => sum + itemGrossForDisplay(current), 0);
    expect(displaySum).toBe(3573);
    expect(calculateInvoice(items).grossCents).toBe(3574);
  });
});

describe('resolvePaymentTermDays', () => {
  it('bevorzugt die Kundenvorgabe', () => {
    expect(resolvePaymentTermDays(21, 14)).toBe(21);
  });

  it('fällt ohne Kundenvorgabe auf das Unternehmen zurück', () => {
    expect(resolvePaymentTermDays(null, 14)).toBe(14);
  });

  it('behandelt null Tage beim Kunden als echte Angabe', () => {
    // Nicht mit "keine Angabe" verwechseln — sonst wäre eine bewusst sofort
    // fällige Rechnung nicht abbildbar.
    expect(resolvePaymentTermDays(0, 14)).toBe(0);
  });
});

describe('Schutz vor unsicheren Beträgen', () => {
  it('bricht ab, statt still ungenau zu rechnen', () => {
    // Jenseits von Number.MAX_SAFE_INTEGER liefert JavaScript plausibel
    // aussehende, aber falsche Ergebnisse. Bei Geld ist der Abbruch besser.
    expect(() =>
      calculateInvoice([item({ quantity: 1_000_000_000_000, unitPriceCents: 1_000_000_000 })]),
    ).toThrow(/außerhalb des sicher darstellbaren Bereichs/);
  });

  it('lässt realistische Größenordnungen durch', () => {
    // 10.000 Stunden zu 10.000,00 € = 100 Mio. € — absurd, aber rechenbar.
    const result = calculateInvoice([item({ quantity: 10_000_000, unitPriceCents: 1_000_000 })]);
    expect(result.netCents).toBe(10_000_000_000);
    expect(result.grossCents).toBe(11_900_000_000);
  });
});
