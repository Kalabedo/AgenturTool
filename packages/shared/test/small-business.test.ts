import { describe, expect, it } from 'vitest';
import {
  classifyRevenue,
  DEFAULT_SMALL_BUSINESS_LIMITS,
  limitBreachByInvoice,
  SMALL_BUSINESS_STATE,
  smallBusinessLimitsSchema,
  toSmallBusinessYear,
} from '../src/small-business.js';

const { currentYearCents, warnAtPercent } = DEFAULT_SMALL_BUSINESS_LIMITS;

describe('Einstufung gegen die Grenze', () => {
  it('schweigt, solange der Umsatz weit genug entfernt ist', () => {
    expect(classifyRevenue(5_000_00, currentYearCents, warnAtPercent)).toBe(
      SMALL_BUSINESS_STATE.RUHIG,
    );
  });

  it('warnt ab dem eingestellten Anteil der Grenze', () => {
    // 80 % von 100.000 € sind 80.000 €.
    expect(classifyRevenue(7_999_999, currentYearCents, warnAtPercent)).toBe(
      SMALL_BUSINESS_STATE.RUHIG,
    );
    expect(classifyRevenue(8_000_000, currentYearCents, warnAtPercent)).toBe(
      SMALL_BUSINESS_STATE.NAHE,
    );
  });

  /**
   * Der Grenzfall, auf den es ankommt: Das Gesetz spricht vom Überschreiten.
   * Genau auf der Grenze ist die Regelung noch nicht beendet.
   */
  it('gilt exakt auf der Grenze noch nicht als überschritten', () => {
    expect(classifyRevenue(currentYearCents, currentYearCents, warnAtPercent)).toBe(
      SMALL_BUSINESS_STATE.NAHE,
    );
    expect(classifyRevenue(currentYearCents + 1, currentYearCents, warnAtPercent)).toBe(
      SMALL_BUSINESS_STATE.UEBERSCHRITTEN,
    );
  });

  it('rechnet den Rest bis zur Grenze aus und wird negativ, wenn sie fällt', () => {
    const knapp = toSmallBusinessYear(2026, 9_000_000, currentYearCents, warnAtPercent);
    expect(knapp.remainingCents).toBe(1_000_000);

    const darueber = toSmallBusinessYear(2026, 10_500_000, currentYearCents, warnAtPercent);
    expect(darueber.remainingCents).toBe(-500_000);
    expect(darueber.state).toBe(SMALL_BUSINESS_STATE.UEBERSCHRITTEN);
  });

  /**
   * Ein Storno ist ein eigener Beleg mit negativen Beträgen. Die Summe der
   * Spalten zieht ihn deshalb von selbst ab — ohne diese Eigenschaft stünde
   * eine stornierte Rechnung dauerhaft in der Jahressumme.
   */
  it('zählt ein Storno herunter', () => {
    const revenueCents = 9_000_000 + -2_000_000;
    expect(classifyRevenue(revenueCents, currentYearCents, warnAtPercent)).toBe(
      SMALL_BUSINESS_STATE.RUHIG,
    );
  });
});

describe('Warnung vor dem Ausstellen', () => {
  it('schweigt, wenn die Rechnung die Grenze nicht reißt', () => {
    expect(
      limitBreachByInvoice({
        revenueCents: 5_000_000,
        invoiceNetCents: 1_000_000,
        limitCents: currentYearCents,
      }),
    ).toBeNull();
  });

  it('meldet, um wie viel die Rechnung darüber hinausginge', () => {
    const breach = limitBreachByInvoice({
      revenueCents: 9_500_000,
      invoiceNetCents: 1_000_000,
      limitCents: currentYearCents,
    });

    expect(breach).not.toBeNull();
    expect(breach?.revenueAfterCents).toBe(10_500_000);
    expect(breach?.exceedsByCents).toBe(500_000);
  });

  it('schweigt bei einer Rechnung, die exakt auf die Grenze führt', () => {
    expect(
      limitBreachByInvoice({
        revenueCents: 9_000_000,
        invoiceNetCents: 1_000_000,
        limitCents: currentYearCents,
      }),
    ).toBeNull();
  });
});

describe('Grenzwerte als Einstellung', () => {
  it('nimmt die gesetzlichen Vorgaben an', () => {
    expect(smallBusinessLimitsSchema.parse(DEFAULT_SMALL_BUSINESS_LIMITS)).toEqual(
      DEFAULT_SMALL_BUSINESS_LIMITS,
    );
  });

  it('weist unbrauchbare Werte ab, statt sie zu übernehmen', () => {
    expect(
      smallBusinessLimitsSchema.safeParse({ ...DEFAULT_SMALL_BUSINESS_LIMITS, currentYearCents: 0 })
        .success,
    ).toBe(false);
    expect(
      smallBusinessLimitsSchema.safeParse({ ...DEFAULT_SMALL_BUSINESS_LIMITS, warnAtPercent: 0 })
        .success,
    ).toBe(false);
    expect(
      smallBusinessLimitsSchema.safeParse({ ...DEFAULT_SMALL_BUSINESS_LIMITS, warnAtPercent: 101 })
        .success,
    ).toBe(false);
  });
});
