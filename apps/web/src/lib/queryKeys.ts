/**
 * Zentrale Sammlung der Query-Schlüssel.
 *
 * An einer Stelle, damit ein Aufruf zum Invalidieren nicht daran scheitert,
 * dass der Schlüssel woanders minimal anders geschrieben wurde.
 */
export const queryKeys = {
  health: ['health'] as const,
  authSession: ['auth', 'session'] as const,
  company: ['company'] as const,
  templateSettings: ['template-settings'] as const,
  backup: ['backup'] as const,
  appUpdate: ['app', 'update'] as const,
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
  timeEntries: {
    all: ['time-entries'] as const,
    // Zeitraum und Kundenfilter stecken in der Abfragezeichenkette; jede
    // Kombination bekommt so ihren eigenen Zwischenspeicher.
    list: (queryString: string) => ['time-entries', 'list', queryString] as const,
    /** Die offenen Zeiten je Kunde — die Reiterleiste. */
    openSummary: ['time-entries', 'open-summary'] as const,
  },
  invoices: {
    all: ['invoices'] as const,
    // Die vollständige Abfragezeichenkette als Schlüssel: Filter, Sortierung
    // und Seite stecken darin, und jede Kombination bekommt so ihren eigenen
    // Zwischenspeicher.
    list: (queryString: string) => ['invoices', 'list', queryString] as const,
    byId: (id: number) => ['invoices', 'detail', id] as const,
    einvoiceStatus: (id: number) => ['invoices', 'detail', id, 'einvoice'] as const,
    rebillPreview: (id: number) => ['invoices', 'detail', id, 'rebill-preview'] as const,
  },
  mail: {
    all: ['mail'] as const,
    settings: ['mail', 'settings'] as const,
    templates: ['mail', 'templates'] as const,
    // Der Entwurf hängt an der Quelle — Rechnung oder Zeitraum —, und die
    // steckt vollständig in dieser Zeichenkette.
    draft: (source: string) => ['mail', 'draft', source] as const,
    messages: (queryString: string) => ['mail', 'messages', queryString] as const,
  },
};
