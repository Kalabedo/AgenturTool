import { ApiRequestError } from './apiClient.js';

/**
 * Macht aus einem beliebigen Fehler einen Satz, den man lesen kann.
 *
 * Die API liefert eigene Meldungen — die haben Vorrang. Alles andere ist ein
 * Netzwerk- oder Programmfehler, und dafür ist „TypeError: Failed to fetch"
 * keine Auskunft: Der Benutzer soll erfahren, was zu tun ist, nicht was in
 * der Konsole steht.
 */
export function messageOf(error: unknown, fallback = 'Die Anfrage ist fehlgeschlagen.'): string {
  if (error instanceof ApiRequestError) return error.message;
  if (error instanceof TypeError) {
    return 'Der Server ist gerade nicht erreichbar. Läuft er noch?';
  }
  if (error instanceof Error && error.message !== '') return error.message;
  return fallback;
}

/**
 * Ob der Server den Datensatz nicht kennt — im Unterschied zu „Server weg".
 *
 * Der Unterschied ist für den Benutzer wesentlich: „Dieser Kunde wurde nicht
 * gefunden" bei einem abgestürzten Server schickt ihn auf die falsche Fährte
 * und lässt ihn womöglich einen Datensatz für gelöscht halten, den es noch
 * gibt.
 */
export function isNotFound(error: unknown): boolean {
  return error instanceof ApiRequestError && error.status === 404;
}

/** Die Feldfehler aus einer abgelehnten Anfrage, sofern die API welche nennt. */
export function fieldErrorsOf(error: unknown): Record<string, string> | undefined {
  return error instanceof ApiRequestError ? error.fieldErrors() : undefined;
}

/**
 * Die Meldung, die über oder neben dem Absenden-Knopf steht.
 *
 * Sie ist `null`, solange nichts schiefging. Nennt die API einzelne Felder,
 * stehen deren Meldungen schon an den Feldern — hier bleibt dann nur der
 * Hinweis, wohin zu schauen ist. Wichtig ist der letzte Fall: Ein
 * Netzwerkfehler ist kein ApiRequestError, und ohne ihn sähe ein
 * fehlgeschlagenes Speichern bei abgestürztem Server aus wie gar nichts.
 */
export function formErrorOf(error: unknown): string | null {
  if (error === null || error === undefined) return null;

  if (error instanceof ApiRequestError && Object.keys(error.fieldErrors()).length > 0) {
    return 'Bitte die markierten Felder prüfen.';
  }
  return messageOf(error, 'Speichern fehlgeschlagen.');
}
