import { DISCOUNT_TYPE, type DiscountType } from './enums.js';
import { applyBasisPoints, multiplyQuantity, roundHalfAwayFromZero } from './money.js';
import { CURRENT_SNAPSHOT_VERSION, type TaxGroup, type TotalsSnapshot } from './snapshots.js';

/**
 * Der verbindliche Rechenweg (docs/ARCHITEKTUR.md, Abschnitt 7).
 *
 * Diese Datei ist die einzige Stelle, an der Rechnungsbeträge entstehen.
 * Frontend und Backend rufen dieselbe Funktion auf — das Backend rechnet
 * beim Speichern und Finalisieren autoritativ neu, das Frontend nur für die
 * sofortige Anzeige. Zwei Implementierungen liefen mit Sicherheit
 * irgendwann auseinander, und der Unterschied fiele erst auf einer
 * ausgestellten Rechnung auf.
 *
 * Die Funktion rechnet und bewertet nicht: Sie prüft weder, ob ein Rabatt
 * größer als die Position ist, noch ob ein Steuersatz zum Steuerprofil
 * passt. Solche Regeln gehören in die Schemas und in die Prüfung beim
 * Finalisieren — hier würden sie den Storno unmöglich machen, der
 * legitimerweise mit negativen Beträgen arbeitet.
 */

export interface InvoiceCalculationItem {
  /** Menge in Tausendstel: 7,5 h = 7500 */
  quantity: number;
  unitPriceCents: number;
  discountType: DiscountType;
  /** Basispunkte bei PERCENT, Cent bei AMOUNT. */
  discountValue: number;
  /** Basispunkte: 19 % = 1900 */
  taxRateBasisPoints: number;
}

export interface CalculatedInvoiceItem {
  /** Menge mal Einzelpreis, vor Rabatt. */
  baseCents: number;
  discountCents: number;
  /** Betrag, der in die Steuersatzgruppe eingeht. */
  netCents: number;
}

export interface InvoiceCalculation {
  /** In derselben Reihenfolge wie die übergebenen Positionen. */
  items: CalculatedInvoiceItem[];
  /** Aufsteigend nach Steuersatz — so steht es auch auf der Rechnung. */
  taxGroups: TaxGroup[];
  netCents: number;
  taxCents: number;
  grossCents: number;
  totalDiscountCents: number;
}

/**
 * Berechnet eine einzelne Position.
 *
 * Schritte 1 bis 3 des Rechenwegs. Der Rabatt wird auf den Cent gerundet,
 * bevor er abgezogen wird — sonst schleppte man Bruchteile in die
 * Gruppensumme, und die Zeile auf dem Papier ließe sich nicht mehr
 * nachrechnen.
 */
export function calculateItem(item: InvoiceCalculationItem): CalculatedInvoiceItem {
  const baseCents = multiplyQuantity(item.quantity, item.unitPriceCents);

  const discountCents =
    item.discountType === DISCOUNT_TYPE.PERCENT
      ? applyBasisPoints(baseCents, item.discountValue)
      : item.discountValue;

  return {
    baseCents,
    discountCents,
    netCents: baseCents - discountCents,
  };
}

/**
 * Berechnet die gesamte Rechnung.
 *
 * Der entscheidende Punkt ist Schritt 4/5: Die Steuer wird **je
 * Steuersatzgruppe auf der Nettosumme** berechnet, nicht je Position und
 * dann addiert. Bei mehreren Positionen mit krummen Beträgen weicht die
 * Summe der zeilenweise gerundeten Steuerbeträge sonst von der Steuer auf
 * das Gesamtentgelt ab — und der Steuerausweis auf der Rechnung stimmte
 * nicht mit dem aus, was tatsächlich geschuldet wird.
 */
