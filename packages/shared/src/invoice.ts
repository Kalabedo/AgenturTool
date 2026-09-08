import { z } from 'zod';
import {
  DISCOUNT_TYPE,
  DISCOUNT_TYPE_VALUES,
  DOCUMENT_TYPE_VALUES,
  INVOICE_STATUS,
  INVOICE_STATUS_VALUES,
  type DiscountType,
  type DocumentType,
  type InvoiceStatus,
} from './enums.js';
import { addDays, isoDateSchema, todayIso, type IsoDate } from './date.js';
import { parseCents, parsePercentToBasisPoints, parseQuantity } from './money.js';
import { CURRENT_SNAPSHOT_VERSION, type BuyerData, type TotalsSnapshot } from './snapshots.js';
import type { CustomerResponse } from './customer.js';

/**
 * Verträge für Rechnungen — in diesem Schritt ausschließlich für Entwürfe.
 *
 * Das Finalisieren mit Nummernvergabe, Snapshots und PDF folgt in Schritt 9.
 * Bis dahin gilt: Ein Entwurf ist frei bearbeitbar, hat keine Nummer, und
 * seine Beträge werden bei jedem Speichern neu berechnet.
 */

const optionalText = z
  .string()
  .trim()
  .transform((value) => (value === '' ? null : value))
  .nullable();

/** Menge als Eingabe ("7,5") oder bereits in Tausendsteln. */
const quantityField = z.union([z.string().trim(), z.number()]).transform((value, ctx) => {
  if (typeof value === 'number') return value;

  const parsed = parseQuantity(value);
  if (parsed === null) {
    ctx.addIssue({ code: z.ZodIssueCode.custom, message: 'Bitte eine Menge angeben, z. B. 7,5' });
    return z.NEVER;
  }
  return parsed;
});

/** Betrag als Eingabe ("120,00") oder bereits in Cent. */
const moneyField = z.union([z.string().trim(), z.number()]).transform((value, ctx) => {
  if (typeof value === 'number') return value;
  if (value === '') return 0;

  const parsed = parseCents(value);
  if (parsed === null) {
    ctx.addIssue({
      code: z.ZodIssueCode.custom,
      message: 'Bitte einen Betrag angeben, z. B. 120,00',
    });
    return z.NEVER;
  }
  return parsed;
});

/**
 * Rechnungsposition.
 *
 * `discountValue` wird erst auf Objektebene umgerechnet, weil seine Bedeutung
 * von `discountType` abhängt: Basispunkte bei Prozent, Cent bei einem festen
 * Betrag. Ein Feld allein könnte das nicht wissen.
 */
export const invoiceItemInputSchema = z
  .object({
    description: z.string().trim().min(1, 'Bitte eine Beschreibung angeben').max(1000),
    quantity: quantityField,
    unit: optionalText,
    unitPriceCents: moneyField,
    discountType: z.enum(DISCOUNT_TYPE_VALUES as [DiscountType, ...DiscountType[]]),
    discountValue: z.union([z.string().trim(), z.number()]),
    taxRateBasisPoints: z.union([z.string().trim(), z.number()]),
  })
  .transform((item, ctx) => {
    const discountValue = parseDiscount(item.discountType, item.discountValue);
    if (discountValue === null) {
      ctx.addIssue({
        code: z.ZodIssueCode.custom,
        path: ['discountValue'],
        message:
          item.discountType === DISCOUNT_TYPE.PERCENT
            ? 'Bitte einen Prozentsatz zwischen 0 und 100 angeben'
            : 'Bitte einen Betrag angeben, z. B. 25,00',
      });
      return z.NEVER;
    }

    const taxRateBasisPoints =
      typeof item.taxRateBasisPoints === 'number'
        ? item.taxRateBasisPoints
        : parsePercentToBasisPoints(item.taxRateBasisPoints);

    if (taxRateBasisPoints === null || taxRateBasisPoints < 0 || taxRateBasisPoints > 10_000) {
      ctx.addIssue({
        code: z.ZodIssueCode.custom,
        path: ['taxRateBasisPoints'],
        message: 'Bitte einen Steuersatz zwischen 0 und 100 angeben',
      });
      return z.NEVER;
    }

    return { ...item, discountValue, taxRateBasisPoints };
  });

function parseDiscount(type: DiscountType, raw: string | number): number | null {
  if (typeof raw === 'number') return raw;
  if (raw.trim() === '') return 0;
  return type === DISCOUNT_TYPE.PERCENT ? parsePercentToBasisPoints(raw) : parseCents(raw);
}

export type InvoiceItemInput = z.input<typeof invoiceItemInputSchema>;
export type InvoiceItemPayload = z.output<typeof invoiceItemInputSchema>;

