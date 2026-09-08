import { describe, expect, it } from 'vitest';
import {
  buyerDataToFormFields,
  cancellationNote,
  customerToBuyerData,
  defaultInvoiceDates,
  emptyBuyerData,
  invoiceDisplayName,
  invoiceDraftInputSchema,
  invoiceItemInputSchema,
  isCancellable,
  isEditable,
  isOverdue,
} from '../src/invoice.js';
import { DISCOUNT_TYPE, DOCUMENT_TYPE, INVOICE_STATUS } from '../src/enums.js';
import { toIsoDate } from '../src/date.js';
import { parseQuantity, quantityToInput, centsToInput } from '../src/money.js';
import type { CustomerResponse } from '../src/customer.js';

function itemInput(overrides: Record<string, unknown> = {}) {
  return {
    description: 'Konzeption',
    quantity: '7,5',
    unit: 'Std.',
    unitPriceCents: '120,00',
    discountType: DISCOUNT_TYPE.PERCENT,
    discountValue: '',
    taxRateBasisPoints: '19',
    ...overrides,
  };
}

function draftInput(overrides: Record<string, unknown> = {}) {
  return {
    customerId: '',
    taxProfileId: '',
    buyerData: {
      companyName: 'Kunde GmbH',
      contactName: '',
      addressLine: '',
      street: 'Kundenstr. 5',
      postalCode: '20095',
      city: 'Hamburg',
      country: 'DE',
      email: '',
      vatId: '',
      customerNumber: '',
    },
    invoiceDate: '2026-03-01',
    serviceDate: '2026-02-28',
    serviceDateTo: '',
    dueDate: '2026-03-15',
    notes: '',
    footerNote: '',
    internalNotes: '',
    items: [itemInput()],
    ...overrides,
  };
}

describe('parseQuantity', () => {
  it('nimmt Komma und Punkt', () => {
    expect(parseQuantity('7,5')).toBe(7500);
    expect(parseQuantity('7.5')).toBe(7500);
    expect(parseQuantity('1')).toBe(1000);
    expect(parseQuantity('0,333')).toBe(333);
  });

  it('erlaubt negative Mengen für das Storno', () => {
    expect(parseQuantity('-7,5')).toBe(-7500);
  });

  it('lehnt Unsinniges ab', () => {
    expect(parseQuantity('')).toBeNull();
    expect(parseQuantity('viele')).toBeNull();
    expect(parseQuantity('-')).toBeNull();
  });

  it('ist mit der Rückwandlung stimmig', () => {
    for (const value of ['7,5', '1', '0,333', '-2,25']) {
      expect(quantityToInput(parseQuantity(value)!)).toBe(value);
    }
  });
});

describe('centsToInput', () => {
  it('zeigt immer zwei Nachkommastellen', () => {
    expect(centsToInput(12345)).toBe('123,45');
    expect(centsToInput(10000)).toBe('100,00');
    expect(centsToInput(5)).toBe('0,05');
  });
});

describe('invoiceItemInputSchema', () => {
  it('rechnet die Eingaben in Ganzzahlen um', () => {
    const parsed = invoiceItemInputSchema.parse(itemInput());
    expect(parsed.quantity).toBe(7500);
    expect(parsed.unitPriceCents).toBe(12000);
    expect(parsed.taxRateBasisPoints).toBe(1900);
    expect(parsed.discountValue).toBe(0);
  });

  it('deutet den Rabatt je nach Art unterschiedlich', () => {
    // Derselbe Text „10" bedeutet 10 Prozent oder 10,00 € — das kann nur
    // auf Objektebene entschieden werden.
    const percent = invoiceItemInputSchema.parse(itemInput({ discountValue: '10' }));
    expect(percent.discountValue).toBe(1000);

    const amount = invoiceItemInputSchema.parse(
      itemInput({ discountType: DISCOUNT_TYPE.AMOUNT, discountValue: '10' }),
    );
    expect(amount.discountValue).toBe(1000);
    expect(amount.discountType).toBe(DISCOUNT_TYPE.AMOUNT);
  });

  it('verlangt eine Beschreibung', () => {
    expect(invoiceItemInputSchema.safeParse(itemInput({ description: '  ' })).success).toBe(false);
  });

  it('meldet einen ungültigen Prozentrabatt am richtigen Feld', () => {
    const result = invoiceItemInputSchema.safeParse(itemInput({ discountValue: '150' }));
    expect(result.success).toBe(false);
    if (!result.success) {
      expect(result.error.errors[0]?.path).toEqual(['discountValue']);
    }
  });

  it('lehnt einen unmöglichen Steuersatz ab', () => {
    expect(invoiceItemInputSchema.safeParse(itemInput({ taxRateBasisPoints: '150' })).success).toBe(
      false,
    );
  });

  it('nimmt bereits umgerechnete Zahlen unverändert an', () => {
    // Der Server schickt beim Duplizieren fertige Ganzzahlen; sie dürfen
    // nicht ein zweites Mal durch die Prozentumrechnung laufen.
    const parsed = invoiceItemInputSchema.parse(
      itemInput({
        quantity: 7500,
        unitPriceCents: 12000,
        taxRateBasisPoints: 1900,
        discountValue: 1000,
      }),
    );
    expect(parsed.quantity).toBe(7500);
    expect(parsed.taxRateBasisPoints).toBe(1900);
    expect(parsed.discountValue).toBe(1000);
  });
});

