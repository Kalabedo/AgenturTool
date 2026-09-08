import {
  DISCOUNT_TYPE,
  calculateInvoice,
  parseCents,
  parsePercentToBasisPoints,
  parseQuantity,
  type InvoiceCalculation,
} from '@agentur-tool/shared';
import type { InvoiceItemFormValues } from './invoiceFormValues.js';

/**
 * Berechnet die Summen aus den aktuellen Formularwerten.
 *
 * Bewusst nachsichtig: Während des Tippens steht in einem Feld
 * zwischenzeitlich „12," oder gar nichts. Solche Zwischenstände werden als 0
 * gewertet, statt die Anzeige durch eine Fehlermeldung zu ersetzen — die
 * Validierung greift erst beim Absenden.
 *
 * Maßgeblich sind diese Zahlen nicht: Der Server rechnet mit derselben
 * Funktion neu, und seine Werte werden gespeichert. Hier geht es nur darum,
 * dass die Summe beim Tippen mitläuft.
 *
 * Bewusst **ohne** useMemo: React Hook Form verändert das Werte-Array an Ort
 * und Stelle, die Referenz bleibt also gleich. Ein Memo darauf würde erst
 * neu rechnen, wenn sich die Zahl der Positionen ändert — die zuletzt
 * getippte Zeile bliebe bis dahin bei 0,00 € stehen. Die Berechnung selbst
 * sind ein paar Array-Operationen und kostet nichts.
 */
export function useInvoiceTotals(items: InvoiceItemFormValues[]): InvoiceCalculation {
  return calculateInvoice(
    items.map((item) => ({
      quantity: parseQuantity(item.quantity ?? '') ?? 0,
      unitPriceCents: parseCents(item.unitPriceCents ?? '') ?? 0,
      discountType: item.discountType,
      discountValue:
        (item.discountType === DISCOUNT_TYPE.PERCENT
          ? parsePercentToBasisPoints(item.discountValue ?? '')
          : parseCents(item.discountValue ?? '')) ?? 0,
      taxRateBasisPoints: parsePercentToBasisPoints(item.taxRateBasisPoints ?? '') ?? 0,
    })),
  );
}
