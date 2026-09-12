import {
  CURRENT_SNAPSHOT_VERSION,
  DISCOUNT_TYPE,
  DOCUMENT_TYPE,
  TAX_PROFILE_KIND,
  toIsoDate,
  type BuyerData,
  type SellerSnapshot,
  type TaxSnapshot,
  type TemplateSnapshot,
} from '@agentur-tool/shared';
import type { RenderModelSource } from '../src/render-model.js';

/**
 * Die Referenzrechnung 2025-003 als Modell.
 *
 * Bewusst eine echte Rechnung und kein erfundenes Beispiel: Sie enthält
 * Reverse Charge, eine ausländische Anschrift ohne Postleitzahlenformat und
 * drei Positionen ohne Rabatt — also genau die Fälle, an denen sich zeigt,
 * ob das Layout hält.
 */

export const REFERENCE_SELLER: SellerSnapshot = {
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
  phone: null,
  vatId: 'DE455137261',
  taxNumber: null,
  bankAccountHolder: 'Tom Wenczel',
  iban: 'DE12202208000052019114',
  bic: 'SXPYDEHHXXX',
  bankName: null,
  logoAssetId: null,
};

export const REFERENCE_BUYER: BuyerData = {
  snapshotVersion: CURRENT_SNAPSHOT_VERSION,
  companyName: 'SoluXion Ltd',
  contactName: null,
  addressLine: 'Flat/Office 102 Pervolia',
  address: {
    street: 'Georgiou Karaiskaki, 11-13 CARISA SALONICA',
    postalCode: '7560',
    city: 'Larnaca',
    country: 'Zypern',
  },
  email: null,
  vatId: 'CY60143029O',
  customerNumber: null,
};

export const REVERSE_CHARGE_TAX: TaxSnapshot = {
  snapshotVersion: CURRENT_SNAPSHOT_VERSION,
  profileName: 'EU B2B Reverse Charge',
  kind: TAX_PROFILE_KIND.REVERSE_CHARGE,
  defaultRateBasisPoints: 0,
  noteText:
    'Steuerschuldnerschaft des Leistungsempfängers. Die Umsatzsteuer schuldet der Leistungsempfänger gemäß Art. 196 MwStSystRL und §13b UStG (Reverse Charge).',
  showTaxColumn: true,
};

export const STANDARD_TAX: TaxSnapshot = {
  snapshotVersion: CURRENT_SNAPSHOT_VERSION,
  profileName: 'Deutschland 19 %',
  kind: TAX_PROFILE_KIND.STANDARD,
  defaultRateBasisPoints: 1900,
  noteText: null,
  showTaxColumn: true,
};

export const DEFAULT_TEMPLATE: TemplateSnapshot = {
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
};

export const REFERENCE_INVOICE: RenderModelSource = {
  documentType: DOCUMENT_TYPE.INVOICE,
  number: '2025-003',
  invoiceDate: toIsoDate('2025-07-26'),
  serviceDate: toIsoDate('2025-07-26'),
  serviceDateTo: null,
  dueDate: toIsoDate('2025-08-09'),
  currency: 'EUR',
  seller: REFERENCE_SELLER,
  buyer: REFERENCE_BUYER,
  tax: REVERSE_CHARGE_TAX,
  template: DEFAULT_TEMPLATE,
  notes: null,
  footerNote: null,
  logoSrc: null,
  items: [
    {
      description: 'Erstellung Redirect Links',
      quantity: 3000,
      unit: null,
      unitPriceCents: 6500,
      discountType: DISCOUNT_TYPE.PERCENT,
      discountValue: 0,
      taxRateBasisPoints: 0,
    },
    {
      description: 'Links',
      quantity: 3000,
      unit: null,
      unitPriceCents: 800,
      discountType: DISCOUNT_TYPE.PERCENT,
      discountValue: 0,
      taxRateBasisPoints: 0,
    },
    {
      description: 'Hosting',
      quantity: 1000,
      unit: null,
      unitPriceCents: 4000,
      discountType: DISCOUNT_TYPE.PERCENT,
      discountValue: 0,
      taxRateBasisPoints: 0,
    },
  ],
};
