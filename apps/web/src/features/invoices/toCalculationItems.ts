import {
  DISCOUNT_TYPE,
  parseCents,
  parsePercentToBasisPoints,
  parseQuantity,
  type InvoiceCalculationItem,
} from '@agentur-tool/shared';
import type { InvoiceItemFormValues } from './invoiceFormValues.js';

/**
 * Übersetzt die Formularwerte in die Zahlenform des Rechenwegs.
 *
 * Bewusst nachsichtig: Während des Tippens steht in einem Feld
 * zwischenzeitlich „12," oder gar nichts. Solche Zwischenstände werden als 0
 * gewertet, statt die Anzeige durch eine Fehlermeldung zu ersetzen — die
 * Validierung greift erst beim Absenden.
 *
 * Summenanzeige und Vorschau benutzen dieselbe Übersetzung. Zwei Varianten
 * davon würden früher oder später verschieden runden, und der Unterschied
 * fiele erst auf, wenn Vorschau und Beträge unter dem Formular auseinander
 * liefen.
 */
export function toCalculationItems(items: InvoiceItemFormValues[]): InvoiceCalculationItem[] {
  return items.map((item) => ({
    quantity: parseQuantity(item.quantity ?? '') ?? 0,
    unitPriceCents: parseCents(item.unitPriceCents ?? '') ?? 0,
    discountType: item.discountType,
    discountValue:
      (item.discountType === DISCOUNT_TYPE.PERCENT
        ? parsePercentToBasisPoints(item.discountValue ?? '')
        : parseCents(item.discountValue ?? '')) ?? 0,
    taxRateBasisPoints: parsePercentToBasisPoints(item.taxRateBasisPoints ?? '') ?? 0,
  }));
}
