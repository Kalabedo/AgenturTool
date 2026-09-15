import { calculateInvoice, type InvoiceCalculation } from '@privatura/shared';
import type { InvoiceItemFormValues } from './invoiceFormValues.js';
import { toCalculationItems } from './toCalculationItems.js';

/**
 * Berechnet die Summen aus den aktuellen Formularwerten.
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
  return calculateInvoice(toCalculationItems(items));
}
