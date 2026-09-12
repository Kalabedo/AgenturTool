import { DISCOUNT_TYPE, DOCUMENT_TYPE, TAX_PROFILE_KIND, type DiscountType } from './enums.js';
import { UNIT_CODE, type UnitCode } from './einvoice/codes.js';
import { toIsoDate } from './date.js';
import {
  CURRENT_SNAPSHOT_VERSION,
  type BuyerData,
  type SellerSnapshot,
  type TaxSnapshot,
} from './snapshots.js';

/**
 * Die Musterrechnung des Designers.
 *
 * Sie liegt hier und nicht bei den Tests des Template-Pakets: Testordner
 * stehen nicht in den `exports` eines Pakets, die Oberfläche käme also gar
 * nicht an sie heran.
 *
 * Sie ist auch bewusst nicht die Referenzrechnung. Die ist ein echter
 * Geschäftsvorfall — Reverse Charge, keine Rabatte, ein Steuersatz — und
 * zeigt damit gerade die Hälfte dessen nicht, was sich hier einstellen
 * lässt. Diese hier ist das Gegenteil: Sie führt alles einmal vor, was ein
 * Regler verändern kann.
 *
 *   - Zwei Steuersätze, damit die Steuerzeilen mehr als eine Zeile sind
 *   - Ein Prozent- und ein Betragsrabatt, damit die Rabattspalte erscheint
 *   - Eine mehrzeilige Beschreibung, damit man den Zeilenabstand sieht
 *   - Sieben Positionen, damit die Dichte etwas bewirkt, das auffällt
 *   - Zahlungsdetails und Hinweistexte, für die Blockschalter
 */

export const DESIGN_SAMPLE_SELLER: SellerSnapshot = {
  snapshotVersion: CURRENT_SNAPSHOT_VERSION,
  companyName: 'Musteragentur',
  address: { street: 'Beispielweg 12', postalCode: '10115', city: 'Berlin', country: 'DE' },
  email: 'rechnung@musteragentur.de',
  website: 'musteragentur.de',
  phone: '+49 30 1234567',
  vatId: 'DE123456789',
  taxNumber: null,
  bankAccountHolder: 'Musteragentur',
  iban: 'DE02120300000000202051',
  bic: 'BYLADEM1001',
  bankName: 'Beispielbank',
  electronicAddress: 'rechnung@musteragentur.de',
  electronicAddressScheme: 'EM',
  logoAssetId: null,
};

export const DESIGN_SAMPLE_BUYER: BuyerData = {
  snapshotVersion: CURRENT_SNAPSHOT_VERSION,
  companyName: 'Hanse Handels GmbH',
  contactName: 'Frau Dr. Kessler',
  addressLine: 'Abteilung Einkauf',
  address: { street: 'Hafenstraße 148', postalCode: '20457', city: 'Hamburg', country: 'DE' },
  email: 'einkauf@hanse-handels.de',
  vatId: 'DE987654321',
  customerNumber: 'K-0042',
  buyerReference: null,
  electronicAddress: 'einkauf@hanse-handels.de',
  electronicAddressScheme: 'EM',
};

export const DESIGN_SAMPLE_TAX: TaxSnapshot = {
  snapshotVersion: CURRENT_SNAPSHOT_VERSION,
  profileName: 'Deutschland 19 %',
  kind: TAX_PROFILE_KIND.STANDARD,
  defaultRateBasisPoints: 1900,
  noteText: null,
  showTaxColumn: true,
  taxCategoryCode: 'S',
  exemptionReasonCode: null,
  exemptionReasonText: null,
};

export interface DesignSampleItem {
  description: string;
  quantity: number;
  unit: string | null;
  unitCode: UnitCode;
  unitPriceCents: number;
  discountType: DiscountType;
  discountValue: number;
  taxRateBasisPoints: number;
}

