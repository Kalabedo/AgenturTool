import {
  calculateInvoice,
  toTotalsSnapshot,
  type BuyerData,
  type DiscountType,
  type DocumentType,
  type IsoDate,
  type SellerSnapshot,
  type TaxSnapshot,
  type TemplateSnapshot,
  type TotalsSnapshot,
  type UnitCode,
} from '@agentur-tool/shared';
import type { InvoiceRenderModel, InvoiceRenderItem } from './types.js';

/** Eine Position, wie sie im Entwurf oder in der Datenbank steht. */
export interface RenderModelSourceItem {
  description: string;
  /** Tausendstel: 7,5 h = 7500 */
  quantity: number;
  /** Das gedruckte Etikett. */
  unit: string | null;
  /**
   * BT-130: Mengeneinheit als Code.
   *
   * Steht hier, obwohl das Template ihn nicht druckt: Dieselbe Quelle
   * speist die Vorschau, das PDF und die E-Rechnung. Zwei getrennte
   * Quellen wären genau der stille Fehler, den Abschnitt 12 beschreibt.
   */
  unitCode: UnitCode;
  unitPriceCents: number;
  discountType: DiscountType;
  /** Basispunkte bei PERCENT, Cent bei AMOUNT. */
  discountValue: number;
  /** Basispunkte: 19 % = 1900 */
  taxRateBasisPoints: number;
}

export interface RenderModelSource {
  documentType: DocumentType;
  number: string | null;
  invoiceDate: IsoDate;
  serviceDate: IsoDate;
  serviceDateTo: IsoDate | null;
  dueDate: IsoDate;
  currency: string;
  seller: SellerSnapshot;
  buyer: BuyerData;
  tax: TaxSnapshot;
  template: TemplateSnapshot;
  notes: string | null;
  footerNote: string | null;
  logoSrc: string | null;
  items: RenderModelSourceItem[];
}

/**
 * Setzt das Render-Modell zusammen.
 *
 * `frozenTotals` entscheidet über den wichtigsten Unterschied zwischen den
 * beiden Aufrufern:
 *
 * - **Entwurf, Live-Vorschau:** weggelassen. Die Summen entstehen hier aus
 *   `calculateInvoice`, also aus demselben Rechenweg, den das Backend beim
 *   Speichern benutzt.
 * - **Finalisierte Rechnung:** der gespeicherte `totalsSnapshot`. Ein
 *   erneutes Ausrechnen wäre hier ein Fehler — sollte sich der Rechenweg je
 *   ändern, druckte dieselbe Rechnung plötzlich andere Beträge als das
 *   Exemplar, das der Kunde bereits hat.
 *
 * Die Zeilenbeträge stammen in beiden Fällen aus der Berechnung. Das ist
 * kein Widerspruch: Sie sind aus den unveränderlichen Positionen jederzeit
 * reproduzierbar, und für sie gibt es keinen eigenen Snapshot.
 */
export function buildRenderModel(
  source: RenderModelSource,
  frozenTotals?: TotalsSnapshot,
): InvoiceRenderModel {
  const calculation = calculateInvoice(
    source.items.map((item) => ({
      quantity: item.quantity,
      unitPriceCents: item.unitPriceCents,
      discountType: item.discountType,
      discountValue: item.discountValue,
      taxRateBasisPoints: item.taxRateBasisPoints,
    })),
  );

  const items: InvoiceRenderItem[] = source.items.map((item, index) => {
    const calculated = calculation.items[index];
    return {
      position: index + 1,
      description: item.description,
      quantity: item.quantity,
      unit: item.unit,
      unitPriceCents: item.unitPriceCents,
      discountType: item.discountType,
      discountValue: item.discountValue,
      discountCents: calculated?.discountCents ?? 0,
      taxRateBasisPoints: item.taxRateBasisPoints,
      netCents: calculated?.netCents ?? 0,
    };
  });

  return {
    documentType: source.documentType,
    number: source.number,
    invoiceDate: source.invoiceDate,
    serviceDate: source.serviceDate,
    serviceDateTo: source.serviceDateTo,
    dueDate: source.dueDate,
    currency: source.currency,
    seller: source.seller,
    buyer: source.buyer,
    tax: source.tax,
    template: source.template,
    totals: frozenTotals ?? toTotalsSnapshot(calculation),
    items,
    notes: source.notes,
    footerNote: source.footerNote,
    logoSrc: source.logoSrc,
  };
}
