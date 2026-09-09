import { z } from 'zod';
import {
  DISCOUNT_TYPE,
  DISCOUNT_TYPE_VALUES,
  DOCUMENT_TYPE,
  DOCUMENT_TYPE_VALUES,
  INVOICE_STATUS,
  INVOICE_STATUS_VALUES,
  type DiscountType,
  type DocumentType,
  type InvoiceStatus,
} from './enums.js';
import { addDays, formatDateDe, isoDateSchema, todayIso, type IsoDate } from './date.js';
import { parseCents, parsePercentToBasisPoints, parseQuantity } from './money.js';
import { CURRENT_SNAPSHOT_VERSION, type BuyerData, type TotalsSnapshot } from './snapshots.js';
import type { CustomerResponse } from './customer.js';
import { pageQuerySchema, type PaginatedResponse } from './pagination.js';

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

/**
 * „Bezahlt am" setzen oder entfernen.
 *
 * Ein Kalendertag, kein Zeitstempel: Wann das Geld da war, steht auf dem
 * Kontoauszug als Datum — und `PAID` ist in V1 genau dieses eine Feld (D7).
 */
export const invoicePaymentInputSchema = z.object({
  paidAt: z
    .union([z.string().trim(), z.null()])
    .transform((value) => (value === null || value === '' ? null : value))
    .pipe(isoDateSchema.nullable()),
});
export type InvoicePaymentPayload = z.output<typeof invoicePaymentInputSchema>;

/**
 * „Versendet" setzen oder entfernen.
 *
 * Anders als das Zahldatum ein echter Zeitstempel — er hält fest, wann die
 * Rechnung das Haus verlassen hat. Fehlt die Angabe, gilt „jetzt": Der
 * übliche Fall ist der Klick unmittelbar nach dem Versenden.
 */
export const invoiceSentInputSchema = z.object({
  sentAt: z
    .union([z.string().trim(), z.null()])
    .optional()
    .transform((value) => {
      if (value === null) return null;
      if (value === undefined || value === '') return new Date().toISOString();
      return value;
    })
    .pipe(z.string().datetime().nullable()),
});
export type InvoiceSentPayload = z.output<typeof invoiceSentInputSchema>;

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

  /** Bei einem Storno: die Rechnung, die es aufhebt. */
  cancelsInvoiceId: number | null;
  /** Bei einer stornierten Rechnung: das Storno-Dokument dazu. */
  cancelledByInvoiceId: number | null;

  /** Ob ein gespeichertes PDF vorliegt (entsteht beim Finalisieren). */
  hasDocument: boolean;
  /**
   * Datensatz vorhanden, Datei nicht — reparierbar, weil der Snapshot alles
   * enthält, was das Dokument braucht (Abschnitt 13).
   */
  documentMissing: boolean;
  /** Ob „Finalisierung zurücknehmen" gerade erlaubt ist. */
  canUnfinalize: boolean;
  /** Warum nicht — `null`, wenn es erlaubt ist. */
  unfinalizeBlocker: string | null;

  issuedAt: string | null;
  sentAt: string | null;
  paidAt: string | null;
  cancelledAt: string | null;

  createdAt: string;
  updatedAt: string;
}

/**
 * Wonach sich die Übersicht sortieren lässt.
 *
 * Bewusst nur drei Felder, und alle drei sind Spalten in der Datenbank: Nach
 * dem Betrag zu sortieren klingt naheliegend, hieße aber, alle Rechnungen zu
 * laden und im Speicher zu sortieren — die Summe steht je nach Zustand in
 * einem JSON-Snapshot oder wird berechnet. Das wäre eine Sortierung, die bei
 * tausend Rechnungen langsam wird, für eine Frage, die man selten stellt.
 */
export const INVOICE_SORT_FIELD = {
  INVOICE_DATE: 'invoiceDate',
  DUE_DATE: 'dueDate',
  NUMBER: 'number',
} as const;
export type InvoiceSortField = (typeof INVOICE_SORT_FIELD)[keyof typeof INVOICE_SORT_FIELD];
export const INVOICE_SORT_FIELD_VALUES = Object.values(INVOICE_SORT_FIELD);

export const INVOICE_SORT_LABELS: Record<InvoiceSortField, string> = {
  invoiceDate: 'Rechnungsdatum',
  dueDate: 'Fälligkeit',
  number: 'Nummer',
};

export const SORT_ORDER = { ASC: 'asc', DESC: 'desc' } as const;
export type SortOrder = (typeof SORT_ORDER)[keyof typeof SORT_ORDER];

export const invoiceListQuerySchema = pageQuerySchema.extend({
  q: z.string().trim().max(200).optional(),
  status: z.enum(INVOICE_STATUS_VALUES as [InvoiceStatus, ...InvoiceStatus[]]).optional(),
  documentType: z.enum(DOCUMENT_TYPE_VALUES as [DocumentType, ...DocumentType[]]).optional(),
  customerId: z.coerce.number().int().positive().optional(),
  year: z.coerce.number().int().min(1900).max(9999).optional(),

  /**
   * Nur überfällige: ausgestellt und Fälligkeitsdatum vorbei.
   *
   * Als Filter und nicht als Status, weil „überfällig" nichts ist, was
   * gespeichert wird — es ergibt sich aus dem heutigen Datum (Abschnitt 8).
   */
  overdue: z
    .union([z.boolean(), z.string()])
    .optional()
    .transform((value) => value === true || value === 'true' || value === '1'),

  sort: z
    .enum(INVOICE_SORT_FIELD_VALUES as [InvoiceSortField, ...InvoiceSortField[]])
    .default(INVOICE_SORT_FIELD.INVOICE_DATE),
  order: z.enum(['asc', 'desc']).default('desc'),
});
export type InvoiceListQuery = z.output<typeof invoiceListQuerySchema>;
export type InvoiceListResponse = PaginatedResponse<InvoiceResponse>;

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

/**
 * Ob zu dieser Rechnung ein Storno erzeugt werden darf.
 *
 * Ausgestellt oder bezahlt, noch nicht storniert, und selbst kein Storno:
 * Ein Storno auf ein Storno wäre eine Wiederherstellung, und die gibt es
 * bewusst nicht — wer die Leistung doch abrechnen will, dupliziert die
 * Originalrechnung und stellt sie neu aus.
 */
export function isCancellable(
  invoice: Pick<InvoiceResponse, 'status' | 'documentType' | 'cancelledByInvoiceId'>,
): boolean {
  return (
    invoice.documentType === DOCUMENT_TYPE.INVOICE &&
    (invoice.status === INVOICE_STATUS.ISSUED || invoice.status === INVOICE_STATUS.PAID) &&
    invoice.cancelledByInvoiceId === null
  );
}

/** Der Hinweistext, der auf dem Storno-Dokument steht. */
export function cancellationNote(number: string, invoiceDate: IsoDate): string {
  return `Storno zur Rechnung ${number} vom ${formatDateDe(invoiceDate)}.`;
}

export const DOCUMENT_TYPE_LABELS: Record<DocumentType, string> = {
  INVOICE: 'Rechnung',
  CANCELLATION: 'Storno',
};

export const DOCUMENT_TYPES = DOCUMENT_TYPE_VALUES;
