import { z } from 'zod';
import { isoDateSchema } from './date.js';
import {
  ELECTRONIC_ADDRESS_SCHEME_VALUES,
  TAX_CATEGORY_CODE,
  TAX_CATEGORY_CODE_VALUES,
} from './einvoice/codes.js';
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
 *
 * ## Version 2 (E-Rechnung)
 *
 * Version 2 ergänzt die Felder, die EN 16931 verlangt und die es in
 * Version 1 nicht gab: elektronische Adressen beider Seiten, die Referenz
 * des Käufers (Leitweg-ID) und die Steuerkategorie samt Befreiungsgrund.
 *
 * Die Verzweigung steckt in `upgraded()` weiter unten und passiert **beim
 * Parsen**, nicht an den Aufrufstellen. Das ist Absicht: Es gibt drei
 * Stellen im Backend, die Snapshots einlesen, und jede einzelne hätte die
 * Verzweigung sonst selbst gebraucht — eine davon hätte man vergessen.
 *
 * Eine Version-1-Rechnung wird dabei **nicht** in der Datenbank
 * umgeschrieben. Sie wird beim Lesen aufgefüllt und bleibt auf der Platte,
 * wie sie ausgestellt wurde. Ein Snapshot ist ein Dokument; ein Dokument
 * ändert man nicht nachträglich, nur weil das Programm dazugelernt hat.
 */

export const CURRENT_SNAPSHOT_VERSION = 2;

/** Die Fassung vor der E-Rechnung. Wird gelesen, aber nicht mehr geschrieben. */
export const LEGACY_SNAPSHOT_VERSION = 1;

const versioned = { snapshotVersion: z.literal(CURRENT_SNAPSHOT_VERSION) };

/**
 * Hebt einen Version-1-Snapshot auf Version 2, bevor er validiert wird.
 *
 * `fill` liefert die Felder, die Version 1 nicht kannte. Alles andere
 * bleibt unberührt — und alles, was nicht Version 1 ist, geht unverändert
 * durch: Ein Snapshot mit einer unbekannten Version soll am Schema
 * scheitern und nicht hier still zurechtgebogen werden.
 */
function upgraded<T extends z.ZodTypeAny>(
  fill: (raw: Record<string, unknown>) => Record<string, unknown>,
  schema: T,
) {
  return z.preprocess((value) => {
    if (typeof value !== 'object' || value === null || Array.isArray(value)) return value;
    const raw = value as Record<string, unknown>;
    if (raw.snapshotVersion !== LEGACY_SNAPSHOT_VERSION) return value;
    return { ...raw, ...fill(raw), snapshotVersion: CURRENT_SNAPSHOT_VERSION };
  }, schema);
}

const addressSchema = z.object({
  street: z.string(),
  postalCode: z.string(),
  city: z.string(),
  country: z.string(),
});

const electronicAddressSchemeSchema = z
  .enum(ELECTRONIC_ADDRESS_SCHEME_VALUES as [string, ...string[]])
  .nullable();

/**
 * Eigene Firmendaten zum Ausstellungszeitpunkt, inklusive Bankverbindung.
 * Eine später geänderte IBAN darf alte Rechnungen nicht verändern.
 */
export const sellerSnapshotSchema = upgraded(
  () => ({ electronicAddress: null, electronicAddressScheme: null }),
  z.object({
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
    /** BT-34: elektronische Adresse des Verkäufers. */
    electronicAddress: z.string().nullable(),
    electronicAddressScheme: electronicAddressSchemeSchema,
    /** Data-URI oder Asset-Pfad des Logos zum Ausstellungszeitpunkt. */
    logoAssetId: z.number().int().nullable(),
  }),
);
export type SellerSnapshot = z.infer<typeof sellerSnapshotSchema>;

/**
 * Empfängerdaten. Anders als die übrigen Snapshots existiert dieses Feld
 * bereits im Entwurf (D9): Beim Auswählen eines Kunden werden die Daten
 * kopiert und bleiben dort einmalig änderbar. Ab ISSUED ist es gesperrt.
 */
export const buyerDataSchema = upgraded(
  () => ({ buyerReference: null, electronicAddress: null, electronicAddressScheme: null }),
  z.object({
    ...versioned,
    companyName: z.string(),
    contactName: z.string().nullable(),
    addressLine: z.string().nullable(),
    address: addressSchema,
    email: z.string().nullable(),
    vatId: z.string().nullable(),
    customerNumber: z.string().nullable(),
    /**
     * BT-10: Referenz des Käufers. In XRechnung ein Pflichtfeld; bei
     * öffentlichen Auftraggebern steht hier die Leitweg-ID.
     */
    buyerReference: z.string().nullable(),
    /** BT-49: elektronische Adresse des Käufers. */
    electronicAddress: z.string().nullable(),
    electronicAddressScheme: electronicAddressSchemeSchema,
  }),
);
export type BuyerData = z.infer<typeof buyerDataSchema>;

