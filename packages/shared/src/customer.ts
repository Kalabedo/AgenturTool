import { z } from 'zod';
import { isPlausibleVatId } from './banking.js';
import { ELECTRONIC_ADDRESS_SCHEME_VALUES } from './einvoice/codes.js';

/**
 * Verträge für die Kundenverwaltung.
 *
 * Anders als bei den eigenen Firmendaten ist hier ein Feld wirklich
 * verpflichtend: Ohne Namen ließe sich ein Kunde in keiner Liste
 * unterscheiden. Alles Weitere darf fehlen — Adressen ergänzt man oft erst,
 * wenn die erste Rechnung ansteht. Die Vollständigkeit prüft dann das
 * Finalisieren.
 */

const optionalText = z
  .string()
  .trim()
  .transform((value) => (value === '' ? null : value))
  .nullable();

const optionalEmail = optionalText.refine(
  (value) => value === null || z.string().email().safeParse(value).success,
  { message: 'Keine gültige E-Mail-Adresse' },
);

const optionalVatId = optionalText.refine((value) => value === null || isPlausibleVatId(value), {
  message: 'Die USt-IdNr. beginnt mit dem Ländercode, z. B. DE123456789',
});

/**
 * Zahlungsziel, das vom Wert aus den Firmendaten abweicht.
 *
 * Leer bedeutet ausdrücklich "Vorgabe des Unternehmens verwenden", nicht
 * "null Tage" — deshalb hier null statt einer Zahl.
 */
const optionalPaymentTermDays = z
  .union([z.string().trim(), z.number(), z.null()])
  .transform((value, ctx) => {
    if (value === null || value === '') return null;
    const parsed = typeof value === 'number' ? value : Number(value);
    if (!Number.isInteger(parsed) || parsed < 0 || parsed > 365) {
      ctx.addIssue({
        code: z.ZodIssueCode.custom,
        message: 'Bitte eine ganze Zahl zwischen 0 und 365 angeben oder das Feld leer lassen',
      });
      return z.NEVER;
    }
    return parsed;
  });

/**
 * Fremdschlüssel aus einem Auswahlfeld.
 *
 * Ein `<select>` liefert bei "keine Auswahl" den leeren String, nicht null —
 * ohne diese Umwandlung käme im Backend NaN an.
 */
const optionalReference = z
  .union([z.string().trim(), z.number(), z.null()])
  .transform((value, ctx) => {
    if (value === null || value === '') return null;
    const parsed = typeof value === 'number' ? value : Number(value);
    if (!Number.isInteger(parsed) || parsed < 1) {
      ctx.addIssue({ code: z.ZodIssueCode.custom, message: 'Ungültige Auswahl' });
      return z.NEVER;
    }
    return parsed;
  });

/** Schema der elektronischen Adresse des Käufers (BT-49-1). */
const optionalElectronicAddressScheme = optionalText.refine(
  (value) =>
    value === null || (ELECTRONIC_ADDRESS_SCHEME_VALUES as readonly string[]).includes(value),
  { message: 'Unbekanntes Schema der elektronischen Adresse' },
);

export const customerInputSchema = z.object({
  // Frei vergeben und optional; die Eindeutigkeit erzwingt die Datenbank,
  // damit auch übernommene Nummern aus einem Vorsystem passen (D22).
  customerNumber: optionalText,

  companyName: z.string().trim().min(1, 'Bitte einen Firmennamen oder Namen angeben').max(200),
  contactName: optionalText,
  /** Zusatzzeile über der Anschrift, z. B. "z. Hd. Frau Müller". */
  addressLine: optionalText,

  street: z.string().trim().max(200),
  postalCode: z.string().trim().max(20),
  city: z.string().trim().max(120),
  country: z.string().trim().max(80),

  email: optionalEmail,
  vatId: optionalVatId,

  /**
   * BT-10: Referenz des Käufers. In XRechnung ein Pflichtfeld; öffentliche
   * Auftraggeber vergeben dafür eine Leitweg-ID.
   */
  buyerReference: optionalText.optional().default(null),
  /** BT-49: elektronische Adresse des Käufers. */
  electronicAddress: optionalText.optional().default(null),
  electronicAddressScheme: optionalElectronicAddressScheme.optional().default(null),

  /** Interne Notiz, erscheint nicht auf der Rechnung. */
  notes: optionalText,

  defaultPaymentTermDays: optionalPaymentTermDays,

  /**
   * Vorgeschlagenes Steuerprofil für Rechnungen an diesen Kunden.
   * Leer bedeutet: das Standardprofil verwenden.
   */
  defaultTaxProfileId: optionalReference,
});
export type CustomerInput = z.input<typeof customerInputSchema>;
export type CustomerPayload = z.output<typeof customerInputSchema>;

export const customerResponseSchema = customerInputSchema.extend({
  id: z.number().int(),
  /** Gesetzt, wenn der Kunde archiviert wurde; sonst null. */
  archivedAt: z.string().nullable(),
  /** Anzahl der Rechnungen — entscheidet, ob endgültiges Löschen erlaubt ist. */
  invoiceCount: z.number().int(),
  createdAt: z.string(),
  updatedAt: z.string(),
});
export type CustomerResponse = z.infer<typeof customerResponseSchema>;

export const CUSTOMER_ARCHIVE_FILTER = {
  ACTIVE: 'active',
  ARCHIVED: 'archived',
  ALL: 'all',
} as const;
export type CustomerArchiveFilter =
  (typeof CUSTOMER_ARCHIVE_FILTER)[keyof typeof CUSTOMER_ARCHIVE_FILTER];

export const customerListQuerySchema = z.object({
  /** Freitextsuche über Name, Ansprechpartner, Ort, Kundennummer und E-Mail. */
  q: z.string().trim().max(200).optional(),
  archived: z
    .enum([
      CUSTOMER_ARCHIVE_FILTER.ACTIVE,
      CUSTOMER_ARCHIVE_FILTER.ARCHIVED,
      CUSTOMER_ARCHIVE_FILTER.ALL,
    ])
    .default(CUSTOMER_ARCHIVE_FILTER.ACTIVE),
});
export type CustomerListQuery = z.output<typeof customerListQuerySchema>;

/**
 * Baut die Anschrift so zusammen, wie sie auf der Rechnung erscheint.
 *
 * Geteilt, damit Kundenliste, Rechnungsformular und Template dieselbe
 * Darstellung zeigen. Leere Zeilen fallen weg, sonst entstünden Lücken im
 * Adressblock.
 */
export function formatCustomerAddress(customer: {
  companyName: string;
  contactName?: string | null;
  addressLine?: string | null;
  street?: string | null;
  postalCode?: string | null;
  city?: string | null;
  country?: string | null;
}): string[] {
  const postalAndCity = [customer.postalCode, customer.city]
    .filter((part) => (part ?? '').trim() !== '')
    .join(' ');

  return [
    customer.companyName,
    customer.contactName,
    customer.addressLine,
    customer.street,
    postalAndCity,
    customer.country,
  ]
    .map((line) => (line ?? '').trim())
    .filter((line) => line !== '');
}

/** Kurzform für Listen: "10115 Berlin" oder nur der Ort. */
export function formatCustomerLocation(customer: {
  postalCode?: string | null;
  city?: string | null;
}): string {
  return [customer.postalCode, customer.city]
    .map((part) => (part ?? '').trim())
    .filter((part) => part !== '')
    .join(' ');
}
