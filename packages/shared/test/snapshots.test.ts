import { describe, expect, it } from 'vitest';
import {
  CURRENT_SNAPSHOT_VERSION,
  buyerDataSchema,
  sellerSnapshotSchema,
  taxSnapshotSchema,
  templateSnapshotSchema,
  totalsSnapshotSchema,
} from '../src/snapshots.js';
import { TAX_PROFILE_KIND } from '../src/enums.js';

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
    });
    expect(tax.kind).toBe('REVERSE_CHARGE');

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
});