export function calculateInvoice(items: InvoiceCalculationItem[]): InvoiceCalculation {
  const calculatedItems = items.map(calculateItem);

  // Nach Steuersatz gruppieren. Map bewahrt die Einfügereihenfolge, sortiert
  // wird anschließend bewusst nach Satz statt nach Vorkommen.
  const netByRate = new Map<number, number>();
  for (const [index, item] of items.entries()) {
    const rate = item.taxRateBasisPoints;
    const net = calculatedItems[index]?.netCents ?? 0;
    netByRate.set(rate, (netByRate.get(rate) ?? 0) + net);
  }

  const taxGroups: TaxGroup[] = [...netByRate.entries()]
    .sort(([a], [b]) => a - b)
    .map(([rateBasisPoints, netCents]) => ({
      rateBasisPoints,
      netCents,
      taxCents: applyBasisPoints(netCents, rateBasisPoints),
    }));

  const netCents = taxGroups.reduce((sum, group) => sum + group.netCents, 0);
  const taxCents = taxGroups.reduce((sum, group) => sum + group.taxCents, 0);
  const totalDiscountCents = calculatedItems.reduce((sum, item) => sum + item.discountCents, 0);

  return {
    items: calculatedItems,
    taxGroups,
    netCents,
    taxCents,
    grossCents: netCents + taxCents,
    totalDiscountCents,
  };
}

/** Übersetzt das Rechenergebnis in den Snapshot, der beim Finalisieren einfriert. */
export function toTotalsSnapshot(calculation: InvoiceCalculation): TotalsSnapshot {
  return {
    snapshotVersion: CURRENT_SNAPSHOT_VERSION,
    netCents: calculation.netCents,
    taxCents: calculation.taxCents,
    grossCents: calculation.grossCents,
    totalDiscountCents: calculation.totalDiscountCents,
    taxGroups: calculation.taxGroups,
  };
}

/**
 * Erzeugt die Gegenposition für ein Storno-Dokument.
 *
 * Umgekehrt wird die **Menge**, nicht der Einzelpreis — so bleibt auf dem
 * Storno erkennbar, zu welchem Preis ursprünglich abgerechnet wurde. Ein
 * absoluter Rabatt muss mitgedreht werden, ein prozentualer nicht: Der
 * Prozentsatz gilt unverändert, nur die Bezugsgröße ist negativ.
 *
 * Dass Original und Storno sich exakt zu null ausgleichen, hängt am
 * symmetrischen Runden in `roundHalfAwayFromZero` — mit `Math.round` ergäbe
 * sich bei Beträgen auf halbem Cent eine Differenz. Ein Test prüft das.
 */
export function negateInvoiceItem(item: InvoiceCalculationItem): InvoiceCalculationItem {
  return {
    ...item,
    quantity: -item.quantity,
    discountValue:
      item.discountType === DISCOUNT_TYPE.AMOUNT ? -item.discountValue : item.discountValue,
  };
}

export function negateInvoiceItems(items: InvoiceCalculationItem[]): InvoiceCalculationItem[] {
  return items.map(negateInvoiceItem);
}

/**
 * Berechnet den Bruttobetrag einer einzelnen Position.
 *
 * Nur für die Anzeige in der Positionszeile gedacht. Die Summe dieser Werte
 * ist **nicht** der Rechnungsbetrag — der entsteht über die
 * Steuersatzgruppen und kann um einzelne Cent abweichen.
 */
export function itemGrossForDisplay(item: InvoiceCalculationItem): number {
  const { netCents } = calculateItem(item);
  return netCents + applyBasisPoints(netCents, item.taxRateBasisPoints);
}

/** Fälligkeitsdatum aus Rechnungsdatum und Zahlungsziel. */
export function resolvePaymentTermDays(
  customerTermDays: number | null,
  companyTermDays: number,
): number {
  // Leer beim Kunden heißt "Vorgabe des Unternehmens verwenden", nicht
  // "null Tage" — deshalb der Vergleich gegen null statt auf Wahrheitswert.
  return customerTermDays ?? companyTermDays;
}

/** Rundet einen Betrag auf volle Euro — für spätere Auswertungen. */
export function roundToEuro(cents: number): number {
  return roundHalfAwayFromZero(cents / 100) * 100;
}
