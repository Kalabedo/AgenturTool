import { describe, expect, it } from 'vitest';
import { missingCompanyFieldsForInvoicing, updateCompanySchema } from '../src/company.js';

const valid = {
  companyName: 'Beispiel Agentur',
  street: 'Musterweg 1',
  postalCode: '10115',
  city: 'Berlin',
  country: 'DE',
  email: '',
  website: '',
  phone: '',
  vatId: '',
  taxNumber: '',
  bankAccountHolder: '',
  iban: '',
  bic: '',
  bankName: '',
  defaultPaymentTermDays: '14',
};

describe('updateCompanySchema', () => {
  it('wandelt leere Felder in null um', () => {
    // Sonst stünde später ein leerer String im Snapshot und damit eine
    // leere Zeile auf der Rechnung.
    const parsed = updateCompanySchema.parse(valid);
    expect(parsed.email).toBeNull();
    expect(parsed.iban).toBeNull();
    expect(parsed.vatId).toBeNull();
  });

  it('erlaubt unvollständige Firmendaten', () => {
    // Die Daten entstehen über mehrere Sitzungen; die Vollständigkeit wird
    // erst beim Finalisieren einer Rechnung geprüft.
    const parsed = updateCompanySchema.parse({ ...valid, companyName: '', city: '' });
    expect(parsed.companyName).toBe('');
  });

  it('lehnt eine IBAN mit falscher Prüfsumme ab', () => {
    const result = updateCompanySchema.safeParse({ ...valid, iban: 'DE03120300000000202051' });
    expect(result.success).toBe(false);
  });

  it('akzeptiert eine IBAN mit Leerzeichen', () => {
    const parsed = updateCompanySchema.parse({ ...valid, iban: 'DE02 1203 0000 0000 2020 51' });
    expect(parsed.iban).toBe('DE02 1203 0000 0000 2020 51');
  });

  it('nimmt das Zahlungsziel als String und als Zahl', () => {
    expect(
      updateCompanySchema.parse({ ...valid, defaultPaymentTermDays: '30' }).defaultPaymentTermDays,
    ).toBe(30);
    expect(
      updateCompanySchema.parse({ ...valid, defaultPaymentTermDays: 30 }).defaultPaymentTermDays,
    ).toBe(30);
  });

  it('macht aus einem leeren Zahlungsziel keine 0', () => {
    // Regressionstest: z.coerce.number() würde "" klaglos zu 0 machen und
    // damit ein Zahlungsziel von null Tagen erzeugen.
    const result = updateCompanySchema.safeParse({ ...valid, defaultPaymentTermDays: '' });
    expect(result.success).toBe(false);
  });

  it('lehnt unsinnige Zahlungsziele ab', () => {
    expect(updateCompanySchema.safeParse({ ...valid, defaultPaymentTermDays: '-5' }).success).toBe(
      false,
    );
    expect(
      updateCompanySchema.safeParse({ ...valid, defaultPaymentTermDays: '14,5' }).success,
    ).toBe(false);
    expect(
      updateCompanySchema.safeParse({ ...valid, defaultPaymentTermDays: 'bald' }).success,
    ).toBe(false);
  });
});

describe('missingCompanyFieldsForInvoicing', () => {
  const complete = {
    companyName: 'Beispiel Agentur',
    street: 'Musterweg 1',
    postalCode: '10115',
    city: 'Berlin',
    vatId: 'DE123456789',
    taxNumber: null,
  };

  it('meldet nichts, wenn alles da ist', () => {
    expect(missingCompanyFieldsForInvoicing(complete)).toEqual([]);
  });

  it('akzeptiert Steuernummer statt USt-IdNr.', () => {
    // § 14 UStG verlangt eine der beiden Angaben, nicht beide.
    expect(
      missingCompanyFieldsForInvoicing({ ...complete, vatId: null, taxNumber: '12/345/67890' }),
    ).toEqual([]);
  });

  it('meldet, wenn beide steuerlichen Angaben fehlen', () => {
    expect(missingCompanyFieldsForInvoicing({ ...complete, vatId: null, taxNumber: null })).toEqual(
      ['vatIdOrTaxNumber'],
    );
  });

  it('meldet fehlende Adressfelder einzeln', () => {
    expect(missingCompanyFieldsForInvoicing({ ...complete, street: '', city: '   ' })).toEqual([
      'street',
      'city',
    ]);
  });
});
