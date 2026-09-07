import { describe, expect, it } from 'vitest';
import {
  applyBasisPoints,
  formatBasisPoints,
  formatCents,
  formatQuantity,
  multiplyQuantity,
  parseCents,
  roundHalfAwayFromZero,
} from '../src/money.js';

describe('roundHalfAwayFromZero', () => {
  it('rundet positive Werte kaufmännisch', () => {
    expect(roundHalfAwayFromZero(0.5)).toBe(1);
    expect(roundHalfAwayFromZero(1.5)).toBe(2);
    expect(roundHalfAwayFromZero(2.4)).toBe(2);
    expect(roundHalfAwayFromZero(2.6)).toBe(3);
  });

  it('rundet negative Werte spiegelbildlich', () => {
    // Das ist der Kern: Math.round(-0.5) ergibt -0, also aufwärts. Bei
    // Storno-Dokumenten würde die Stornosumme dadurch an der
    // Originalrechnung vorbeilaufen.
    expect(roundHalfAwayFromZero(-0.5)).toBe(-1);
    expect(roundHalfAwayFromZero(-1.5)).toBe(-2);
    expect(roundHalfAwayFromZero(-2.4)).toBe(-2);
    expect(Math.round(-0.5)).toBe(-0); // zum Vergleich: so würde es schiefgehen
  });

  it('ist symmetrisch zur Null', () => {
    for (const value of [0.5, 1.5, 2.5, 12.345, 1234.5, 0.05]) {
      expect(roundHalfAwayFromZero(-value)).toBe(-roundHalfAwayFromZero(value));
    }
  });

  it('wirft bei nicht rundbaren Werten', () => {
    expect(() => roundHalfAwayFromZero(Number.NaN)).toThrow(RangeError);
    expect(() => roundHalfAwayFromZero(Number.POSITIVE_INFINITY)).toThrow(RangeError);
  });
});

describe('multiplyQuantity', () => {
  it('rechnet Tausendstel mal Cent', () => {
    // 7,5 Stunden zu 120,00 € = 900,00 €
    expect(multiplyQuantity(7500, 12000)).toBe(90000);
    // 1 Stück zu 19,99 €
    expect(multiplyQuantity(1000, 1999)).toBe(1999);
    // 0,333 Einheiten zu 10,00 € = 3,33 €
    expect(multiplyQuantity(333, 1000)).toBe(333);
  });

  it('gleicht sich bei negativen Mengen exakt aus', () => {
    const positive = multiplyQuantity(7500, 12345);
    const negative = multiplyQuantity(-7500, 12345);
    expect(positive + negative).toBe(0);
  });
});

describe('applyBasisPoints', () => {
  it('berechnet die Steuer je Satz', () => {
    // 19 % von 1.234,00 €
    expect(applyBasisPoints(123400, 1900)).toBe(23446);
    // 7 % von 100,00 €
    expect(applyBasisPoints(10000, 700)).toBe(700);
    expect(applyBasisPoints(10000, 0)).toBe(0);
  });

  it('gleicht sich beim Storno exakt aus', () => {
    // Original und Storno müssen sich auf null summieren — sonst bleibt
    // ein Restcent in der Buchhaltung stehen.
    const net = 33333;
    expect(applyBasisPoints(net, 1900) + applyBasisPoints(-net, 1900)).toBe(0);
  });
});

describe('parseCents', () => {
  it('liest deutsche Eingaben', () => {
    expect(parseCents('12,34')).toBe(1234);
    expect(parseCents('1.234,56')).toBe(123456);
    expect(parseCents('1234')).toBe(123400);
    expect(parseCents('-12,34')).toBe(-1234);
  });

  it('liest englische Eingaben', () => {
    expect(parseCents('12.34')).toBe(1234);
    expect(parseCents('1,234.56')).toBe(123456);
  });

  it('lehnt Unlesbares ab', () => {
    expect(parseCents('')).toBeNull();
    expect(parseCents('abc')).toBeNull();
    expect(parseCents('12,34,56')).toBeNull();
    expect(parseCents('-')).toBeNull();
  });
});

describe('Formatierung', () => {
  it('stellt Beträge, Sätze und Mengen deutsch dar', () => {
    expect(formatCents(123456)).toMatch(/1\.234,56/);
    expect(formatBasisPoints(1900)).toBe('19 %');
    expect(formatBasisPoints(750)).toBe('7,5 %');
    expect(formatQuantity(7500)).toBe('7,5');
    expect(formatQuantity(1000)).toBe('1');
  });
});
