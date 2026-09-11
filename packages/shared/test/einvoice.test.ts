import { describe, expect, it } from 'vitest';
import {
  DEFAULT_UNIT_CODE,
  TAX_CATEGORY_CODE,
  UNIT_CODE,
  defaultTaxCategoryForKind,
  guessUnitCode,
} from '../src/einvoice/codes.js';
import { checkEinvoiceReady, isEinvoiceReady } from '../src/einvoice/readiness.js';
import { TAX_PROFILE_KIND } from '../src/enums.js';
import {
  CURRENT_SNAPSHOT_VERSION,
  type BuyerData,
  type SellerSnapshot,
  type TaxSnapshot,
} from '../src/snapshots.js';

const seller: SellerSnapshot = {
  snapshotVersion: CURRENT_SNAPSHOT_VERSION,
  companyName: 'Beispiel Agentur',
  address: { street: 'Musterweg 1', postalCode: '10115', city: 'Berlin', country: 'DE' },
  email: 'rechnung@example.com',
  website: null,
  phone: '+49 7961 1234567',
  vatId: 'DE123456789',
  taxNumber: null,
  bankAccountHolder: 'Beispiel Agentur',
  iban: 'DE02120300000000202051',
  bic: 'BYLADEM1001',
  bankName: 'Beispielbank',
  electronicAddress: 'rechnung@example.com',
  electronicAddressScheme: 'EM',
  logoAssetId: null,
};

const buyer: BuyerData = {
  snapshotVersion: CURRENT_SNAPSHOT_VERSION,
  companyName: 'Kunde GmbH',
  contactName: null,
  addressLine: null,
  address: { street: 'Kundenstr. 5', postalCode: '20095', city: 'Hamburg', country: 'DE' },
  email: 'buchhaltung@kunde.example',
  vatId: null,
  customerNumber: 'K-0001',
  buyerReference: '04011000-1234512345-06',
  electronicAddress: 'buchhaltung@kunde.example',
  electronicAddressScheme: 'EM',
};

const tax: TaxSnapshot = {
  snapshotVersion: CURRENT_SNAPSHOT_VERSION,
  profileName: 'Deutschland 19 %',
  kind: TAX_PROFILE_KIND.STANDARD,
  defaultRateBasisPoints: 1900,
  noteText: null,
  showTaxColumn: true,
  taxCategoryCode: TAX_CATEGORY_CODE.STANDARD,
  exemptionReasonCode: null,
  exemptionReasonText: null,
};

describe('Steuerkategorie aus der Steuerart', () => {
  it('bildet jede Steuerart ab', () => {
    expect(defaultTaxCategoryForKind(TAX_PROFILE_KIND.STANDARD)).toBe('S');
    expect(defaultTaxCategoryForKind(TAX_PROFILE_KIND.REVERSE_CHARGE)).toBe('AE');
    // Steuerfrei und Kleinunternehmer sind beide „befreit" — welcher
    // Sachverhalt dahinter steht, kann nur der Benutzer wissen (D-E2).
    expect(defaultTaxCategoryForKind(TAX_PROFILE_KIND.ZERO_RATED)).toBe('E');
    expect(defaultTaxCategoryForKind(TAX_PROFILE_KIND.SMALL_BUSINESS)).toBe('E');
  });
});

describe('Mengeneinheit aus dem gedruckten Etikett', () => {
  it('erkennt die üblichen Schreibweisen', () => {
    expect(guessUnitCode('Std.')).toBe(UNIT_CODE.HOUR);
    expect(guessUnitCode('std')).toBe(UNIT_CODE.HOUR);
    expect(guessUnitCode('h')).toBe(UNIT_CODE.HOUR);
    expect(guessUnitCode('Stunden')).toBe(UNIT_CODE.HOUR);
    expect(guessUnitCode('Stk.')).toBe(UNIT_CODE.PIECE);
    expect(guessUnitCode('Tag')).toBe(UNIT_CODE.DAY);
    expect(guessUnitCode('Pauschale')).toBe(UNIT_CODE.SERVICE_UNIT);
    expect(guessUnitCode('m²')).toBe(UNIT_CODE.SQUARE_METRE);
  });

  it('fällt auf Stück zurück, statt zu scheitern', () => {
    // Ein unbekanntes Etikett darf keine bestehende Rechnung unbrauchbar
    // machen — es ist Freitext und war immer Freitext.
    expect(guessUnitCode('Blubb')).toBe(DEFAULT_UNIT_CODE);
    expect(guessUnitCode(null)).toBe(DEFAULT_UNIT_CODE);
    expect(guessUnitCode('   ')).toBe(DEFAULT_UNIT_CODE);
  });
});