describe('invoiceDraftInputSchema', () => {
  it('nimmt einen gültigen Entwurf an', () => {
    const parsed = invoiceDraftInputSchema.parse(draftInput());
    expect(parsed.buyerData.companyName).toBe('Kunde GmbH');
    expect(parsed.items).toHaveLength(1);
    expect(parsed.customerId).toBeNull();
  });

  it('verschachtelt die Adresse für den Snapshot', () => {
    // Das Formular führt die Adresse flach, gespeichert wird sie
    // verschachtelt — dieselbe Form wie der spätere Snapshot.
    const parsed = invoiceDraftInputSchema.parse(draftInput());
    expect(parsed.buyerData.address).toEqual({
      street: 'Kundenstr. 5',
      postalCode: '20095',
      city: 'Hamburg',
      country: 'DE',
    });
  });

  it('erlaubt eine Rechnung ohne Positionen', () => {
    // Ein frisch angelegter Entwurf hat noch keine.
    expect(invoiceDraftInputSchema.safeParse(draftInput({ items: [] })).success).toBe(true);
  });

  it('lehnt ein Fälligkeitsdatum vor dem Rechnungsdatum ab', () => {
    const result = invoiceDraftInputSchema.safeParse(
      draftInput({ invoiceDate: '2026-03-15', dueDate: '2026-03-01' }),
    );
    expect(result.success).toBe(false);
    if (!result.success) {
      expect(result.error.errors[0]?.path).toEqual(['dueDate']);
    }
  });

  it('erlaubt Fälligkeit am Rechnungsdatum', () => {
    expect(
      invoiceDraftInputSchema.safeParse(
        draftInput({ invoiceDate: '2026-03-01', dueDate: '2026-03-01' }),
      ).success,
    ).toBe(true);
  });

  it('lehnt ein Leistungsende vor dem Beginn ab', () => {
    const result = invoiceDraftInputSchema.safeParse(
      draftInput({ serviceDate: '2026-02-28', serviceDateTo: '2026-02-01' }),
    );
    expect(result.success).toBe(false);
    if (!result.success) {
      expect(result.error.errors[0]?.path).toEqual(['serviceDateTo']);
    }
  });

  it('behandelt ein leeres Leistungsende als nicht gesetzt', () => {
    expect(invoiceDraftInputSchema.parse(draftInput()).serviceDateTo).toBeNull();
  });

  it('lehnt ein ungültiges Kalenderdatum ab', () => {
    expect(
      invoiceDraftInputSchema.safeParse(draftInput({ invoiceDate: '2026-02-31' })).success,
    ).toBe(false);
  });
});

describe('customerToBuyerData', () => {
  const customer: CustomerResponse = {
    id: 1,
    customerNumber: 'K-100',
    companyName: 'Nordwind Logistik',
    contactName: 'Alex Beispiel',
    addressLine: 'z. Hd. Buchhaltung',
    street: 'Hafenstraße 12',
    postalCode: '20095',
    city: 'Hamburg',
    country: 'DE',
    email: 'rechnung@nordwind.example',
    vatId: 'DE987654321',
    notes: 'interne Notiz',
    defaultPaymentTermDays: 21,
    defaultTaxProfileId: 3,
    archivedAt: null,
    invoiceCount: 0,
    createdAt: '2026-01-01T00:00:00.000Z',
    updatedAt: '2026-01-01T00:00:00.000Z',
  };

  it('übernimmt die Rechnungsangaben', () => {
    const buyer = customerToBuyerData(customer);
    expect(buyer.companyName).toBe('Nordwind Logistik');
    expect(buyer.address.city).toBe('Hamburg');
    expect(buyer.vatId).toBe('DE987654321');
    expect(buyer.customerNumber).toBe('K-100');
  });

  it('übernimmt keine internen Angaben', () => {
    // Notiz und Zahlungsziel gehören nicht auf die Rechnung.
    const buyer = customerToBuyerData(customer) as Record<string, unknown>;
    expect(buyer['notes']).toBeUndefined();
    expect(buyer['defaultPaymentTermDays']).toBeUndefined();
  });

  it('lässt sich verlustfrei in Formularfelder und zurück wandeln', () => {
    const fields = buyerDataToFormFields(customerToBuyerData(customer));
    expect(fields.street).toBe('Hafenstraße 12');
    expect(fields.contactName).toBe('Alex Beispiel');
    // Leere Werte werden zu leeren Strings, nicht zu "null".
    expect(buyerDataToFormFields(emptyBuyerData()).contactName).toBe('');
  });
});

