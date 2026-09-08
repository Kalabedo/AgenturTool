/**
 * Zentrale Sammlung der Query-Schlüssel.
 *
 * An einer Stelle, damit ein Aufruf zum Invalidieren nicht daran scheitert,
 * dass der Schlüssel woanders minimal anders geschrieben wurde.
 */
export const queryKeys = {
  health: ['health'] as const,
  company: ['company'] as const,
  templateSettings: ['template-settings'] as const,
  customers: {
    all: ['customers'] as const,
    list: (search: string, archived: string) => ['customers', 'list', search, archived] as const,
    byId: (id: number) => ['customers', 'detail', id] as const,
  },
  taxProfiles: {
    all: ['tax-profiles'] as const,
    list: (includeArchived: boolean) => ['tax-profiles', 'list', includeArchived] as const,
    byId: (id: number) => ['tax-profiles', 'detail', id] as const,
  },
  invoices: {
    all: ['invoices'] as const,
    // Die vollständige Abfragezeichenkette als Schlüssel: Filter, Sortierung
    // und Seite stecken darin, und jede Kombination bekommt so ihren eigenen
    // Zwischenspeicher.
    list: (queryString: string) => ['invoices', 'list', queryString] as const,
    byId: (id: number) => ['invoices', 'detail', id] as const,
  },
};
