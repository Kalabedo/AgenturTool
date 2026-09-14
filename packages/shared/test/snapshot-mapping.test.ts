import { describe, expect, it } from 'vitest';
import {
  CURRENT_SNAPSHOT_VERSION,
  TAX_PROFILE_KIND,
  effectiveTaxRateBasisPoints,
  sellerSnapshotFromCompany,
  taxSnapshotFromProfile,
  templateSnapshotFromSettings,
  sellerSnapshotSchema,
  taxSnapshotSchema,
  templateSnapshotSchema,
  type CompanyResponse,
  type TaxProfileResponse,
  type TemplateSettingsResponse,
} from '../src/index.js';

const company: CompanyResponse = {
  id: 1,
  companyName: 'XYZ - Agentur',
  street: 'Wolfgangsklinge 14',
  postalCode: '73479',
  city: 'Ellwangen',
  country: 'DE',
  email: 'hello@xyz-agentur.de',
  website: 'xyz-agentur.de',
  phone: '',
  vatId: 'DE455137261',
  taxNumber: null,
  bankAccountHolder: 'Tom Wenczel',
  iban: 'DE12202208000052019114',
  bic: 'SXPYDEHHXXX',
  bankName: '   ',
  electronicAddress: 'hello@xyz-agentur.de',
  electronicAddressScheme: 'EM',
  defaultPaymentTermDays: 14,
  defaultHourlyRateCents: 8500,
  logoAssetId: 7,
  logoUrl: '/api/assets/7',
  updatedAt: '2026-09-08T10:00:00.000Z',
};

const templateSettings: TemplateSettingsResponse = {
  id: 1,
  templateKey: 'classic',
  accentColor: '#1e293b',
  fontFamily: 'Open Sans',
  logoWidthMm: 40,
  footerText: '',
  paymentNote: 'Bitte bis zum Fälligkeitsdatum überweisen.',
  closingNote: null,
  inkColor: '#1f2328',
  inkSoftColor: '#4b5563',
  ruleColor: '#e3e6ea',
  bandColor: '#f4f5f7',
  density: 'normal',
  showLogo: true,
  showPaymentBlock: true,
  showFooterRule: true,
  updatedAt: '2026-09-08T10:00:00.000Z',
};

function taxProfile(overrides: Partial<TaxProfileResponse> = {}): TaxProfileResponse {
  return {
    id: 3,
    name: 'Deutschland 19 %',
    kind: TAX_PROFILE_KIND.STANDARD,
    defaultRateBasisPoints: 1900,
    noteText: null,
    taxCategoryCode: 'S',
    exemptionReasonCode: null,
    exemptionReasonText: null,
    showTaxColumn: true,
    isDefault: true,
    sortOrder: 0,
    archivedAt: null,
    invoiceCount: 0,
    customerCount: 0,
    createdAt: '2026-09-08T10:00:00.000Z',
    updatedAt: '2026-09-08T10:00:00.000Z',
    ...overrides,
  };
}

describe('sellerSnapshotFromCompany', () => {
  it('erzeugt einen gültigen Snapshot', () => {
    const snapshot = sellerSnapshotFromCompany(company);
    expect(() => sellerSnapshotSchema.parse(snapshot)).not.toThrow();
    expect(snapshot.snapshotVersion).toBe(CURRENT_SNAPSHOT_VERSION);
    expect(snapshot.address.city).toBe('Ellwangen');
    expect(snapshot.logoAssetId).toBe(7);
  });

  it('macht leere und nur aus Leerzeichen bestehende Felder zu null', () => {
    const snapshot = sellerSnapshotFromCompany(company);
    // Ein leerer String im Snapshot führte im Template zu einer leeren Zeile
    // auf dem Dokument — sichtbar, aber ohne Inhalt.
    expect(snapshot.phone).toBeNull();
    expect(snapshot.bankName).toBeNull();
  });
});

describe('taxSnapshotFromProfile', () => {
  it('übernimmt Profilangaben unverändert', () => {
    const snapshot = taxSnapshotFromProfile(
      taxProfile({
        kind: TAX_PROFILE_KIND.REVERSE_CHARGE,
        defaultRateBasisPoints: 0,
        noteText: 'Reverse Charge',
      }),
    );
    expect(() => taxSnapshotSchema.parse(snapshot)).not.toThrow();
    expect(snapshot.noteText).toBe('Reverse Charge');
  });

  it('liefert ohne Profil einen neutralen Snapshot statt eines erfundenen Satzes', () => {
    const snapshot = taxSnapshotFromProfile(null);
    expect(snapshot.defaultRateBasisPoints).toBe(0);
    expect(snapshot.showTaxColumn).toBe(false);
    expect(() => taxSnapshotSchema.parse(snapshot)).not.toThrow();
  });
});

describe('effectiveTaxRateBasisPoints', () => {
  it('gibt bei Standardprofilen den hinterlegten Satz zurück', () => {
    expect(effectiveTaxRateBasisPoints(taxSnapshotFromProfile(taxProfile()))).toBe(1900);
  });

  it('erzwingt 0 % bei Profilen ohne Steuerausweis', () => {
    // Auch wenn im Profil versehentlich ein Satz stünde: Reverse Charge und
    // Kleinunternehmer weisen keine Umsatzsteuer aus.
    const snapshot = taxSnapshotFromProfile(
      taxProfile({ kind: TAX_PROFILE_KIND.REVERSE_CHARGE, defaultRateBasisPoints: 1900 }),
    );
    expect(effectiveTaxRateBasisPoints(snapshot)).toBe(0);
  });
});

describe('templateSnapshotFromSettings', () => {
  it('erzeugt einen gültigen Snapshot und normalisiert leere Texte', () => {
    const snapshot = templateSnapshotFromSettings(templateSettings);
    expect(() => templateSnapshotSchema.parse(snapshot)).not.toThrow();
    expect(snapshot.footerText).toBeNull();
    expect(snapshot.paymentNote).toBe('Bitte bis zum Fälligkeitsdatum überweisen.');
  });
});
