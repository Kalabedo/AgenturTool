import { describe, expect, it } from 'vitest';
import {
  allowsRateInput,
  requiresNoteText,
  taxProfileInputSchema,
  taxProfileListQuerySchema,
} from '../src/tax-profile.js';
import { TAX_PROFILE_KIND } from '../src/enums.js';
import { basisPointsToPercentInput, parsePercentToBasisPoints } from '../src/money.js';

const base = {
  name: 'Deutschland 19 %',
  kind: TAX_PROFILE_KIND.STANDARD,
  defaultRateBasisPoints: '19',
  noteText: '',
  showTaxColumn: true,
  isDefault: false,
  sortOrder: 0,
};

describe('parsePercentToBasisPoints', () => {
  it('nimmt Komma und Punkt gleichermaßen', () => {
    expect(parsePercentToBasisPoints('19')).toBe(1900);
    expect(parsePercentToBasisPoints('7,5')).toBe(750);
    expect(parsePercentToBasisPoints('7.5')).toBe(750);
    expect(parsePercentToBasisPoints('0')).toBe(0);
    expect(parsePercentToBasisPoints(' 19 ')).toBe(1900);
  });

  it('lehnt Unsinniges ab', () => {
    expect(parsePercentToBasisPoints('')).toBeNull();
    expect(parsePercentToBasisPoints('abc')).toBeNull();
    expect(parsePercentToBasisPoints('-5')).toBeNull();
    expect(parsePercentToBasisPoints('101')).toBeNull();
    expect(parsePercentToBasisPoints('.')).toBeNull();
  });
});

describe('basisPointsToPercentInput', () => {
  it('liefert eine Eingabe ohne Prozentzeichen zurück', () => {
    expect(basisPointsToPercentInput(1900)).toBe('19');
    expect(basisPointsToPercentInput(750)).toBe('7,5');
    expect(basisPointsToPercentInput(0)).toBe('0');
  });

  it('ist mit dem Parser gegenseitig stimmig', () => {
    for (const basisPoints of [0, 700, 750, 1900, 2000]) {
      expect(parsePercentToBasisPoints(basisPointsToPercentInput(basisPoints))).toBe(basisPoints);
    }
  });
});

describe('taxProfileInputSchema', () => {
  it('rechnet die Prozenteingabe in Basispunkte um', () => {
    expect(taxProfileInputSchema.parse(base).defaultRateBasisPoints).toBe(1900);
    expect(
      taxProfileInputSchema.parse({ ...base, defaultRateBasisPoints: '7,5' })
        .defaultRateBasisPoints,
    ).toBe(750);
  });

  it('verlangt einen Namen', () => {
    expect(taxProfileInputSchema.safeParse({ ...base, name: '  ' }).success).toBe(false);
  });

  it('erzwingt Satz 0 bei steuerfreien Arten', () => {
    // Auch wenn ein direkter API-Aufruf 19 % mitschickt: Auf einer
    // Reverse-Charge-Rechnung darf kein Steuersatz landen.
    const parsed = taxProfileInputSchema.parse({
      ...base,
      kind: TAX_PROFILE_KIND.REVERSE_CHARGE,
      defaultRateBasisPoints: '19',
      noteText: 'Steuerschuldnerschaft des Leistungsempfängers.',
    });
    expect(parsed.defaultRateBasisPoints).toBe(0);
  });

  it('verlangt einen Hinweistext bei Reverse Charge und Kleinunternehmern', () => {
    for (const kind of [TAX_PROFILE_KIND.REVERSE_CHARGE, TAX_PROFILE_KIND.SMALL_BUSINESS]) {
      const result = taxProfileInputSchema.safeParse({ ...base, kind, noteText: '' });
      expect(result.success, kind).toBe(false);
      if (!result.success) {
        expect(result.error.errors[0]?.path).toEqual(['noteText']);
      }
    }
  });

  it('lässt den Hinweistext bei Regelbesteuerung offen', () => {
    expect(taxProfileInputSchema.parse({ ...base, noteText: '' }).noteText).toBeNull();
  });

  it('lehnt einen unsinnigen Steuersatz ab', () => {
    expect(
      taxProfileInputSchema.safeParse({ ...base, defaultRateBasisPoints: '150' }).success,
    ).toBe(false);
    expect(
      taxProfileInputSchema.safeParse({ ...base, defaultRateBasisPoints: 'viel' }).success,
    ).toBe(false);
  });

  it('lehnt eine unbekannte Steuerart ab', () => {
    expect(taxProfileInputSchema.safeParse({ ...base, kind: 'ERFUNDEN' }).success).toBe(false);
  });
});

describe('taxProfileListQuerySchema', () => {
  it('blendet Archiviertes standardmäßig aus', () => {
    expect(taxProfileListQuerySchema.parse({}).includeArchived).toBe(false);
  });

  it('nimmt den Query-Parameter als String entgegen', () => {
    expect(taxProfileListQuerySchema.parse({ includeArchived: 'true' }).includeArchived).toBe(true);
    expect(taxProfileListQuerySchema.parse({ includeArchived: 'false' }).includeArchived).toBe(
      false,
    );
  });
});

describe('Hilfsfunktionen für das Formular', () => {
  it('sagt, wann ein Satz eingegeben werden darf', () => {
    expect(allowsRateInput(TAX_PROFILE_KIND.STANDARD)).toBe(true);
    expect(allowsRateInput(TAX_PROFILE_KIND.ZERO_RATED)).toBe(false);
    expect(allowsRateInput(TAX_PROFILE_KIND.REVERSE_CHARGE)).toBe(false);
    expect(allowsRateInput(TAX_PROFILE_KIND.SMALL_BUSINESS)).toBe(false);
  });

  it('sagt, wann ein Hinweistext Pflicht ist', () => {
    expect(requiresNoteText(TAX_PROFILE_KIND.REVERSE_CHARGE)).toBe(true);
    expect(requiresNoteText(TAX_PROFILE_KIND.SMALL_BUSINESS)).toBe(true);
    expect(requiresNoteText(TAX_PROFILE_KIND.STANDARD)).toBe(false);
    expect(requiresNoteText(TAX_PROFILE_KIND.ZERO_RATED)).toBe(false);
  });
});