describe('defaultInvoiceDates', () => {
  it('setzt die Fälligkeit auf das Zahlungsziel', () => {
    const dates = defaultInvoiceDates(14, toIsoDate('2026-03-01'));
    expect(dates.invoiceDate).toBe('2026-03-01');
    expect(dates.serviceDate).toBe('2026-03-01');
    expect(dates.dueDate).toBe('2026-03-15');
  });

  it('rechnet über den Jahreswechsel', () => {
    expect(defaultInvoiceDates(30, toIsoDate('2026-12-20')).dueDate).toBe('2027-01-19');
  });

  it('erlaubt sofortige Fälligkeit', () => {
    expect(defaultInvoiceDates(0, toIsoDate('2026-03-01')).dueDate).toBe('2026-03-01');
  });
});

describe('Statushilfen', () => {
  it('erlaubt Bearbeitung nur im Entwurf', () => {
    expect(isEditable(INVOICE_STATUS.DRAFT)).toBe(true);
    expect(isEditable(INVOICE_STATUS.ISSUED)).toBe(false);
    expect(isEditable(INVOICE_STATUS.PAID)).toBe(false);
    expect(isEditable(INVOICE_STATUS.CANCELLED)).toBe(false);
  });

  it('zeigt bei Entwürfen die id statt einer Nummer', () => {
    expect(invoiceDisplayName({ id: 12, number: null })).toBe('Entwurf #12');
    expect(invoiceDisplayName({ id: 12, number: '2026-001' })).toBe('2026-001');
  });

  it('berechnet Überfälligkeit, statt sie zu speichern', () => {
    const today = toIsoDate('2026-03-20');
    expect(isOverdue({ status: INVOICE_STATUS.ISSUED, dueDate: '2026-03-15' }, today)).toBe(true);
    expect(isOverdue({ status: INVOICE_STATUS.ISSUED, dueDate: '2026-03-25' }, today)).toBe(false);
    // Am Fälligkeitstag selbst ist noch nichts überfällig.
    expect(isOverdue({ status: INVOICE_STATUS.ISSUED, dueDate: '2026-03-20' }, today)).toBe(false);
    // Bezahlte und stornierte Rechnungen werden nie überfällig.
    expect(isOverdue({ status: INVOICE_STATUS.PAID, dueDate: '2026-03-01' }, today)).toBe(false);
    expect(isOverdue({ status: INVOICE_STATUS.DRAFT, dueDate: '2026-03-01' }, today)).toBe(false);
  });
});

describe('isCancellable', () => {
  const base = {
    status: INVOICE_STATUS.ISSUED,
    documentType: DOCUMENT_TYPE.INVOICE,
    cancelledByInvoiceId: null,
  };

  it('erlaubt das Storno einer ausgestellten und einer bezahlten Rechnung', () => {
    expect(isCancellable(base)).toBe(true);
    expect(isCancellable({ ...base, status: INVOICE_STATUS.PAID })).toBe(true);
  });

  it('lehnt Entwürfe ab — es gibt noch kein Dokument, das aufzuheben wäre', () => {
    expect(isCancellable({ ...base, status: INVOICE_STATUS.DRAFT })).toBe(false);
  });

  it('lehnt eine bereits stornierte Rechnung ab', () => {
    expect(isCancellable({ ...base, cancelledByInvoiceId: 7 })).toBe(false);
    expect(isCancellable({ ...base, status: INVOICE_STATUS.CANCELLED })).toBe(false);
  });

  it('lehnt das Storno eines Stornos ab', () => {
    // Eine Wiederherstellung gibt es bewusst nicht.
    expect(isCancellable({ ...base, documentType: DOCUMENT_TYPE.CANCELLATION })).toBe(false);
  });
});

describe('cancellationNote', () => {
  it('nennt Nummer und Datum der aufgehobenen Rechnung', () => {
    expect(cancellationNote('2026-013', toIsoDate('2026-03-01'))).toBe(
      'Storno zur Rechnung 2026-013 vom 01.03.2026.',
    );
  });
});
