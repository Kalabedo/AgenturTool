import { describe, expect, it } from 'vitest';
import {
  formatIban,
  isPlausibleVatId,
  isValidBic,
  isValidIban,
  normaliseIban,
} from '../src/banking.js';

describe('isValidIban', () => {
  it('akzeptiert gültige IBANs', () => {
    expect(isValidIban('DE02120300000000202051')).toBe(true);
    expect(isValidIban('DE02 1203 0000 0000 2020 51')).toBe(true);
    expect(isValidIban('de02120300000000202051')).toBe(true);
    // Andere Länder, andere Längen
    expect(isValidIban('AT611904300234573201')).toBe(true);
    expect(isValidIban('CH9300762011623852957')).toBe(true);
    expect(isValidIban('GB33BUKB20201555555555')).toBe(true);
  });

  it('erkennt eine vertauschte Ziffer', () => {
    // Genau der Fehler, der beim Abtippen entsteht: 20 statt 02 am Ende.
    expect(isValidIban('DE02120300000000202015')).toBe(false);
  });

  it('erkennt eine fehlende Stelle', () => {
    expect(isValidIban('DE0212030000000020205')).toBe(false);
  });

  it('erkennt falsche Prüfziffern', () => {
    expect(isValidIban('DE03120300000000202051')).toBe(false);
  });

  it('lehnt strukturell Ungültiges ab', () => {
    expect(isValidIban('')).toBe(false);
    expect(isValidIban('DE')).toBe(false);
    expect(isValidIban('1234567890')).toBe(false);
    expect(isValidIban('DEXX120300000000202051')).toBe(false);
  });
});

describe('normaliseIban und formatIban', () => {
  it('entfernt Leerzeichen und normalisiert Großschreibung', () => {
    expect(normaliseIban(' de02 1203 0000 0000 2020 51 ')).toBe('DE02120300000000202051');
  });

  it('gruppiert in Viererblöcke', () => {
    expect(formatIban('DE02120300000000202051')).toBe('DE02 1203 0000 0000 2020 51');
  });

  it('ist gegen sich selbst stabil', () => {
    const once = formatIban('DE02120300000000202051');
    expect(formatIban(once)).toBe(once);
  });
});

describe('isValidBic', () => {
  it('akzeptiert 8 und 11 Stellen', () => {
    expect(isValidBic('BYLADEM1001')).toBe(true);
    expect(isValidBic('DEUTDEFF')).toBe(true);
    expect(isValidBic('deutdeff')).toBe(true);
  });

  it('lehnt andere Längen und Zeichen ab', () => {
    expect(isValidBic('DEUTDEF')).toBe(false);
    expect(isValidBic('DEUTDEFF1')).toBe(false);
    expect(isValidBic('1234DEFF')).toBe(false);
  });
});

describe('isPlausibleVatId', () => {
  it('akzeptiert gängige Schreibweisen', () => {
    expect(isPlausibleVatId('DE123456789')).toBe(true);
    expect(isPlausibleVatId('ATU12345678')).toBe(true);
    expect(isPlausibleVatId('DE 123 456 789')).toBe(true);
  });

  it('lehnt Angaben ohne Ländercode ab', () => {
    expect(isPlausibleVatId('123456789')).toBe(false);
    expect(isPlausibleVatId('')).toBe(false);
  });
});
