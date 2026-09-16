import { describe, expect, it } from 'vitest';
import {
  CURRENT_SNAPSHOT_VERSION,
  buyerDataSchema,
  sellerSnapshotSchema,
  taxSnapshotSchema,
  templateSnapshotSchema,
  totalsSnapshotSchema,
  LEGACY_SNAPSHOT_VERSION,
} from '../src/snapshots.js';
import { TAX_PROFILE_KIND } from '../src/enums.js';
import { TAX_CATEGORY_CODE } from '../src/einvoice/codes.js';

const seller = {
  snapshotVersion: CURRENT_SNAPSHOT_VERSION,
  companyName: 'Beispiel Agentur',
  address: { street: 'Musterweg 1', postalCode: '10115', city: 'Berlin', country: 'DE' },
  email: 'rechnung@example.com',
  website: null,
  phone: null,
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

const buyer = {
  snapshotVersion: CURRENT_SNAPSHOT_VERSION,
  companyName: 'Kunde GmbH',
  contactName: 'Alex Beispiel',
  addressLine: 'z. Hd. Buchhaltung',
  address: { street: 'Kundenstr. 5', postalCode: '20095', city: 'Hamburg', country: 'DE' },
  email: null,
  vatId: null,
  customerNumber: 'K-0001',
  buyerReference: '04011000-1234512345-06',
  electronicAddress: null,
  electronicAddressScheme: null,
};

describe('Snapshot-Schemas', () => {
  it('überstehen den Weg durch JSON unverändert', () => {
    // Genau dieser Weg passiert in der Datenbank: Prisma kennt auf SQLite
    // kein Json, die Snapshots liegen als TEXT.
    const roundTrip = sellerSnapshotSchema.parse(JSON.parse(JSON.stringify(seller)));
    expect(roundTrip).toEqual(seller);

    expect(buyerDataSchema.parse(JSON.parse(JSON.stringify(buyer)))).toEqual(buyer);
  });

  it('lehnen unvollständige Snapshots ab', () => {
    const { iban: _iban, ...withoutIban } = seller;
    expect(() => sellerSnapshotSchema.parse(withoutIban)).toThrow();
  });

  it('lehnen eine fremde Snapshot-Version ab', () => {
    // Eine unbekannte Version darf nicht stillschweigend als aktuelle
    // gelesen werden — sonst fehlen Felder unbemerkt.
    expect(() => sellerSnapshotSchema.parse({ ...seller, snapshotVersion: 99 })).toThrow();
  });

  it('validiert Steuer- und Template-Snapshot', () => {
    const tax = taxSnapshotSchema.parse({
      snapshotVersion: CURRENT_SNAPSHOT_VERSION,
      profileName: 'EU B2B Reverse Charge',
      kind: TAX_PROFILE_KIND.REVERSE_CHARGE,
      defaultRateBasisPoints: 0,
      noteText: 'Steuerschuldnerschaft des Leistungsempfängers.',
      showTaxColumn: false,
      taxCategoryCode: TAX_CATEGORY_CODE.REVERSE_CHARGE,
      exemptionReasonCode: null,
      exemptionReasonText: 'Steuerschuldnerschaft des Leistungsempfängers.',
    });
    expect(tax.kind).toBe('REVERSE_CHARGE');
    expect(tax.taxCategoryCode).toBe('AE');

    const template = templateSnapshotSchema.parse({
      snapshotVersion: CURRENT_SNAPSHOT_VERSION,
      templateKey: 'classic',
      accentColor: '#1e293b',
      fontFamily: 'Inter',
      logoWidthMm: 40,
      footerText: null,
      paymentNote: null,
      closingNote: null,
    });
    expect(template.templateKey).toBe('classic');
  });

  it('hält die Summen je Steuersatz fest', () => {
    const totals = totalsSnapshotSchema.parse({
      snapshotVersion: CURRENT_SNAPSHOT_VERSION,
      netCents: 123400,
      taxCents: 23446,
      grossCents: 146846,
      totalDiscountCents: 0,
      taxGroups: [{ rateBasisPoints: 1900, netCents: 123400, taxCents: 23446 }],
    });
    expect(totals.taxGroups[0]?.taxCents).toBe(23446);
    expect(totals.netCents + totals.taxCents).toBe(totals.grossCents);
  });

  it('lehnt Beträge mit Nachkommastellen ab', () => {
    // Geld ist Integer in Cent. Ein Float hier wäre ein Fehler weiter oben.
    expect(() =>
      totalsSnapshotSchema.parse({
        snapshotVersion: CURRENT_SNAPSHOT_VERSION,
        netCents: 1234.5,
        taxCents: 0,
        grossCents: 1234.5,
        totalDiscountCents: 0,
        taxGroups: [],
      }),
    ).toThrow();
  });
  describe('Version 1 wird beim Lesen aufgefüllt', () => {
    // Rechnungen, die vor der E-Rechnung ausgestellt wurden, liegen weiter
    // als Version 1 in der Datenbank. Sie müssen lesbar bleiben — und zwar
    // ohne dass die Aufrufstellen etwas davon wissen.

    it('füllt fehlende Felder des Verkäufers mit null', () => {
      const { electronicAddress: _a, electronicAddressScheme: _b, ...rest } = seller;
      const legacy = { ...rest, snapshotVersion: LEGACY_SNAPSHOT_VERSION };

      const parsed = sellerSnapshotSchema.parse(JSON.parse(JSON.stringify(legacy)));

      expect(parsed.snapshotVersion).toBe(CURRENT_SNAPSHOT_VERSION);
      expect(parsed.electronicAddress).toBeNull();
      expect(parsed.electronicAddressScheme).toBeNull();
      // Alles Übrige steht unverändert da.
      expect(parsed.iban).toBe(seller.iban);
      expect(parsed.companyName).toBe(seller.companyName);
    });

    it('füllt die Käuferreferenz mit null', () => {
      const {
        buyerReference: _r,
        electronicAddress: _a,
        electronicAddressScheme: _b,
        ...rest
      } = buyer;
      const parsed = buyerDataSchema.parse({ ...rest, snapshotVersion: LEGACY_SNAPSHOT_VERSION });

      expect(parsed.buyerReference).toBeNull();
      expect(parsed.customerNumber).toBe('K-0001');
    });

    it('leitet die Steuerkategorie aus der Steuerart ab', () => {
      const standard = taxSnapshotSchema.parse({
        snapshotVersion: LEGACY_SNAPSHOT_VERSION,
        profileName: 'Deutschland 19 %',
        kind: TAX_PROFILE_KIND.STANDARD,
        defaultRateBasisPoints: 1900,
        noteText: null,
        showTaxColumn: true,
      });
      expect(standard.taxCategoryCode).toBe(TAX_CATEGORY_CODE.STANDARD);
      expect(standard.exemptionReasonText).toBeNull();

      // Ohne Steuerausweis: `E`, und der alte Hinweistext wird zum
      // Befreiungsgrund — genau das, was BT-120 verlangt.
      const kleinunternehmer = taxSnapshotSchema.parse({
        snapshotVersion: LEGACY_SNAPSHOT_VERSION,
        profileName: 'Kleinunternehmer',
        kind: TAX_PROFILE_KIND.SMALL_BUSINESS,
        defaultRateBasisPoints: 0,
        noteText: 'Gemäß § 19 UStG wird keine Umsatzsteuer berechnet.',
        showTaxColumn: false,
      });
      expect(kleinunternehmer.taxCategoryCode).toBe(TAX_CATEGORY_CODE.EXEMPT);
      expect(kleinunternehmer.exemptionReasonText).toBe(
        'Gemäß § 19 UStG wird keine Umsatzsteuer berechnet.',
      );
    });

    it('liest Template- und Summen-Snapshots der Version 1', () => {
      const template = templateSnapshotSchema.parse({
        snapshotVersion: LEGACY_SNAPSHOT_VERSION,
        templateKey: 'classic',
        accentColor: '#1e293b',
        fontFamily: 'Inter',
        logoWidthMm: 40,
        footerText: null,
        paymentNote: null,
        closingNote: null,
      });
      expect(template.snapshotVersion).toBe(CURRENT_SNAPSHOT_VERSION);

      const totals = totalsSnapshotSchema.parse({
        snapshotVersion: LEGACY_SNAPSHOT_VERSION,
        netCents: 1000,
        taxCents: 190,
        grossCents: 1190,
        totalDiscountCents: 0,
        taxGroups: [{ rateBasisPoints: 1900, netCents: 1000, taxCents: 190 }],
      });
      expect(totals.grossCents).toBe(1190);
    });
  });
});

describe('Nachgereichte Design-Felder im templateSnapshot', () => {
  /** Ein Snapshot, wie ihn die Fassung vor dem Rechnungsdesigner geschrieben hat. */
  const beforeDesigner = {
    snapshotVersion: CURRENT_SNAPSHOT_VERSION,
    templateKey: 'classic',
    accentColor: '#1e293b',
    fontFamily: 'Open Sans',
    logoWidthMm: 40,
    footerText: null,
    paymentNote: null,
    closingNote: null,
  };

  it('liest eine Rechnung von vorher unverändert', () => {
    // Der eigentliche Vertrag: Die Regler kamen innerhalb von Version 2
    // dazu, per .default(). Eine bereits ausgestellte Rechnung darf davon
    // nichts merken — sie bekommt genau die Werte, die „classic" bis dahin
    // fest im CSS stehen hatte, und rendert deshalb gleich.
    const parsed = templateSnapshotSchema.parse(beforeDesigner);

    expect(parsed).toMatchObject({
      inkColor: '#1f2328',
      inkSoftColor: '#4b5563',
      ruleColor: '#e3e6ea',
      bandColor: '#f4f5f7',
      pageColor: '#ffffff',
      density: 'normal',
      showLogo: true,
      showPaymentBlock: true,
      showFooterRule: true,
    });
  });

  it('füllt die Felder auch bei einem Snapshot der Version 1', () => {
    // `upgraded()` hebt auf Version 2, `.default()` füllt danach — beides
    // muss zusammen greifen, sonst scheiterte die älteste Rechnung.
    const parsed = templateSnapshotSchema.parse({
      ...beforeDesigner,
      snapshotVersion: LEGACY_SNAPSHOT_VERSION,
    });

    expect(parsed.snapshotVersion).toBe(CURRENT_SNAPSHOT_VERSION);
    expect(parsed.density).toBe('normal');
    expect(parsed.showLogo).toBe(true);
  });

  it('nimmt auch ein Design, das es nicht mehr gibt', () => {
    // Ein Snapshot ist ein Dokument. Er darf nicht dadurch unlesbar werden,
    // dass eine spätere Fassung ein Design entfernt oder eine Schrift
    // umbenennt — deshalb sind die Felder hier String und nicht Enum.
    const parsed = templateSnapshotSchema.parse({
      ...beforeDesigner,
      templateKey: 'abgeschafft',
      fontFamily: 'Irgendeine Schrift',
    });

    expect(parsed.templateKey).toBe('abgeschafft');
  });
});
