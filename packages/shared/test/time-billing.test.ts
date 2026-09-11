import { describe, expect, it } from 'vitest';
import {
  BILLING_MODE,
  DEFAULT_BILLING_MODE,
  describePeriod,
  previewTimeBilling,
  timeEntriesToInvoiceItems,
  type TimeBillingOptions,
  type TimeEntryForBilling,
} from '../src/time-billing.js';
import { UNIT_CODE } from '../src/einvoice/codes.js';
import { multiplyQuantity } from '../src/money.js';

/** 50,00 € die Stunde, 19 %. */
const OPTIONS: TimeBillingOptions = {
  rateCents: 5000,
  mode: BILLING_MODE.SAMMEL,
  taxRateBasisPoints: 1900,
};

/**
 * Drei Tage, fünf Einträge, zwei Beschreibungen — 10,5 Stunden.
 *
 * Alle Dauern sind Vielfache von 15 Minuten, weil die Datenbank das per
 * CHECK erzwingt. Genau darauf beruht die Exaktheit.
 */
const ENTRIES: TimeEntryForBilling[] = [
  { date: '2026-02-03', startMinutes: 540, durationMinutes: 120, description: 'Konzeption' },
  { date: '2026-02-03', startMinutes: 780, durationMinutes: 90, description: 'Umsetzung' },
  { date: '2026-02-10', startMinutes: 600, durationMinutes: 225, description: 'Umsetzung' },
  { date: '2026-02-10', startMinutes: 900, durationMinutes: 45, description: null },
  { date: '2026-02-24', startMinutes: 540, durationMinutes: 150, description: 'Konzeption' },
];

const TOTAL_MINUTES = 630;

describe('Die Vorgabe ist eine Sammelzeile', () => {
  it('ist SAMMEL', () => {
    // Der Normalfall, nicht die Tagesaufschlüsselung. Vierzig Termine auf
    // einer Rechnung laden zur Diskussion über einzelne Stunden ein.
    expect(DEFAULT_BILLING_MODE).toBe(BILLING_MODE.SAMMEL);
  });

  it('macht aus allem eine Position', () => {
    const items = timeEntriesToInvoiceItems(ENTRIES, OPTIONS);

    expect(items).toHaveLength(1);
    expect(items[0]?.description).toBe('Arbeit im Zeitraum 03.02.2026–24.02.2026');
    // 630 Minuten = 10,5 Stunden = 10500 Tausendstel.
    expect(items[0]?.quantity).toBe(10_500);
    expect(items[0]?.unitPriceCents).toBe(5000);
  });

  it('schreibt Stunden als Einheit — auch für die E-Rechnung', () => {
    const [item] = timeEntriesToInvoiceItems(ENTRIES, OPTIONS);
    expect(item?.unit).toBe('Std.');
    expect(item?.unitCode).toBe(UNIT_CODE.HOUR);
  });

  it('gibt keinen Nachlass', () => {
    const [item] = timeEntriesToInvoiceItems(ENTRIES, OPTIONS);
    expect(item?.discountValue).toBe(0);
  });

  it('nennt einen einzelnen Tag beim Datum', () => {
    const items = timeEntriesToInvoiceItems([ENTRIES[0]!], OPTIONS);
    expect(items[0]?.description).toBe('Arbeit am 03.02.2026');
  });
});

describe('Eine Zeile je Tag', () => {
  const items = timeEntriesToInvoiceItems(ENTRIES, {
    ...OPTIONS,
    mode: BILLING_MODE.PRO_TAG,
  });

  it('macht aus drei Tagen drei Positionen, aufsteigend', () => {
    expect(items).toHaveLength(3);
    // Eine Rechnung liest sich vorwärts — anders als die Erfassungsliste.
    expect(items.map((item) => item.description.slice(0, 10))).toEqual([
      '03.02.2026',
      '10.02.2026',
      '24.02.2026',
    ]);
  });

  it('summiert die Stunden eines Tages', () => {
    // 120 + 90 = 210 Minuten = 3,5 Stunden.
    expect(items[0]?.quantity).toBe(3_500);
    // 225 + 45 = 270 Minuten = 4,5 Stunden.
    expect(items[1]?.quantity).toBe(4_500);
  });

  it('nennt die Beschreibungen des Tages, ohne Wiederholung', () => {
    expect(items[0]?.description).toBe('03.02.2026: Konzeption, Umsetzung');
  });
});

