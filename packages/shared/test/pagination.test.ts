import { describe, expect, it } from 'vitest';
import { DEFAULT_PAGE_SIZE, describeRange, pageQuerySchema, paginate } from '../src/index.js';

describe('pageQuerySchema', () => {
  it('setzt Seite und Seitengröße vor', () => {
    expect(pageQuerySchema.parse({})).toEqual({ page: 1, pageSize: DEFAULT_PAGE_SIZE });
  });

  it('nimmt Zahlen aus der Abfragezeichenkette entgegen', () => {
    // Aus einer URL kommt alles als Text.
    expect(pageQuerySchema.parse({ page: '3', pageSize: '10' })).toEqual({ page: 3, pageSize: 10 });
  });

  it('begrenzt die Seitengröße nach oben', () => {
    // Ohne Obergrenze wäre "pageSize=100000" ein Weg, den Server zu
    // beschäftigen.
    expect(pageQuerySchema.safeParse({ pageSize: '100000' }).success).toBe(false);
    expect(pageQuerySchema.safeParse({ page: '0' }).success).toBe(false);
  });
});

describe('paginate', () => {
  it('rechnet die Seitenzahl aus', () => {
    expect(paginate([1, 2], 7, 1, 2).pageCount).toBe(4);
  });

  it('meldet bei null Treffern keine Seite', () => {
    expect(paginate([], 0, 1, 25).pageCount).toBe(0);
  });
});

describe('describeRange', () => {
  it('beschreibt den gezeigten Ausschnitt', () => {
    expect(describeRange(paginate([1, 2, 3], 87, 2, 3))).toBe('4–6 von 87');
  });

  it('sagt bei null Treffern nichts von Bereichen', () => {
    expect(describeRange(paginate([], 0, 1, 25))).toBe('keine Treffer');
  });
});
