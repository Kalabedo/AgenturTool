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
  /** Per SMTP verschickt; der Server hat die Nachricht angenommen. */
  MAIL_SENT: 'MAIL_SENT',
  /** An die lokale Mail-Anwendung übergeben — ob sie abging, weiß nur der Benutzer. */
  MAIL_PREPARED: 'MAIL_PREPARED',
} as const;
export type InvoiceEventType = (typeof INVOICE_EVENT_TYPE)[keyof typeof INVOICE_EVENT_TYPE];
export const INVOICE_EVENT_TYPE_VALUES = Object.values(INVOICE_EVENT_TYPE);

/** Scope der Nummernsequenz. Storno teilt sich die Sequenz mit Rechnungen (D10). */
export const NUMBER_SEQUENCE_SCOPE = {
  INVOICE: 'INVOICE',
} as const;
export type NumberSequenceScope =
  (typeof NUMBER_SEQUENCE_SCOPE)[keyof typeof NUMBER_SEQUENCE_SCOPE];

/**
 * Auf welchem Weg eine E-Rechnung das Haus verlässt.
 *
 * `NONE` ist die Vorbelegung und keine Verlegenheitslösung: Solange nichts
 * eingerichtet ist, greift die Anwendung nicht nach außen (D45). Die beiden
 * anderen Werte unterscheiden sich in dem, was sie zusagen können —
 * `SMTP` weiß, dass der Server die Nachricht angenommen hat, `MAIL_APP`
 * weiß nur, dass ein Entwurf übergeben wurde.
 */
export const MAIL_TRANSPORT = {
  NONE: 'NONE',
  SMTP: 'SMTP',
  MAIL_APP: 'MAIL_APP',
} as const;
export type MailTransport = (typeof MAIL_TRANSPORT)[keyof typeof MAIL_TRANSPORT];
export const MAIL_TRANSPORT_VALUES = Object.values(MAIL_TRANSPORT);

/** Wie die Verbindung zum SMTP-Server verschlüsselt wird. */
export const MAIL_SECURITY = {
  /** Klartextverbindung, die per STARTTLS hochgestuft wird — der Regelfall auf Port 587. */
  STARTTLS: 'STARTTLS',
  /** Verschlüsselt ab der ersten Verbindung — der Regelfall auf Port 465. */
  TLS: 'TLS',
  /** Ohne Verschlüsselung. Nur für einen Mailserver auf derselben Maschine. */
  NONE: 'NONE',
} as const;
export type MailSecurity = (typeof MAIL_SECURITY)[keyof typeof MAIL_SECURITY];
export const MAIL_SECURITY_VALUES = Object.values(MAIL_SECURITY);

/**
 * Die Anlässe, für die es eine Textvorlage gibt.
 *
 * Ein fester Satz und keine frei anlegbare Vorlagenverwaltung: Es gibt drei
 * Dinge, die dieses Programm verschickt, und für jedes davon genau einen
 * Text, den man bearbeiten kann. Alles darüber hinaus wäre Verwaltung von
 * Verwaltung.
 */
export const MAIL_TEMPLATE_KEY = {
  INVOICE: 'INVOICE',
  CANCELLATION: 'CANCELLATION',
  TIME_REPORT: 'TIME_REPORT',
} as const;
export type MailTemplateKey = (typeof MAIL_TEMPLATE_KEY)[keyof typeof MAIL_TEMPLATE_KEY];
export const MAIL_TEMPLATE_KEY_VALUES = Object.values(MAIL_TEMPLATE_KEY);

/** Was sich an eine Nachricht hängen lässt. */
export const MAIL_ATTACHMENT_KIND = {
  INVOICE_PDF: 'INVOICE_PDF',
  INVOICE_XML: 'INVOICE_XML',
  TIME_REPORT: 'TIME_REPORT',
} as const;
export type MailAttachmentKind = (typeof MAIL_ATTACHMENT_KIND)[keyof typeof MAIL_ATTACHMENT_KIND];
export const MAIL_ATTACHMENT_KIND_VALUES = Object.values(MAIL_ATTACHMENT_KIND);

/**
 * Was aus einem Versandversuch geworden ist.
 *
 * `PREPARED` ist der Zustand, den es ohne den Weg über die lokale
 * Mail-Anwendung nicht gäbe: Der Entwurf ist übergeben, ob er abgeschickt
 * wurde, weiß nur der Benutzer. Ihn als `SENT` zu führen wäre eine
 * Behauptung.
 */
export const MAIL_STATUS = {
  SENT: 'SENT',
  PREPARED: 'PREPARED',
  FAILED: 'FAILED',
} as const;
export type MailStatus = (typeof MAIL_STATUS)[keyof typeof MAIL_STATUS];
export const MAIL_STATUS_VALUES = Object.values(MAIL_STATUS);

/**
 * Wie die Nachricht bei der Mail-Anwendung angekommen ist.
 *
 * Der Unterschied ist für den Benutzer sichtbar und gehört deshalb in die
 * Antwort: Ein `DRAFT` steht fertig im Verfassen-Fenster und muss nur noch
 * abgeschickt werden. Bei `MESSAGE_FILE` hat das Mailprogramm eine
 * Nachrichtendatei geöffnet — je nach Programm als Entwurf oder als
 * eingegangene Nachricht, aus der ein „Weiterleiten" die Anhänge übernimmt.
 */
export const MAIL_HANDOFF_METHOD = {
  DRAFT: 'DRAFT',
  MESSAGE_FILE: 'MESSAGE_FILE',
} as const;
export type MailHandoffMethod = (typeof MAIL_HANDOFF_METHOD)[keyof typeof MAIL_HANDOFF_METHOD];
export const MAIL_HANDOFF_METHOD_VALUES = Object.values(MAIL_HANDOFF_METHOD);
