import { z } from 'zod';
import { isValidBic, isValidIban, isPlausibleVatId } from './banking.js';

/**
 * Verträge für die eigenen Unternehmensdaten.
 *
 * Grundsatz für die Pflichtfelder: Beim Speichern ist fast alles optional.
 * Die Firmendaten werden über Wochen ergänzt, und ein halb ausgefülltes
 * Formular muss sich zwischenspeichern lassen. Die Vollständigkeit nach
 * § 14 UStG wird erst beim Finalisieren einer Rechnung geprüft (Schritt 9) —
 * dort, wo sie tatsächlich gebraucht wird, und mit einer verständlichen
 * Liste dessen, was fehlt.
 */

/** Leerer String aus einem Formular wird zu null, nicht zu "". */
const optionalText = z
  .string()
  .trim()
  .transform((value) => (value === '' ? null : value))
  .nullable();

const optionalIban = optionalText.refine((value) => value === null || isValidIban(value), {
  message: 'Die IBAN ist ungültig (Prüfsumme stimmt nicht)',
});

const optionalBic = optionalText.refine((value) => value === null || isValidBic(value), {
  message: 'Der BIC muss 8 oder 11 Stellen haben',
});

const optionalVatId = optionalText.refine((value) => value === null || isPlausibleVatId(value), {
  message: 'Die USt-IdNr. beginnt mit dem Ländercode, z. B. DE123456789',
});

const optionalEmail = optionalText.refine(
  (value) => value === null || z.string().email().safeParse(value).success,
  { message: 'Keine gültige E-Mail-Adresse' },
);

/**
 * Zahlungsziel in Tagen.
 *
 * Nimmt String (aus dem Formular) und Zahl (aus einem API-Aufruf) an.
 * Bewusst nicht `z.coerce.number()`: Das macht aus einem leeren Feld
 * klaglos die Zahl 0 — wer das Feld versehentlich leert, hätte dann ein
 * Zahlungsziel von null Tagen, ohne eine Fehlermeldung zu sehen.
 */
const paymentTermDays = z.union([z.string().trim(), z.number()]).transform((value, ctx) => {
  const parsed = typeof value === 'number' ? value : value === '' ? Number.NaN : Number(value);
  if (!Number.isInteger(parsed) || parsed < 0 || parsed > 365) {
    ctx.addIssue({
      code: z.ZodIssueCode.custom,
      message: 'Bitte eine ganze Zahl zwischen 0 und 365 angeben',
    });
    return z.NEVER;
  }
  return parsed;
});

const optionalUrl = optionalText.refine(
  (value) => value === null || /^(https?:\/\/)?[\w.-]+\.[a-z]{2,}(\/.*)?$/i.test(value),
  { message: 'Keine gültige Web-Adresse' },
);

export const updateCompanySchema = z.object({
  companyName: z.string().trim().max(200),
  street: z.string().trim().max(200),
  postalCode: z.string().trim().max(20),
  city: z.string().trim().max(120),
  // Kein fester Ländercode-Katalog: Das Feld erscheint als Freitext auf der
  // Rechnung und muss auch "Schweiz" oder "United Kingdom" aufnehmen können.
  country: z.string().trim().max(80),

  email: optionalEmail,
  website: optionalUrl,
  phone: optionalText,

  vatId: optionalVatId,
  taxNumber: optionalText,

  bankAccountHolder: optionalText,
  iban: optionalIban,
  bic: optionalBic,
  bankName: optionalText,

  defaultPaymentTermDays: paymentTermDays,
});
export type UpdateCompanyInput = z.input<typeof updateCompanySchema>;
export type UpdateCompanyPayload = z.output<typeof updateCompanySchema>;

export const companyResponseSchema = updateCompanySchema.extend({
  defaultPaymentTermDays: z.number().int(),
  id: z.number().int(),
  logoAssetId: z.number().int().nullable(),
  /** Relative API-URL des Logos, oder null. Erspart dem Frontend das Basteln. */
  logoUrl: z.string().nullable(),
  updatedAt: z.string(),
});
export type CompanyResponse = z.infer<typeof companyResponseSchema>;

/**
 * Felder, die eine Rechnung nach § 14 UStG zwingend braucht.
 *
 * Wird hier nur benannt, nicht erzwungen — die Prüfung passiert beim
 * Finalisieren. Frontend und Backend teilen sich die Liste, damit die
 * Einstellungsseite schon vorher darauf hinweisen kann, was noch fehlt.
 */
export const COMPANY_FIELDS_REQUIRED_FOR_INVOICING = [
  'companyName',
  'street',
  'postalCode',
  'city',
] as const;

/**
 * Zusätzlich muss mindestens eine steuerliche Kennung vorhanden sein —
 * Steuernummer oder USt-IdNr., nicht zwingend beide.
 */
export function missingCompanyFieldsForInvoicing(
  company: Pick<
    CompanyResponse,
    'companyName' | 'street' | 'postalCode' | 'city' | 'vatId' | 'taxNumber'
  >,
): string[] {
  const missing = COMPANY_FIELDS_REQUIRED_FOR_INVOICING.filter(
    (field) => (company[field] ?? '').trim() === '',
  ) as string[];

  if ((company.vatId ?? '') === '' && (company.taxNumber ?? '') === '') {
    missing.push('vatIdOrTaxNumber');
  }

  return missing;
}

/** Menschenlesbare Bezeichnungen, geteilt für Fehlermeldungen und Formular. */
export const COMPANY_FIELD_LABELS: Record<string, string> = {
  companyName: 'Firmenname',
  street: 'Straße',
  postalCode: 'PLZ',
  city: 'Ort',
  country: 'Land',
  email: 'E-Mail',
  website: 'Website',
  phone: 'Telefon',
  vatId: 'USt-IdNr.',
  taxNumber: 'Steuernummer',
  vatIdOrTaxNumber: 'USt-IdNr. oder Steuernummer',
  bankAccountHolder: 'Kontoinhaber',
  iban: 'IBAN',
  bic: 'BIC',
  bankName: 'Bank',
  defaultPaymentTermDays: 'Zahlungsziel in Tagen',
};
