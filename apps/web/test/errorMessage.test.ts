import { describe, expect, it } from 'vitest';
import { ApiRequestError } from '../src/lib/apiClient';
import { fieldErrorsOf, formErrorOf, isNotFound, messageOf } from '../src/lib/errorMessage';

describe('messageOf', () => {
  it('nimmt die Meldung der API, wenn es eine gibt', () => {
    const error = new ApiRequestError('CONFLICT', 'Die Nummer ist schon vergeben.', 409);
    expect(messageOf(error)).toBe('Die Nummer ist schon vergeben.');
  });

  it('macht aus einem abgerissenen fetch einen verständlichen Satz', () => {
    // Genau das wirft der Browser, wenn der Server nicht läuft — „Failed to
    // fetch" wäre für den Benutzer keine Auskunft.
    expect(messageOf(new TypeError('Failed to fetch'))).toContain('nicht erreichbar');
  });

  it('fällt auf den mitgegebenen Text zurück', () => {
    expect(messageOf(undefined, 'Nichts geklappt.')).toBe('Nichts geklappt.');
  });
});

describe('formErrorOf', () => {
  it('schweigt, solange nichts schiefging', () => {
    expect(formErrorOf(null)).toBeNull();
    expect(formErrorOf(undefined)).toBeNull();
  });

  it('verweist auf die Felder, wenn die API einzelne nennt', () => {
    const error = new ApiRequestError('VALIDATION_FAILED', 'Ungültig.', 400, [
      { field: 'companyName', message: 'Pflichtangabe' },
    ]);
    expect(formErrorOf(error)).toBe('Bitte die markierten Felder prüfen.');
    expect(fieldErrorsOf(error)).toEqual({ companyName: 'Pflichtangabe' });
  });

  it('zeigt einen Netzwerkfehler an, statt ihn zu verschlucken', () => {
    // Der Fehler, der vorher unsichtbar blieb: Ohne ApiRequestError stand
    // am Formular nichts, und ein Klick auf „Speichern" sah aus wie nichts.
    expect(formErrorOf(new TypeError('Failed to fetch'))).toContain('nicht erreichbar');
  });
});

describe('isNotFound', () => {
  it('trennt „gibt es nicht" von „geht gerade nicht"', () => {
    expect(isNotFound(new ApiRequestError('NOT_FOUND', 'weg', 404))).toBe(true);
    expect(isNotFound(new ApiRequestError('INTERNAL_ERROR', 'kaputt', 500))).toBe(false);
    expect(isNotFound(new TypeError('Failed to fetch'))).toBe(false);
  });
});