/** Steuerprofil samt Hinweistext, wie er auf dem Dokument stand. */
export const taxSnapshotSchema = upgraded(
  // Version 1 kannte keine Kategorie. `E` ist hier die einzig ehrliche
  // Vorgabe: Sie behauptet keinen Steuersatz, wo keiner ausgewiesen war,
  // und der Freitext des Profils trägt den Grund ohnehin schon.
  (raw) => ({
    taxCategoryCode:
      raw.kind === 'STANDARD' ? TAX_CATEGORY_CODE.STANDARD : TAX_CATEGORY_CODE.EXEMPT,
    exemptionReasonCode: null,
    exemptionReasonText: typeof raw.noteText === 'string' ? raw.noteText : null,
  }),
  z.object({
    ...versioned,
    profileName: z.string(),
    kind: z.enum(TAX_PROFILE_KIND_VALUES as [string, ...string[]]),
    defaultRateBasisPoints: z.number().int(),
    noteText: z.string().nullable(),
    showTaxColumn: z.boolean(),
    /** BT-118: Steuerkategorie nach UNTDID 5305. */
    taxCategoryCode: z.enum(TAX_CATEGORY_CODE_VALUES as [string, ...string[]]),
    /** BT-121: Befreiungsgrund als Code. */
    exemptionReasonCode: z.string().nullable(),
    /** BT-120: Befreiungsgrund im Klartext. */
    exemptionReasonText: z.string().nullable(),
  }),
);
export type TaxSnapshot = z.infer<typeof taxSnapshotSchema>;

/**
 * Template-Einstellungen. Der `templateKey` sorgt dafür, dass eine alte
 * Rechnung auch dann noch identisch gerendert werden kann, wenn längst ein
 * anderes Template die Voreinstellung ist.
 */
export const templateSnapshotSchema = upgraded(
  () => ({}),
  z.object({
    ...versioned,
    templateKey: z.string(),
    accentColor: z.string(),
    fontFamily: z.string(),
    logoWidthMm: z.number(),
    footerText: z.string().nullable(),
    paymentNote: z.string().nullable(),
    closingNote: z.string().nullable(),

    /*
     * Die Regler des Designers, nachgereicht innerhalb von Version 2.
     *
     * `.default()` statt einer neuen Snapshot-Version, und das ist der
     * entscheidende Punkt: `versioned` teilen sich seller, buyer, tax,
     * template und totals. Eine Erhöhung auf 3 ließe jede bereits
     * geschriebene Zeile am Schema scheitern, bis für alle fünf ein
     * zweiter Aufstiegspfad existiert — eine Wanderung durch das ganze
     * Projekt für ein Template-Detail.
     *
     * `.default()` greift bei `undefined` unabhängig von der Version. Eine
     * Rechnung von gestern hat diese Felder nicht und bekommt hier genau
     * die Werte, die „classic" bis dahin fest im CSS stehen hatte. Sie
     * rendert deshalb unverändert.
     *
     * Die Typen sind absichtlich weiter als im Eingabeschema: Dort ist die
     * Schrift eine feste Auswahl, hier ein String. Ein Snapshot ist ein
     * Dokument und darf nicht dadurch unlesbar werden, dass jemand später
     * eine Schrift umbenennt oder ein Design entfernt. Unbekannte Werte
     * fallen beim Rendern zurück — so wie `resolveTemplate` es mit einem
     * verschwundenen Design tut.
     */
    inkColor: z.string().default('#1f2328'),
    inkSoftColor: z.string().default('#4b5563'),
    ruleColor: z.string().default('#e3e6ea'),
    bandColor: z.string().default('#f4f5f7'),
    pageColor: z.string().default('#ffffff'),
    density: z.string().default('normal'),
    showLogo: z.boolean().default(true),
    showPaymentBlock: z.boolean().default(true),
    showFooterRule: z.boolean().default(true),
  }),
);
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
export const totalsSnapshotSchema = upgraded(
  () => ({}),
  z.object({
    ...versioned,
    netCents: z.number().int(),
    taxCents: z.number().int(),
    grossCents: z.number().int(),
    totalDiscountCents: z.number().int(),
    taxGroups: z.array(taxGroupSchema),
  }),
);
export type TotalsSnapshot = z.infer<typeof totalsSnapshotSchema>;

/** Metadaten eines Verlaufseintrags. Bewusst offen, aber typisiert eingelesen. */
export const invoiceEventMetadataSchema = z.object({
  releasedNumber: z.string().optional(),
  assignedNumber: z.string().optional(),
  documentType: z.enum(DOCUMENT_TYPE_VALUES as [string, ...string[]]).optional(),
  paidAt: isoDateSchema.nullable().optional(),
  note: z.string().optional(),

  /**
   * Der E-Mail-Versand im Verlauf: an wen, mit welchen Anhängen, auf
   * welchem Weg. Die vollständige Nachricht steht im Versandprotokoll
   * (`MailMessage`) — hier steht, was man im Verlauf einer Rechnung sehen
   * will, ohne sie zu öffnen.
   */
  recipients: z.array(z.string()).optional(),
  attachments: z.array(z.string()).optional(),
  transport: z.string().optional(),
  mailMessageId: z.number().int().optional(),
});
export type InvoiceEventMetadata = z.infer<typeof invoiceEventMetadataSchema>;
