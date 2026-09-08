import { describe, expect, it } from 'vitest';
import {
  CUSTOMER_ARCHIVE_FILTER,
  customerInputSchema,
  customerListQuerySchema,
  formatCustomerAddress,
  formatCustomerLocation,
} from '../src/customer.js';

const valid = {
  customerNumber: '',
  companyName: 'Kunde GmbH',
  contactName: '',
  addressLine: '',
  street: 'Kundenstr. 5',
  postalCode: '20095',
  city: 'Hamburg',
  country: 'DE',
  email: '',
  vatId: '',
  notes: '',
  defaultPaymentTermDays: '',
  defaultTaxProfileId: '',
};

describe('customerInputSchema', () => {
  it('verlangt einen Namen', () => {
    expect(customerInputSchema.safeParse({ ...valid, companyName: '' }).success).toBe(false);
    expect(customerInputSchema.safeParse({ ...valid, companyName: '   ' }).success).toBe(false);
  });

  it('erlaubt eine unvollständige Anschrift', () => {
    // Die Adresse ergänzt man oft erst, wenn die erste Rechnung ansteht.
    const parsed = customerInputSchema.parse({ ...valid, street: '', postalCode: '', city: '' });
    expect(parsed.companyName).toBe('Kunde GmbH');
  });

  it('wandelt leere Felder in null um', () => {
    const parsed = customerInputSchema.parse(valid);
    expect(parsed.customerNumber).toBeNull();
    expect(parsed.email).toBeNull();
    expect(parsed.notes).toBeNull();
  });

  it('unterscheidet leeres Zahlungsziel von null Tagen', () => {
    // Leer heißt "Vorgabe des Unternehmens verwenden" — nicht "sofort fällig".
    expect(customerInputSchema.parse(valid).defaultPaymentTermDays).toBeNull();
    expect(
      customerInputSchema.parse({ ...valid, defaultPaymentTermDays: '0' }).defaultPaymentTermDays,
    ).toBe(0);
    expect(
      customerInputSchema.parse({ ...valid, defaultPaymentTermDays: '30' }).defaultPaymentTermDays,
    ).toBe(30);
  });

  it('lehnt unsinnige Zahlungsziele ab', () => {
    expect(customerInputSchema.safeParse({ ...valid, defaultPaymentTermDays: '-1' }).success).toBe(
      false,
    );
    expect(
      customerInputSchema.safeParse({ ...valid, defaultPaymentTermDays: 'bald' }).success,
    ).toBe(false);
  });

  it('prüft E-Mail und USt-IdNr., wenn sie angegeben sind', () => {
    expect(customerInputSchema.safeParse({ ...valid, email: 'keine-mail' }).success).toBe(false);
    expect(customerInputSchema.safeParse({ ...valid, vatId: '123456789' }).success).toBe(false);
    expect(customerInputSchema.safeParse({ ...valid, vatId: 'DE123456789' }).success).toBe(true);
  });
});

describe('customerListQuerySchema', () => {
  it('filtert standardmäßig auf aktive Kunden', () => {
    expect(customerListQuerySchema.parse({}).archived).toBe(CUSTOMER_ARCHIVE_FILTER.ACTIVE);
  });

  it('lehnt einen unbekannten Filter ab', () => {
    expect(customerListQuerySchema.safeParse({ archived: 'irgendwas' }).success).toBe(false);
  });
});

describe('formatCustomerAddress', () => {
  it('lässt leere Zeilen weg', () => {
    // Sonst entstünde eine Lücke mitten im Adressblock der Rechnung.
    expect(
      formatCustomerAddress({
        companyName: 'Kunde GmbH',
        contactName: null,
        addressLine: null,
        street: 'Kundenstr. 5',
        postalCode: '20095',
        city: 'Hamburg',
        country: 'DE',
      }),
    ).toEqual(['Kunde GmbH', 'Kundenstr. 5', '20095 Hamburg', 'DE']);
  });

  it('nimmt Ansprechpartner und Adresszusatz auf', () => {
    expect(
      formatCustomerAddress({
        companyName: 'Kunde GmbH',
        contactName: 'Alex Beispiel',
        addressLine: 'z. Hd. Buchhaltung',
        street: 'Kundenstr. 5',
        postalCode: '20095',
        city: 'Hamburg',
        country: 'DE',
      }),
    ).toEqual([
      'Kunde GmbH',
      'Alex Beispiel',
      'z. Hd. Buchhaltung',
      'Kundenstr. 5',
      '20095 Hamburg',
      'DE',
    ]);
  });

  it('kommt mit einer fast leeren Adresse zurecht', () => {
    expect(formatCustomerAddress({ companyName: 'Nur ein Name' })).toEqual(['Nur ein Name']);
  });
});

describe('formatCustomerLocation', () => {
  it('setzt PLZ und Ort zusammen', () => {
    expect(formatCustomerLocation({ postalCode: '20095', city: 'Hamburg' })).toBe('20095 Hamburg');
    expect(formatCustomerLocation({ postalCode: '', city: 'Hamburg' })).toBe('Hamburg');
    expect(formatCustomerLocation({ postalCode: null, city: null })).toBe('');
  });
});