/**
 * Empfängerdaten im Entwurf.
 *
 * Das Formular führt die Adresse flach — vier nebeneinanderliegende Felder
 * sind einfacher zu bedienen als eine verschachtelte Gruppe. Gespeichert
 * wird sie verschachtelt, in derselben Form wie der spätere Snapshot.
 * Die Umwandlung passiert hier, damit sie nicht im Service oder im
 * Formular nachgebaut werden muss.
 */
const buyerDataInputSchema = z
  .object({
    companyName: z.string().trim().min(1, 'Bitte einen Empfänger angeben').max(200),
    contactName: optionalText,
    addressLine: optionalText,
    street: z.string().trim().max(200),
    postalCode: z.string().trim().max(20),
    city: z.string().trim().max(120),
    country: z.string().trim().max(80),
    email: optionalText,
    vatId: optionalText,
    customerNumber: optionalText,
  })
  .transform((buyer): BuyerData => ({
    snapshotVersion: CURRENT_SNAPSHOT_VERSION,
    companyName: buyer.companyName,
    contactName: buyer.contactName,
    addressLine: buyer.addressLine,
    address: {
      street: buyer.street,
      postalCode: buyer.postalCode,
      city: buyer.city,
      country: buyer.country,
    },
    email: buyer.email,
    vatId: buyer.vatId,
    customerNumber: buyer.customerNumber,
  }));

/** Zerlegt gespeicherte Empfängerdaten wieder in die flachen Formularfelder. */
export function buyerDataToFormFields(buyer: BuyerData): {
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
} {
  return {
    companyName: buyer.companyName,
    contactName: buyer.contactName ?? '',
    addressLine: buyer.addressLine ?? '',
    street: buyer.address.street,
    postalCode: buyer.address.postalCode,
    city: buyer.address.city,
    country: buyer.address.country,
    email: buyer.email ?? '',
    vatId: buyer.vatId ?? '',
    customerNumber: buyer.customerNumber ?? '',
  };
}

export const invoiceDraftInputSchema = z
  .object({
    /** Nur Verweis für Listen und Filter; dargestellt wird buyerData. */
    customerId: z.union([z.string().trim(), z.number(), z.null()]).transform((value) => {
      if (value === null || value === '') return null;
      const parsed = typeof value === 'number' ? value : Number(value);
      return Number.isInteger(parsed) && parsed > 0 ? parsed : null;
    }),
    taxProfileId: z.union([z.string().trim(), z.number(), z.null()]).transform((value) => {
      if (value === null || value === '') return null;
      const parsed = typeof value === 'number' ? value : Number(value);
      return Number.isInteger(parsed) && parsed > 0 ? parsed : null;
    }),

    buyerData: buyerDataInputSchema,

    invoiceDate: isoDateSchema,
    serviceDate: isoDateSchema,
    serviceDateTo: z
      .union([z.string().trim(), z.null()])
      .transform((value) => (value === null || value === '' ? null : value))
      .pipe(isoDateSchema.nullable()),
    dueDate: isoDateSchema,

    notes: optionalText,
    footerNote: optionalText,
    internalNotes: optionalText,

    items: z.array(invoiceItemInputSchema),
  })
  .superRefine((invoice, ctx) => {
    // Ein Fälligkeitsdatum vor dem Rechnungsdatum ist keine Backdatierung,
    // sondern ein Tippfehler — die Rechnung wäre bei Ausstellung schon
    // überfällig.
    if (invoice.dueDate < invoice.invoiceDate) {
      ctx.addIssue({
        code: z.ZodIssueCode.custom,
        path: ['dueDate'],
        message: 'Das Fälligkeitsdatum darf nicht vor dem Rechnungsdatum liegen',
      });
    }

    if (invoice.serviceDateTo !== null && invoice.serviceDateTo < invoice.serviceDate) {
      ctx.addIssue({
        code: z.ZodIssueCode.custom,
        path: ['serviceDateTo'],
        message: 'Das Ende des Leistungszeitraums darf nicht vor dem Beginn liegen',
      });
    }
  });

export type InvoiceDraftInput = z.input<typeof invoiceDraftInputSchema>;
export type InvoiceDraftPayload = z.output<typeof invoiceDraftInputSchema>;

export interface InvoiceItemResponse {
  id: number;
  position: number;
  description: string;
  quantity: number;
  unit: string | null;
  unitPriceCents: number;
  discountType: DiscountType;
  discountValue: number;
  taxRateBasisPoints: number;
  lineDiscountCents: number;
  lineNetCents: number;
}

export interface InvoiceResponse {
  id: number;
  documentType: DocumentType;
  status: InvoiceStatus;
  /** Bei Entwürfen null — die Nummer entsteht erst beim Finalisieren. */
  number: string | null;
  currency: string;