describe('Bereitschaft für die E-Rechnung', () => {
  it('lässt eine vollständige Rechnung durch', () => {
    expect(checkEinvoiceReady({ seller, buyer, tax })).toEqual([]);
    expect(isEinvoiceReady({ seller, buyer, tax })).toBe(true);
  });

  it('verlangt die Referenz des Käufers', () => {
    // BT-10 ist in XRechnung Pflicht, in der EU-Norm nicht.
    const problems = checkEinvoiceReady({
      seller,
      buyer: { ...buyer, buyerReference: null },
      tax,
    });
    expect(problems.map((problem) => problem.field)).toContain('buyerReference');
  });

  it('verlangt beide elektronischen Adressen', () => {
    const ohneVerkaeufer = checkEinvoiceReady({
      seller: { ...seller, electronicAddress: null },
      buyer,
      tax,
    });
    expect(ohneVerkaeufer.map((problem) => problem.field)).toContain('seller.electronicAddress');

    const ohneKaeufer = checkEinvoiceReady({
      seller,
      buyer: { ...buyer, electronicAddress: '  ' },
      tax,
    });
    expect(ohneKaeufer.map((problem) => problem.field)).toContain('electronicAddress');
  });

  it('verlangt bei befreiten Kategorien einen Grund', () => {
    const problems = checkEinvoiceReady({
      seller,
      buyer,
      tax: {
        ...tax,
        kind: TAX_PROFILE_KIND.REVERSE_CHARGE,
        taxCategoryCode: TAX_CATEGORY_CODE.REVERSE_CHARGE,
        exemptionReasonCode: null,
        exemptionReasonText: null,
      },
    });
    expect(problems.map((problem) => problem.field)).toContain('tax.exemptionReasonText');
  });

  it('gibt sich mit dem Code allein zufrieden', () => {
    // BT-121 oder BT-120 — die Norm verlangt eines von beiden, nicht beides.
    const problems = checkEinvoiceReady({
      seller,
      buyer,
      tax: {
        ...tax,
        taxCategoryCode: TAX_CATEGORY_CODE.REVERSE_CHARGE,
        exemptionReasonCode: 'VATEX-EU-AE',
        exemptionReasonText: null,
      },
    });
    expect(problems).toEqual([]);
  });

  it('verlangt eine Telefonnummer mit Ziffern', () => {
    // BR-DE-6 und BR-DE-27: XRechnung verlangt beim Verkäufer eine
    // Telefonnummer, und sie muss mindestens drei Ziffern enthalten.
    const ohne = checkEinvoiceReady({ seller: { ...seller, phone: null }, buyer, tax });
    expect(ohne.map((problem) => problem.field)).toContain('seller.phone');

    const zuKurz = checkEinvoiceReady({ seller: { ...seller, phone: '—' }, buyer, tax });
    expect(zuKurz.map((problem) => problem.field)).toContain('seller.phone');
  });

  it('verlangt eine IBAN', () => {
    const problems = checkEinvoiceReady({ seller: { ...seller, iban: null }, buyer, tax });
    expect(problems.map((problem) => problem.field)).toContain('seller.iban');
  });

  it('blockiert das Finalisieren nicht', () => {
    // Der eigentliche Punkt dieser Prüfung: Eine Rechnung ohne Leitweg-ID
    // ist eine gültige Rechnung. Sie lässt sich nur nicht als XML ausgeben.
    const problems = checkEinvoiceReady({
      seller,
      buyer: { ...buyer, buyerReference: null, electronicAddress: null },
      tax,
    });
    expect(problems.length).toBeGreaterThan(0);
    // Keine dieser Meldungen betrifft § 14 UStG.
    expect(problems.every((problem) => problem.field !== 'seller.companyName')).toBe(true);
  });
});
