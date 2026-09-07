/**
 * Zentrale Sammlung der Query-Schlüssel.
 *
 * An einer Stelle, damit ein Aufruf zum Invalidieren nicht daran scheitert,
 * dass der Schlüssel woanders minimal anders geschrieben wurde.
 */
export const queryKeys = {
  health: ['health'] as const,
  company: ['company'] as const,
};