describe('Eine Zeile je Beschreibung', () => {
  const items = timeEntriesToInvoiceItems(ENTRIES, {
    ...OPTIONS,
    mode: BILLING_MODE.PRO_BESCHREIBUNG,
  });

  it('fasst gleiche Beschreibungen zusammen', () => {
    expect(items.map((item) => item.description)).toEqual(['Konzeption', 'Umsetzung', 'Arbeit']);
  });

  it('behält die Reihenfolge des ersten Auftretens', () => {
    // Nicht alphabetisch: So steht oben, womit angefangen wurde.
    expect(items[0]?.description).toBe('Konzeption');
  });

  it('summiert je Beschreibung', () => {
    // Konzeption: 120 + 150 = 270 Minuten = 4,5 Stunden.
    expect(items[0]?.quantity).toBe(4_500);
    // Umsetzung: 90 + 225 = 315 Minuten = 5,25 Stunden.
    expect(items[1]?.quantity).toBe(5_250);
    // Ohne Beschreibung: 45 Minuten = 0,75 Stunden.
    expect(items[2]?.quantity).toBe(750);
  });
});

describe('Alle drei Arten ergeben denselben Betrag', () => {
  /**
   * Der Test, der die Exaktheit festnagelt.
   *
   * Weil jede Dauer auf dem Viertelstundenraster liegt, ist jede Teilsumme
   * in Tausendstel Stunden ohne Rest darstellbar — egal wie gruppiert wird.
   * Wer das Raster einmal lockert, sieht es hier zuerst.
   */
  const net = (mode: (typeof BILLING_MODE)[keyof typeof BILLING_MODE]): number =>
    timeEntriesToInvoiceItems(ENTRIES, { ...OPTIONS, mode }).reduce(
      (sum, item) => sum + multiplyQuantity(item.quantity, item.unitPriceCents),
      0,
    );

  it('auf den Cent', () => {
    // 10,5 Stunden × 50,00 € = 525,00 €
    expect(net(BILLING_MODE.SAMMEL)).toBe(52_500);
    expect(net(BILLING_MODE.PRO_TAG)).toBe(52_500);
    expect(net(BILLING_MODE.PRO_BESCHREIBUNG)).toBe(52_500);
  });

  it('und die Mengen summieren sich gleich', () => {
    const quantity = (mode: (typeof BILLING_MODE)[keyof typeof BILLING_MODE]): number =>
      timeEntriesToInvoiceItems(ENTRIES, { ...OPTIONS, mode }).reduce(
        (sum, item) => sum + item.quantity,
        0,
      );

    expect(quantity(BILLING_MODE.SAMMEL)).toBe(10_500);
    expect(quantity(BILLING_MODE.PRO_TAG)).toBe(10_500);
    expect(quantity(BILLING_MODE.PRO_BESCHREIBUNG)).toBe(10_500);
  });
});

describe('previewTimeBilling', () => {
  it('sagt vorher, was entsteht', () => {
    // Wer auf einen Knopf drückt, der eine Rechnung anlegt, soll vorher
    // wissen, was dabei herauskommt.
    const preview = previewTimeBilling(ENTRIES, OPTIONS);

    expect(preview.itemCount).toBe(1);
    expect(preview.durationMinutes).toBe(TOTAL_MINUTES);
    expect(preview.netCents).toBe(52_500);
  });

  it('zählt die Positionen je Art richtig', () => {
    expect(previewTimeBilling(ENTRIES, { ...OPTIONS, mode: BILLING_MODE.PRO_TAG }).itemCount).toBe(
      3,
    );
    expect(
      previewTimeBilling(ENTRIES, { ...OPTIONS, mode: BILLING_MODE.PRO_BESCHREIBUNG }).itemCount,
    ).toBe(3);
  });

  it('zeigt für alle Arten denselben Betrag', () => {
    const sammel = previewTimeBilling(ENTRIES, OPTIONS).netCents;
    const proTag = previewTimeBilling(ENTRIES, { ...OPTIONS, mode: BILLING_MODE.PRO_TAG }).netCents;
    expect(proTag).toBe(sammel);
  });
});

describe('Randfälle', () => {
  it('liefert für keine Zeiten keine Positionen', () => {
    // Die Prüfung, ob überhaupt etwas offen ist, gehört an die Stelle, die
    // den Entwurf anlegt — nicht hierher.
    expect(timeEntriesToInvoiceItems([], OPTIONS)).toEqual([]);
  });

  it('verträgt eine leere Beschreibung wie eine fehlende', () => {
    const items = timeEntriesToInvoiceItems(
      [{ date: '2026-02-03', startMinutes: 540, durationMinutes: 60, description: '   ' }],
      { ...OPTIONS, mode: BILLING_MODE.PRO_BESCHREIBUNG },
    );
    expect(items[0]?.description).toBe('Arbeit');
  });

  it('beschreibt einen leeren Zeitraum nicht mit Datum', () => {
    expect(describePeriod('', '')).toBe('Arbeit');
  });
});
