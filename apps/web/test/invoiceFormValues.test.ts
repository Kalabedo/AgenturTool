import { describe, expect, it } from 'vitest';
import { taxRateForNewInvoiceItem } from '../src/features/invoices/invoiceFormValues.js';

describe('taxRateForNewInvoiceItem', () => {
  it('nimmt für die erste Position den Steuersatz des Steuerprofils', () => {
    expect(taxRateForNewInvoiceItem([], 0)).toBe('0');
    expect(taxRateForNewInvoiceItem([], 750)).toBe('7,5');
  });

  it('übernimmt für weitere Positionen den zuletzt verwendeten Satz', () => {
    expect(taxRateForNewInvoiceItem([{ taxRateBasisPoints: '7' }], 1900)).toBe('7');
  });

  it('erfindet ohne Steuerprofil keinen Steuersatz', () => {
    expect(taxRateForNewInvoiceItem([], undefined)).toBe('');
  });
});
