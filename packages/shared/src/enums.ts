/**
 * Domänen-Enums.
 *
 * Prisma unterstützt auf SQLite keine `enum`-Typen. Diese Objekte sind
 * deshalb die einzige Quelle der zulässigen Werte: Die Anwendung leitet
 * ihre Typen daraus ab, und die CHECK-Constraints in der Migration führen
 * exakt dieselben Zeichenketten auf.
 *
 * Wer hier einen Wert ergänzt, muss die zugehörige Migration nachziehen.
 */

export const INVOICE_STATUS = {
  DRAFT: 'DRAFT',
  ISSUED: 'ISSUED',
  PAID: 'PAID',
  CANCELLED: 'CANCELLED',
} as const;
export type InvoiceStatus = (typeof INVOICE_STATUS)[keyof typeof INVOICE_STATUS];
export const INVOICE_STATUS_VALUES = Object.values(INVOICE_STATUS);

export const DOCUMENT_TYPE = {
  INVOICE: 'INVOICE',
  CANCELLATION: 'CANCELLATION',
} as const;
export type DocumentType = (typeof DOCUMENT_TYPE)[keyof typeof DOCUMENT_TYPE];
export const DOCUMENT_TYPE_VALUES = Object.values(DOCUMENT_TYPE);

export const TAX_PROFILE_KIND = {
  /** Normaler Steuerausweis mit dem hinterlegten Satz. */
  STANDARD: 'STANDARD',
  /** Steuerfrei, Satz wird auf 0 gezwungen. */
  ZERO_RATED: 'ZERO_RATED',
  /** Reverse Charge: Satz 0, Hinweistext verpflichtend, USt-IDs beider Seiten nötig. */
  REVERSE_CHARGE: 'REVERSE_CHARGE',
  /** Kleinunternehmerregelung: Satz 0, Hinweistext, keine Steuerspalte. */
  SMALL_BUSINESS: 'SMALL_BUSINESS',
} as const;
export type TaxProfileKind = (typeof TAX_PROFILE_KIND)[keyof typeof TAX_PROFILE_KIND];
export const TAX_PROFILE_KIND_VALUES = Object.values(TAX_PROFILE_KIND);

/** Steuerprofile, die den Satz zwingend auf 0 setzen. */
export const ZERO_TAX_KINDS: readonly TaxProfileKind[] = [
  TAX_PROFILE_KIND.ZERO_RATED,
  TAX_PROFILE_KIND.REVERSE_CHARGE,
  TAX_PROFILE_KIND.SMALL_BUSINESS,
];

/**
 * Art eines abgelegten Dokuments.
 *
 * Dieselbe Ablage trägt beide Ausgaben einer Rechnung: das PDF fürs Auge
 * und die XML-Datei für die Maschine. Unterschieden werden sie über diese
 * Kennung — und über die Dateiendung, weshalb der Unique-Index auf `path`
 * weiterhin trägt.
 */
export const DOCUMENT_KIND = {
  PDF: 'PDF',
  XML: 'XML',
} as const;
export type DocumentKind = (typeof DOCUMENT_KIND)[keyof typeof DOCUMENT_KIND];
export const DOCUMENT_KIND_VALUES = Object.values(DOCUMENT_KIND);

/** Dateiendung je Art. */
export const DOCUMENT_KIND_EXTENSION: Record<DocumentKind, string> = {
  [DOCUMENT_KIND.PDF]: '.pdf',
  [DOCUMENT_KIND.XML]: '.xml',
};

export const DISCOUNT_TYPE = {
  /** Wert in Basispunkten: 12,5 % = 1250 */
  PERCENT: 'PERCENT',
  /** Wert in Cent */
  AMOUNT: 'AMOUNT',
} as const;
export type DiscountType = (typeof DISCOUNT_TYPE)[keyof typeof DISCOUNT_TYPE];
export const DISCOUNT_TYPE_VALUES = Object.values(DISCOUNT_TYPE);

export const INVOICE_EVENT_TYPE = {
  CREATED: 'CREATED',
  UPDATED: 'UPDATED',
  FINALIZED: 'FINALIZED',
  /** Finalisierung zurückgenommen; hält fest, welche Nummer freigegeben wurde. */
  UNFINALIZED: 'UNFINALIZED',
  CANCELLED: 'CANCELLED',
  PAYMENT_SET: 'PAYMENT_SET',
  PAYMENT_CLEARED: 'PAYMENT_CLEARED',
  SENT_MARKED: 'SENT_MARKED',
  PDF_REGENERATED: 'PDF_REGENERATED',
} as const;
export type InvoiceEventType = (typeof INVOICE_EVENT_TYPE)[keyof typeof INVOICE_EVENT_TYPE];
export const INVOICE_EVENT_TYPE_VALUES = Object.values(INVOICE_EVENT_TYPE);

/** Scope der Nummernsequenz. Storno teilt sich die Sequenz mit Rechnungen (D10). */
export const NUMBER_SEQUENCE_SCOPE = {
  INVOICE: 'INVOICE',
} as const;
export type NumberSequenceScope =
  (typeof NUMBER_SEQUENCE_SCOPE)[keyof typeof NUMBER_SEQUENCE_SCOPE];
