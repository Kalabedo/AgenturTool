import {
  CURRENT_SNAPSHOT_VERSION,
  DISCOUNT_TYPE,
  DOCUMENT_TYPE,
  TAX_CATEGORY_CODE,
  TAX_PROFILE_KIND,
  UNIT_CODE,
  type IsoDate,
  type TotalsSnapshot,
} from '@privatura/shared';
import type { RenderModelSource } from '@privatura/invoice-template';

/**
 * Eine vollständige, ausgestellte Rechnung als Quelle.
 *
 * Absichtlich mit **zwei Steuersätzen**: Der häufigste Fehler beim
 * Abbilden auf EN 16931 ist eine Steueraufstellung, die nur die erste
 * Gruppe kennt. Eine Rechnung mit 19 % und 7 % deckt das auf.
 */
export const SOURCE: RenderModelSource = {
  documentType: DOCUMENT_TYPE.INVOICE,
  number: '2026-0007',
  invoiceDate: '2026-03-01' as IsoDate,
  serviceDate: '2026-02-01' as IsoDate,
  serviceDateTo: '2026-02-28' as IsoDate,
  dueDate: '2026-03-15' as IsoDate,
  currency: 'EUR',
  seller: {
    snapshotVersion: CURRENT_SNAPSHOT_VERSION,
    companyName: 'XYZ - Agentur',
    address: {
      street: 'Wolfgangsklinge 14',
      postalCode: '73479',
      city: 'Ellwangen',
      country: 'DE',
    },
    email: 'hello@xyz-agentur.de',
    website: 'xyz-agentur.de',
    phone: '+49 7961 1234567',
    vatId: 'DE455137261',
    taxNumber: null,
    bankAccountHolder: 'Tom Wenczel',
    iban: 'DE12202208000052019114',
    bic: 'SXPYDEHHXXX',
    bankName: 'Beispielbank',
    electronicAddress: 'rechnung@xyz-agentur.de',
    electronicAddressScheme: 'EM',
    logoAssetId: null,
  },
  buyer: {
    snapshotVersion: CURRENT_SNAPSHOT_VERSION,
    companyName: 'Nordwind Logistik GmbH',
    contactName: 'Alex Beispiel',
    addressLine: 'z. Hd. Buchhaltung',
    address: { street: 'Hafenstraße 12', postalCode: '20095', city: 'Hamburg', country: 'DE' },
    email: 'rechnung@nordwind.example',
    vatId: 'DE987654321',
    customerNumber: 'K-0001',
    buyerReference: '04011000-1234512345-06',
    electronicAddress: 'rechnung@nordwind.example',
    electronicAddressScheme: 'EM',
  },
  tax: {
    snapshotVersion: CURRENT_SNAPSHOT_VERSION,
    profileName: 'Deutschland 19 %',
    kind: TAX_PROFILE_KIND.STANDARD,
    defaultRateBasisPoints: 1900,
    noteText: null,
    showTaxColumn: true,
    taxCategoryCode: TAX_CATEGORY_CODE.STANDARD,
    exemptionReasonCode: null,
    exemptionReasonText: null,
  },
  template: {
    snapshotVersion: CURRENT_SNAPSHOT_VERSION,
    templateKey: 'classic',
    accentColor: '#1e293b',
    fontFamily: 'Open Sans',
    logoWidthMm: 40,
    footerText: null,
    paymentNote: null,
    closingNote: null,
    inkColor: '#1f2328',
    inkSoftColor: '#4b5563',
    ruleColor: '#e3e6ea',
    bandColor: '#f4f5f7',
    density: 'normal',
    showLogo: true,
    showPaymentBlock: true,
    showFooterRule: true,
  },
  notes: 'Vielen Dank für die gute Zusammenarbeit.',
  footerNote: null,
  logoSrc: null,
  items: [
    {
      description: 'Konzeption & Beratung',
      quantity: 7500,
      unit: 'Std.',
      unitCode: UNIT_CODE.HOUR,
      unitPriceCents: 12000,
      discountType: DISCOUNT_TYPE.PERCENT,
      discountValue: 0,
      taxRateBasisPoints: 1900,
    },
    {
      description: 'Druckkosten Broschüre',
      quantity: 1000,
      unit: 'Pauschale',
      unitCode: UNIT_CODE.SERVICE_UNIT,
      unitPriceCents: 45000,
      discountType: DISCOUNT_TYPE.PERCENT,
      discountValue: 1000,
      taxRateBasisPoints: 700,
    },
  ],
};

/**
 * Die eingefrorenen Summen.
 *
 * Von Hand gerechnet, damit der Test nicht dieselbe Funktion prüft, die er
 * benutzt: 7,5 × 120,00 € = 900,00 € zu 19 %; 450,00 € minus 10 % = 405,00 €
 * zu 7 %. Steuer: 171,00 € und 28,35 €.
 */
export const TOTALS: TotalsSnapshot = {
  snapshotVersion: CURRENT_SNAPSHOT_VERSION,
  netCents: 130_500,
  taxCents: 19_935,
  grossCents: 150_435,
  totalDiscountCents: 4_500,
  taxGroups: [
    { rateBasisPoints: 700, netCents: 40_500, taxCents: 2_835 },
    { rateBasisPoints: 1900, netCents: 90_000, taxCents: 17_100 },
  ],
};