export const DESIGN_SAMPLE_ITEMS: DesignSampleItem[] = [
  {
    description: 'Konzeption und Informationsarchitektur',
    quantity: 12_000,
    unit: 'Std.',
    unitCode: UNIT_CODE.HOUR,
    unitPriceCents: 11_000,
    discountType: DISCOUNT_TYPE.PERCENT,
    discountValue: 0,
    taxRateBasisPoints: 1900,
  },
  {
    description: 'Gestaltung der Startseite\nZwei Entwürfe, eine Überarbeitung',
    quantity: 8_500,
    unit: 'Std.',
    unitCode: UNIT_CODE.HOUR,
    unitPriceCents: 11_000,
    discountType: DISCOUNT_TYPE.PERCENT,
    discountValue: 1000,
    taxRateBasisPoints: 1900,
  },
  {
    description: 'Umsetzung Frontend',
    quantity: 24_000,
    unit: 'Std.',
    unitCode: UNIT_CODE.HOUR,
    unitPriceCents: 9500,
    discountType: DISCOUNT_TYPE.PERCENT,
    discountValue: 0,
    taxRateBasisPoints: 1900,
  },
  {
    description: 'Anbindung Redaktionssystem',
    quantity: 6_000,
    unit: 'Std.',
    unitCode: UNIT_CODE.HOUR,
    unitPriceCents: 9500,
    discountType: DISCOUNT_TYPE.AMOUNT,
    discountValue: 5000,
    taxRateBasisPoints: 1900,
  },
  {
    description: 'Schulung der Redaktion',
    quantity: 3_000,
    unit: 'Std.',
    unitCode: UNIT_CODE.HOUR,
    unitPriceCents: 8500,
    discountType: DISCOUNT_TYPE.PERCENT,
    discountValue: 0,
    taxRateBasisPoints: 1900,
  },
  {
    description: 'Handbuch, gedruckt',
    quantity: 2_000,
    unit: 'Stk.',
    unitCode: UNIT_CODE.PIECE,
    unitPriceCents: 2400,
    discountType: DISCOUNT_TYPE.PERCENT,
    discountValue: 0,
    // Druckerzeugnisse mit ermäßigtem Satz — damit die Steueraufteilung
    // zwei Zeilen hat und nicht eine.
    taxRateBasisPoints: 700,
  },
  {
    description: 'Hosting, jährlich',
    quantity: 1_000,
    unit: null,
    unitCode: UNIT_CODE.PIECE,
    unitPriceCents: 36_000,
    discountType: DISCOUNT_TYPE.PERCENT,
    discountValue: 0,
    taxRateBasisPoints: 1900,
  },
];

export const DESIGN_SAMPLE_INVOICE = {
  documentType: DOCUMENT_TYPE.INVOICE,
  number: '2026-014',
  invoiceDate: toIsoDate('2026-03-12'),
  serviceDate: toIsoDate('2026-02-01'),
  serviceDateTo: toIsoDate('2026-02-28'),
  dueDate: toIsoDate('2026-03-26'),
  currency: 'EUR',
  seller: DESIGN_SAMPLE_SELLER,
  buyer: DESIGN_SAMPLE_BUYER,
  tax: DESIGN_SAMPLE_TAX,
  notes: 'Vielen Dank für die gute Zusammenarbeit.',
  footerNote: null,
  items: DESIGN_SAMPLE_ITEMS,
};

/**
 * Ein neutrales Logo für die Vorschau, solange die Firma keines hochgeladen
 * hat.
 *
 * Als Data-URI, damit der Regler für die Logobreite auch dann etwas
 * bewirkt, wenn noch nichts eingerichtet ist — sonst sähe man beim
 * Einrichten des Designs ausgerechnet den Regler nicht wirken, der die
 * Kopfzeile am stärksten verändert.
 */
export const DESIGN_SAMPLE_LOGO =
  'data:image/svg+xml;utf8,' +
  encodeURIComponent(
    '<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 200 56">' +
      '<rect width="200" height="56" rx="6" fill="#e2e8f0"/>' +
      '<text x="100" y="34" text-anchor="middle" font-family="Helvetica,Arial,sans-serif" ' +
      'font-size="18" fill="#64748b">Ihr Logo</text>' +
      '</svg>',
  );
