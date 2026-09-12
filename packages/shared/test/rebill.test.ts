import { describe, expect, it } from 'vitest';
import { CURRENT_SNAPSHOT_VERSION, diffBuyerData, rebillInputSchema } from '../src/index.js';
import type { BuyerData } from '../src/index.js';

function buyer(overrides: Partial<BuyerData> = {}): BuyerData {
  return {
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
    ...overrides,
  };
}

describe('diffBuyerData', () => {
  it('meldet nichts, wenn beide Stände übereinstimmen', () => {
    expect(diffBuyerData(buyer(), buyer())).toEqual([]);
  });

  it('nennt nur die geänderten Felder, mit altem und neuem Wert', () => {
    const changes = diffBuyerData(
      buyer(),
      buyer({
        address: { street: 'Nikodimou 5', postalCode: '7560', city: 'Larnaca', country: 'Zypern' },
      }),
    );

    expect(changes).toEqual([{ label: 'Straße', from: 'Hauptstr. 1', to: 'Nikodimou 5' }]);
  });

  it('behandelt leeren String und null als denselben Zustand', () => {
    // Sonst behauptete der Dialog eine Änderung „— → —", sobald irgendwo ein
    // Formular einen leeren String statt null hinterlassen hat.
    const changes = diffBuyerData(buyer({ contactName: null }), buyer({ contactName: '  ' }));
    expect(changes).toEqual([]);
  });

  it('zeigt ein neu hinzugekommenes Feld als „— → Wert"', () => {
    const changes = diffBuyerData(
      buyer({ buyerReference: null }),
      buyer({ buyerReference: 'BR-2026-0001' }),
    );

    expect(changes).toEqual([{ label: 'Käuferreferenz', from: '—', to: 'BR-2026-0001' }]);
  });

  it('folgt der Reihenfolge des Dokuments, nicht der des Schemas', () => {
    const changes = diffBuyerData(
      buyer(),
      buyer({
        companyName: 'SoluXion PLC',
        address: { street: 'Nikodimou 5', postalCode: '1010', city: 'Nikosia', country: 'Zypern' },
        email: 'buchhaltung@soluxion.example',
      }),
    );

    expect(changes.map((change) => change.label)).toEqual([
      'Firmenname',
      'Straße',
      'PLZ',
      'Ort',
      'E-Mail',
    ]);
  });
});

describe('rebillInputSchema', () => {
  it('übernimmt die Kundenvorgaben, wenn nichts angegeben ist', () => {
    // Die Vorbelegung der Oberfläche und die eines direkten API-Aufrufs
    // müssen dieselbe sein, sonst legt der eine Weg eine andere Rechnung an
    // als der andere.
    expect(rebillInputSchema.parse({})).toEqual({ refreshCustomerDefaults: true });
    expect(rebillInputSchema.parse(undefined)).toEqual({ refreshCustomerDefaults: true });
  });

  it('nimmt die Abwahl entgegen', () => {
    expect(rebillInputSchema.parse({ refreshCustomerDefaults: false })).toEqual({
      refreshCustomerDefaults: false,
    });
  });
});