  customerId: number | null;
  taxProfileId: number | null;

  buyerData: BuyerData;

  invoiceDate: string;
  serviceDate: string;
  serviceDateTo: string | null;
  dueDate: string;

  notes: string | null;
  footerNote: string | null;
  internalNotes: string | null;

  items: InvoiceItemResponse[];
  /** Vom Server berechnet — maßgeblich, auch wenn das Formular mitrechnet. */
  totals: TotalsSnapshot;

  issuedAt: string | null;
  sentAt: string | null;
  paidAt: string | null;
  cancelledAt: string | null;

  createdAt: string;
  updatedAt: string;
}

export const invoiceListQuerySchema = z.object({
  q: z.string().trim().max(200).optional(),
  status: z.enum(INVOICE_STATUS_VALUES as [InvoiceStatus, ...InvoiceStatus[]]).optional(),
  customerId: z.coerce.number().int().positive().optional(),
  year: z.coerce.number().int().min(1900).max(9999).optional(),
});
export type InvoiceListQuery = z.output<typeof invoiceListQuerySchema>;

/**
 * Kopiert die Kundendaten in die Rechnung (D9).
 *
 * Bewusst eine Kopie und kein Verweis: Abweichende Rechnungsanschriften,
 * ein „z. Hd." oder eine andere Abteilung sind Alltag. Ein Button in der
 * Oberfläche holt den aktuellen Stammdatenstand nach, wenn er gewünscht ist.
 */
export function customerToBuyerData(customer: CustomerResponse): BuyerData {
  return {
    snapshotVersion: CURRENT_SNAPSHOT_VERSION,
    companyName: customer.companyName,
    contactName: customer.contactName,
    addressLine: customer.addressLine,
    address: {
      street: customer.street,
      postalCode: customer.postalCode,
      city: customer.city,
      country: customer.country,
    },
    email: customer.email,
    vatId: customer.vatId,
    customerNumber: customer.customerNumber,
  };
}

/** Leere Empfängerdaten für eine Rechnung ohne ausgewählten Kunden. */
export function emptyBuyerData(): BuyerData {
  return {
    snapshotVersion: CURRENT_SNAPSHOT_VERSION,
    companyName: '',
    contactName: null,
    addressLine: null,
    address: { street: '', postalCode: '', city: '', country: 'DE' },
    email: null,
    vatId: null,
    customerNumber: null,
  };
}

export interface InvoiceDateDefaults {
  invoiceDate: IsoDate;
  serviceDate: IsoDate;
  dueDate: IsoDate;
}

/** Vorbelegung der Datumsfelder einer neuen Rechnung. */
export function defaultInvoiceDates(
  paymentTermDays: number,
  today: IsoDate = todayIso(),
): InvoiceDateDefaults {
  return {
    invoiceDate: today,
    serviceDate: today,
    dueDate: addDays(today, paymentTermDays),
  };
}

/**
 * Ob eine Rechnung noch bearbeitet werden darf.
 *
 * Die eine Stelle, an der diese Frage beantwortet wird — Oberfläche und
 * Service greifen beide darauf zu, damit die Sperre nicht an zwei Orten
 * unterschiedlich ausgelegt wird.
 */
export function isEditable(status: InvoiceStatus): boolean {
  return status === INVOICE_STATUS.DRAFT;
}

/** Anzeigename: Nummer, sonst „Entwurf #12“. */
export function invoiceDisplayName(invoice: Pick<InvoiceResponse, 'id' | 'number'>): string {
  return invoice.number ?? `Entwurf #${invoice.id}`;
}

export const INVOICE_STATUS_LABELS: Record<InvoiceStatus, string> = {
  [INVOICE_STATUS.DRAFT]: 'Entwurf',
  [INVOICE_STATUS.ISSUED]: 'Ausgestellt',
  [INVOICE_STATUS.PAID]: 'Bezahlt',
  [INVOICE_STATUS.CANCELLED]: 'Storniert',
};

/**
 * Überfällig wird nicht gespeichert, sondern berechnet (Abschnitt 8) —
 * sonst bräuchte es einen nächtlichen Lauf, der Zustände umschreibt, und ein
 * Backup vom Vortag hätte falsche Angaben.
 */
export function isOverdue(
  invoice: Pick<InvoiceResponse, 'status' | 'dueDate'>,
  today: IsoDate = todayIso(),
): boolean {
  return invoice.status === INVOICE_STATUS.ISSUED && invoice.dueDate < today;
}

export const DOCUMENT_TYPE_LABELS: Record<DocumentType, string> = {
  INVOICE: 'Rechnung',
  CANCELLATION: 'Storno',
};

export const DOCUMENT_TYPES = DOCUMENT_TYPE_VALUES;
