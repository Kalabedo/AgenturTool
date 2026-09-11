import { describe, expect, it } from 'vitest';
import {
  CURRENT_SNAPSHOT_VERSION,
  TAX_PROFILE_KIND,
  checkFinalizable,
  isFinalizable,
  type BuyerData,
  type FinalizationInput,
  type SellerSnapshot,
  type TaxSnapshot,
} from '../src/index.js';

const SELLER: SellerSnapshot = {
  snapshotVersion: CURRENT_SNAPSHOT_VERSION,
  companyName: 'XYZ - Agentur',
  address: { street: 'Wolfgangsklinge 14', postalCode: '73479', city: 'Ellwangen', country: 'DE' },
  email: null,
  website: null,
  phone: null,
  vatId: 'DE455137261',
  taxNumber: null,
  bankAccountHolder: null,
  iban: 'DE12202208000052019114',
  bic: null,
  bankName: null,
  electronicAddress: 'rechnung@xyz-agentur.de',
  electronicAddressScheme: 'EM',
  logoAssetId: null,
};

const BUYER: BuyerData = {
  snapshotVersion: CURRENT_SNAPSHOT_VERSION,
  companyName: 'SoluXion Ltd',
  contactName: null,
  addressLine: null,
  address: { street: 'Hauptstr. 1', postalCode: '7560', city: 'Larnaca', country: 'Zypern' },
  email: null,
  vatId: 'CY60143029O',
  customerNumber: null,
  buyerReference: null,
  electronicAddress: null,
  electronicAddressScheme: null,
};

const STANDARD_TAX: TaxSnapshot = {
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

function input(overrides: Partial<FinalizationInput> = {}): FinalizationInput {
  return {
    seller: SELLER,
    buyer: BUYER,
    tax: STANDARD_TAX,
    items: [{ description: 'Beratung' }],
    ...overrides,
  };
}

function fields(problems: { field: string }[]): string[] {
  return problems.map((problem) => problem.field);
}

describe('checkFinalizable', () => {
  it('lässt eine vollständige Rechnung durch', () => {
    expect(checkFinalizable(input())).toEqual([]);
    expect(isFinalizable(input())).toBe(true);
  });

  it('verlangt Steuernummer oder USt-IdNr., aber nicht beides', () => {
    const onlyTaxNumber = { ...SELLER, vatId: null, taxNumber: '87/123/45678' };
    expect(checkFinalizable(input({ seller: onlyTaxNumber, tax: STANDARD_TAX }))).toEqual([]);

    const neither = { ...SELLER, vatId: null, taxNumber: null };
    expect(fields(checkFinalizable(input({ seller: neither })))).toContain('seller.taxNumber');
  });

  it('meldet eine unvollständige eigene Anschrift', () => {
    const seller = { ...SELLER, address: { ...SELLER.address, postalCode: '  ' } };
    expect(fields(checkFinalizable(input({ seller })))).toContain('seller.address');
  });

  it('meldet fehlende Empfängerdaten', () => {
    const buyer = { ...BUYER, companyName: '', address: { ...BUYER.address, city: '' } };
    expect(fields(checkFinalizable(input({ buyer })))).toEqual([
      'buyerData.companyName',
      'buyerData.address',
    ]);
  });

  it('verlangt ein Steuerprofil', () => {
    const noProfile: TaxSnapshot = { ...STANDARD_TAX, profileName: '', showTaxColumn: false };
    expect(fields(checkFinalizable(input({ tax: noProfile })))).toContain('taxProfileId');
  });

  it('verlangt bei einem Profil ohne Steuerausweis den Hinweistext', () => {
    // Eine Rechnung ohne Steuer und ohne Begründung ist genau die, die bei
    // einer Prüfung auffällt.
    const kleinunternehmer: TaxSnapshot = {
      ...STANDARD_TAX,
      profileName: 'Kleinunternehmer',
      kind: TAX_PROFILE_KIND.SMALL_BUSINESS,
      defaultRateBasisPoints: 0,
      noteText: null,
    };
    expect(fields(checkFinalizable(input({ tax: kleinunternehmer })))).toContain('taxProfileId');

    const mitHinweis = {
      ...kleinunternehmer,
      noteText: 'Kein Ausweis von Umsatzsteuer, § 19 UStG.',
    };
    expect(checkFinalizable(input({ tax: mitHinweis }))).toEqual([]);
  });

  it('verlangt bei Reverse Charge beide USt-IdNr.', () => {
    const reverseCharge: TaxSnapshot = {
      ...STANDARD_TAX,
      profileName: 'EU B2B Reverse Charge',
      kind: TAX_PROFILE_KIND.REVERSE_CHARGE,
      defaultRateBasisPoints: 0,
      noteText: 'Steuerschuldnerschaft des Leistungsempfängers.',
    };

    expect(checkFinalizable(input({ tax: reverseCharge }))).toEqual([]);

    const ohneEmpfaengerId = { ...BUYER, vatId: null };
    expect(
      fields(checkFinalizable(input({ tax: reverseCharge, buyer: ohneEmpfaengerId }))),
    ).toEqual(['vatId']);
  });

  it('meldet eine Rechnung ohne Position', () => {
    expect(fields(checkFinalizable(input({ items: [] })))).toEqual(['items']);
  });

  it('benennt die Position, deren Beschreibung fehlt', () => {
    const problems = checkFinalizable(
      input({ items: [{ description: 'Beratung' }, { description: '   ' }] }),
    );
    expect(problems).toEqual([
      { field: 'items.1.description', message: 'Position 2 hat keine Beschreibung.' },
    ]);
  });
});
