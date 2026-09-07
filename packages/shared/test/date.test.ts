import { describe, expect, it } from 'vitest';
import {
  addDays,
  compareIsoDates,
  formatDateDe,
  isValidIsoDate,
  isoDateSchema,
  toIsoDate,
  todayIso,
  yearOf,
} from '../src/date.js';

describe('isValidIsoDate', () => {
  it('akzeptiert gültige Kalenderdaten', () => {
    expect(isValidIsoDate('2026-12-31')).toBe(true);
    expect(isValidIsoDate('2026-01-01')).toBe(true);
    // Schaltjahr
    expect(isValidIsoDate('2024-02-29')).toBe(true);
  });

  it('lehnt Daten ab, die es nicht gibt', () => {
    // Diese erfüllen das Muster, existieren aber nicht — genau der Fall,
    // den eine reine Formatprüfung durchlassen würde.
    expect(isValidIsoDate('2026-02-31')).toBe(false);
    expect(isValidIsoDate('2026-13-01')).toBe(false);
    expect(isValidIsoDate('2026-00-10')).toBe(false);
    expect(isValidIsoDate('2026-04-31')).toBe(false);
    // Kein Schaltjahr
    expect(isValidIsoDate('2026-02-29')).toBe(false);
  });

  it('lehnt falsche Formate ab', () => {
    expect(isValidIsoDate('31.12.2026')).toBe(false);
    expect(isValidIsoDate('2026-1-1')).toBe(false);
    expect(isValidIsoDate('2026/12/31')).toBe(false);
    expect(isValidIsoDate('2026-12-31T00:00:00Z')).toBe(false);
    expect(isValidIsoDate('')).toBe(false);
  });
});

describe('isoDateSchema', () => {
  it('parst gültige Daten', () => {
    expect(isoDateSchema.parse('2026-12-31')).toBe('2026-12-31');
  });

  it('wirft bei ungültigen Daten', () => {
    expect(() => isoDateSchema.parse('2026-02-31')).toThrow();
    expect(() => isoDateSchema.parse('31.12.2026')).toThrow();
  });
});

describe('toIsoDate', () => {
  it('wirft mit sprechender Meldung', () => {
    expect(() => toIsoDate('2026-02-31')).toThrow(/Ungültiges Kalenderdatum/);
  });
});

describe('addDays', () => {
  it('rechnet über Monats- und Jahresgrenzen', () => {
    expect(addDays(toIsoDate('2026-12-31'), 1)).toBe('2027-01-01');
    expect(addDays(toIsoDate('2026-01-31'), 1)).toBe('2026-02-01');
    expect(addDays(toIsoDate('2026-01-01'), -1)).toBe('2025-12-31');
  });

  it('trifft das übliche Zahlungsziel', () => {
    expect(addDays(toIsoDate('2026-03-15'), 14)).toBe('2026-03-29');
  });

  it('läuft nicht in Sommerzeit-Sprünge', () => {
    // Ende März wechselt Deutschland auf Sommerzeit. Mit lokaler Zeitrechnung
    // käme hier je nach Umgebung ein Tag zu wenig heraus.
    expect(addDays(toIsoDate('2026-03-28'), 1)).toBe('2026-03-29');
    expect(addDays(toIsoDate('2026-10-24'), 1)).toBe('2026-10-25');
  });
});

describe('yearOf', () => {
  it('liefert das Jahr für die Nummernsequenz', () => {
    // Entscheidend für den Jahreswechsel: Die Sequenz richtet sich nach dem
    // Rechnungsdatum, nicht nach dem Zeitpunkt des Finalisierens.
    expect(yearOf(toIsoDate('2026-12-31'))).toBe(2026);
    expect(yearOf(toIsoDate('2027-01-01'))).toBe(2027);
  });
});

describe('compareIsoDates', () => {
  it('sortiert chronologisch', () => {
    const dates = ['2026-12-31', '2026-01-05', '2025-07-14'].map(toIsoDate);
    expect([...dates].sort(compareIsoDates)).toEqual(['2025-07-14', '2026-01-05', '2026-12-31']);
  });
});

describe('formatDateDe', () => {
  it('stellt deutsch dar', () => {
    expect(formatDateDe(toIsoDate('2026-12-31'))).toBe('31.12.2026');
    expect(formatDateDe(toIsoDate('2026-01-05'))).toBe('05.01.2026');
  });
});

describe('todayIso', () => {
  it('liefert den lokalen Kalendertag', () => {
    // Spät am Abend lokaler Zeit ist es in UTC bereits der Folgetag. Der
    // Benutzer erwartet trotzdem das Datum von seiner Uhr.
    const lateEvening = new Date(2026, 11, 31, 23, 30, 0);
    expect(todayIso(lateEvening)).toBe('2026-12-31');
  });
});
