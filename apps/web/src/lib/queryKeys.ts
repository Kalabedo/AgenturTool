/**
 * Zentrale Sammlung der Query-Schlüssel.
 *
 * An einer Stelle, damit ein Aufruf zum Invalidieren nicht daran scheitert,
 * dass der Schlüssel woanders minimal anders geschrieben wurde.
 */
export const queryKeys = {
  health: ['health'] as const,
  company: ['company'] as const,
  customers: {
    all: ['customers'] as const,
    list: (search: string, archived: string) => ['customers', 'list', search, archived] as const,
    byId: (id: number) => ['customers', 'detail', id] as const,
  },
};
