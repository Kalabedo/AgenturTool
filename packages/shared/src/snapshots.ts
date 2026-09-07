import { z } from 'zod';
import { isoDateSchema } from './date.js';
import { DOCUMENT_TYPE_VALUES, TAX_PROFILE_KIND_VALUES } from './enums.js';

/**
 * Snapshots einer finalisierten Rechnung.
 *
 * Prisma kennt auf SQLite keinen Json-Typ, deshalb liegen diese Strukturen
 * als TEXT in der Datenbank. Das ist kein Nachteil: Beim Lesen werden sie
 * hier validiert, statt als unstrukturiertes `any` in die Anwendung zu
 * gelangen.
 *
 * `snapshotVersion` erlaubt es, das Format später zu ändern, ohne alte
 * Rechnungen unlesbar zu machen — beim Lesen wird nach Version verzweigt.
 */

export const CURRENT_SNAPSHOT_VERSION = 1;

const versioned = { snapshotVersion: z.literal(CURRENT_SNAPSHOT_VERSION) };

const addressSchema = z.object({
  street: z.string(),
  postalCode: z.string(),
  city: z.string(),
  country: z.string(),
});

/**
 * Eigene Firmendaten zum Ausstellungszeitpunkt, inklusive Bankverbindung.
 * Eine später geänderte IBAN darf alte Rechnungen nicht verändern.
 */
export const sellerSnapshotSchema = z.object({
  ...versioned,
  companyName: z.string(),
  address: addressSchema,
  email: z.string().nullable(),
  website: z.string().nullable(),
  phone: z.string().nullable(),
  vatId: z.string().nullable(),
  taxNumber: z.string().nullable(),
  bankAccountHolder: z.string().nullable(),
  iban: z.string().nullable(),
  bic: z.string().nullable(),
  bankName: z.string().nullable(),
  /** Data-URI oder Asset-Pfad des Logos zum Ausstellungszeitpunkt. */
  logoAssetId: z.number().int().nullable(),
});
export type SellerSnapshot = z.infer<typeof sellerSnapshotSchema>;

/**
 * Empfängerdaten. Anders als die übrigen Snapshots existiert dieses Feld
 * bereits im Entwurf (D9): Beim Auswählen eines Kunden werden die Daten
 * kopiert und bleiben dort einmalig änderbar. Ab ISSUED ist es gesperrt.
 */
export const buyerDataSchema = z.object({
  ...versioned,
  companyName: z.string(),
  contactName: z.string().nullable(),
  addressLine: z.string().nullable(),
  address: addressSchema,
  email: z.string().nullable(),
  vatId: z.string().nullable(),
  customerNumber: z.string().nullable(),
});
export type BuyerData = z.infer<typeof buyerDataSchema>;

/** Steuerprofil samt Hinweistext, wie er auf dem Dokument stand. */
export const taxSnapshotSchema = z.object({
  ...versioned,
  profileName: z.string(),
  kind: z.enum(TAX_PROFILE_KIND_VALUES as [string, ...string[]]),
  defaultRateBasisPoints: z.number().int(),
  noteText: z.string().nullable(),
  showTaxColumn: z.boolean(),
});
export type TaxSnapshot = z.infer<typeof taxSnapshotSchema>;

/**
 * Template-Einstellungen. Der `templateKey` sorgt dafür, dass eine alte
 * Rechnung auch dann noch identisch gerendert werden kann, wenn längst ein
 * anderes Template die Voreinstellung ist.
 */
export const templateSnapshotSchema = z.object({
  ...versioned,
  templateKey: z.string(),
  accentColor: z.string(),
  fontFamily: z.string(),
  logoWidthMm: z.number(),
  footerText: z.string().nullable(),
  paymentNote: z.string().nullable(),
  closingNote: z.string().nullable(),
});
export type TemplateSnapshot = z.infer<typeof templateSnapshotSchema>;

/** Ein Steuersatz mit dem darauf entfallenden Netto- und Steuerbetrag. */
export const taxGroupSchema = z.object({
  rateBasisPoints: z.number().int(),
  netCents: z.number().int(),
  taxCents: z.number().int(),
});
export type TaxGroup = z.infer<typeof taxGroupSchema>;

/**
 * Eingefrorene Summen. Damit liefert eine alte Rechnung auch dann dieselben
 * Beträge, wenn sich die Berechnungsfunktion später ändern sollte.
 */
export const totalsSnapshotSchema = z.object({
  ...versioned,
  netCents: z.number().int(),
  taxCents: z.number().int(),
  grossCents: z.number().int(),
  totalDiscountCents: z.number().int(),
  taxGroups: z.array(taxGroupSchema),
});
export type TotalsSnapshot = z.infer<typeof totalsSnapshotSchema>;

/** Metadaten eines Verlaufseintrags. Bewusst offen, aber typisiert eingelesen. */
export const invoiceEventMetadataSchema = z.object({
  releasedNumber: z.string().optional(),
  assignedNumber: z.string().optional(),
  documentType: z.enum(DOCUMENT_TYPE_VALUES as [string, ...string[]]).optional(),
  paidAt: isoDateSchema.nullable().optional(),
  note: z.string().optional(),
});
export type InvoiceEventMetadata = z.infer<typeof invoiceEventMetadataSchema>;
