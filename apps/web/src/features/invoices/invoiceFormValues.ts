import {
  DISCOUNT_TYPE,
  buyerDataToFormFields,
  basisPointsToPercentInput,
  centsToInput,
  quantityToInput,
  type DiscountType,
  type InvoiceResponse,
} from '@agentur-tool/shared';

/**
 * Formularwerte der Rechnung.
 *
 * Durchgehend Strings, auch für Zahlen: Ein Eingabefeld hält während des
 * Tippens Zwischenstände wie „12," oder „", die sich als Zahl nicht
 * darstellen lassen. Die Umwandlung in Cent, Tausendstel und Basispunkte
 * übernimmt das geteilte Schema beim Absenden.
 */
export interface InvoiceItemFormValues {
  description: string;
  quantity: string;
  unit: string;
  /** BT-130: Mengeneinheit als Code. Das Etikett bleibt `unit`. */
  unitCode: string;
  unitPriceCents: string;
  discountType: DiscountType;
  discountValue: string;
  taxRateBasisPoints: string;
}

export interface InvoiceFormValues {
  customerId: string;
  taxProfileId: string;

  companyName: string;
  contactName: string;
  addressLine: string;
  street: string;
  postalCode: string;
  city: string;
  country: string;
  email: string;
  vatId: string;
  customerNumber: string;
  /** BT-10, für die E-Rechnung. Bei Behörden die Leitweg-ID. */
  buyerReference: string;
  /** BT-49 samt Schema. */
  electronicAddress: string;
  electronicAddressScheme: string;

  invoiceDate: string;
  serviceDate: string;
  serviceDateTo: string;
  dueDate: string;

  notes: string;
  footerNote: string;
  internalNotes: string;

  items: InvoiceItemFormValues[];
}

export function toInvoiceFormValues(invoice: InvoiceResponse): InvoiceFormValues {
  return {
    customerId: invoice.customerId === null ? '' : String(invoice.customerId),
    taxProfileId: invoice.taxProfileId === null ? '' : String(invoice.taxProfileId),
    ...buyerDataToFormFields(invoice.buyerData),
    invoiceDate: invoice.invoiceDate,
    serviceDate: invoice.serviceDate,
    serviceDateTo: invoice.serviceDateTo ?? '',
    dueDate: invoice.dueDate,
    notes: invoice.notes ?? '',
    footerNote: invoice.footerNote ?? '',
    internalNotes: invoice.internalNotes ?? '',
    items: invoice.items.map((item) => ({
      description: item.description,
      quantity: quantityToInput(item.quantity),
      unit: item.unit ?? '',
      unitCode: item.unitCode,
      unitPriceCents: centsToInput(item.unitPriceCents),
      discountType: item.discountType,
      discountValue:
        item.discountValue === 0
          ? ''
          : item.discountType === DISCOUNT_TYPE.PERCENT
            ? basisPointsToPercentInput(item.discountValue)
            : centsToInput(item.discountValue),
      taxRateBasisPoints: basisPointsToPercentInput(item.taxRateBasisPoints),
    })),
  };
}

/** Bringt die Formularwerte in die Form, die das geteilte Schema erwartet. */
export function toInvoicePayload(values: InvoiceFormValues): Record<string, unknown> {
  return {
    customerId: values.customerId,
    taxProfileId: values.taxProfileId,
    buyerData: {
      companyName: values.companyName,
      contactName: values.contactName,
      addressLine: values.addressLine,
      street: values.street,
      postalCode: values.postalCode,
      city: values.city,
      country: values.country,
      email: values.email,
      vatId: values.vatId,
      customerNumber: values.customerNumber,
      buyerReference: values.buyerReference,
      electronicAddress: values.electronicAddress,
      electronicAddressScheme: values.electronicAddressScheme,
    },
    invoiceDate: values.invoiceDate,
    serviceDate: values.serviceDate,
    serviceDateTo: values.serviceDateTo,
    dueDate: values.dueDate,
    notes: values.notes,
    footerNote: values.footerNote,
    internalNotes: values.internalNotes,
    items: values.items,
  };
}
