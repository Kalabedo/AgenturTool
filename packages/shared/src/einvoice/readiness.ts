import { CATEGORIES_NEEDING_EXEMPTION_REASON, type TaxCategoryCode } from './codes.js';
import type { FinalizationProblem } from '../finalization.js';
import type { BuyerData, SellerSnapshot, TaxSnapshot } from '../snapshots.js';

/**
 * Die Prüfung vor dem E-Rechnungs-Export.
 *
 * Bewusst **getrennt** von `checkFinalizable`, obwohl beide dieselbe
 * Ergebnisform liefern. Der Unterschied ist keine Feinheit, sondern der
 * Kern der Sache:
 *
 * - `checkFinalizable` bildet § 14 UStG ab und **verhindert** das
 *   Ausstellen. Was dort fehlt, macht die Rechnung ungültig.
 * - Diese Prüfung bildet EN 16931 ab und verhindert **nichts**. Eine
 *   Rechnung ohne Leitweg-ID ist eine vollkommen gültige Rechnung; sie
 *   lässt sich nur nicht als XRechnung ausgeben.
 *
 * Beides in `checkFinalizable` zu werfen wäre der bequeme Weg gewesen und
 * hätte jede Bestandsrechnung unfinalisierbar gemacht — für ein Feld, das
 * es beim Anlegen des Kunden noch gar nicht gab.
 *
 * Die Oberfläche zeigt das Ergebnis deshalb als Hinweis neben dem
 * XML-Knopf. Der Export selbst nimmt es als harte Bedingung: Eine Datei zu
 * erzeugen, von der man schon weiß, dass jeder Prüfer sie abweist, hilft
 * niemandem.
 */

export interface EinvoiceReadinessInput {
  seller: SellerSnapshot;
  buyer: BuyerData;
  tax: TaxSnapshot;
}

export interface EinvoiceReadinessOptions {
  /**
   * Ob die Käuferreferenz (BT-10) verlangt wird.
   *
   * **Kein Detail, sondern der Unterschied zwischen zwei Standards.** Die
   * EU-Norm stellt das Feld frei; erst die deutsche CIUS macht es zur
   * Pflicht, weil öffentliche Auftraggeber dort ihre Leitweg-ID erwarten.
   *
   * Für eine XRechnung ist die Angabe deshalb zwingend, für ein
   * ZUGFeRD-Dokument nach EN 16931 nicht. Diese Unterscheidung entscheidet,
   * wie weit die E-Rechnung überhaupt reicht: Eine Solo-Agentur rechnet
   * überwiegend mit Firmen ab, die keine Leitweg-ID haben. Verlangte man
   * sie überall, bekäme die Mehrzahl der Rechnungen gar keinen
   * strukturierten Datensatz — obwohl die Norm ihn zuließe.
   */
  requireBuyerReference?: boolean;
}

function isBlank(value: string | null | undefined): boolean {
  return value === null || value === undefined || value.trim() === '';
}

/**
 * Alles, was dem XML-Export im Weg steht — leer heißt: lässt sich ausgeben.
 */
export function checkEinvoiceReady(
  input: EinvoiceReadinessInput,
  options: EinvoiceReadinessOptions = {},
): FinalizationProblem[] {
  const problems: FinalizationProblem[] = [];
  const { seller, buyer, tax } = input;
  // Vorbelegt mit „ja", weil der vorhandene Aufrufer die XRechnung erzeugt.
  // Wer die Norm allein meint, sagt es ausdrücklich.
  const { requireBuyerReference = true } = options;

  // BT-10. In XRechnung ein Pflichtfeld ohne Ausnahme: Die Norm der EU
  // kennt das Feld als optional, die deutsche CIUS macht es zur Pflicht.
  if (requireBuyerReference && isBlank(buyer.buyerReference)) {
    problems.push({
      field: 'buyerReference',
      message:
        'Für die E-Rechnung fehlt die Referenz des Käufers (bei Behörden die Leitweg-ID). Sie steht beim Kunden.',
    });
  }

  // BT-34 / BT-49. Ohne elektronische Adressen lässt sich die Rechnung
  // zwar erzeugen, aber nicht zustellen — die Prüfwerkzeuge weisen sie ab.
  if (isBlank(seller.electronicAddress)) {
    problems.push({
      field: 'seller.electronicAddress',
      message: 'In den Einstellungen fehlt die eigene elektronische Adresse für E-Rechnungen.',
    });
  }

  if (isBlank(buyer.electronicAddress)) {
    problems.push({
      field: 'electronicAddress',
      message: 'Für die E-Rechnung fehlt die elektronische Adresse des Kunden.',
    });
  }

  // BR-E-10 und Geschwister: Code oder Text, nicht beides.
  if (
    CATEGORIES_NEEDING_EXEMPTION_REASON.includes(tax.taxCategoryCode as TaxCategoryCode) &&
    isBlank(tax.exemptionReasonCode) &&
    isBlank(tax.exemptionReasonText)
  ) {
    problems.push({
      field: 'tax.exemptionReasonText',
      message: `Die Steuerkategorie „${tax.taxCategoryCode}" verlangt einen Befreiungsgrund. Er steht im Steuerprofil.`,
    });
  }

  // BR-CO-26: Ohne eine steuerliche Kennung des Verkäufers ist keine
  // E-Rechnung möglich. § 14 UStG verlangt dasselbe, deshalb prüft
  // `checkFinalizable` es bereits — hier steht es für den Fall, dass eine
  // alte Rechnung ohne diese Prüfung ausgestellt wurde.
  if (isBlank(seller.vatId) && isBlank(seller.taxNumber)) {
    problems.push({
      field: 'seller.taxNumber',
      message: 'Für die E-Rechnung fehlt die eigene Steuernummer oder USt-IdNr.',
    });
  }

  // BR-DE-6: XRechnung verlangt eine Telefonnummer der Kontaktstelle des
  // Verkäufers, und BR-DE-27 verlangt mindestens drei Ziffern darin. Das
  // ist eine Strenge der deutschen CIUS; die EU-Norm kennt sie nicht.
  if (isBlank(seller.phone)) {
    problems.push({
      field: 'seller.phone',
      message: 'Für die E-Rechnung fehlt die eigene Telefonnummer.',
    });
  } else if ((seller.phone ?? '').replace(/\D/g, '').length < 3) {
    problems.push({
      field: 'seller.phone',
      message: 'Die eigene Telefonnummer muss mindestens drei Ziffern enthalten.',
    });
  }

  // BG-17: Die Zahlungsart dieser Anwendung ist die Überweisung. Ohne IBAN
  // gibt es nichts, worauf der Empfänger zahlen könnte.
  if (isBlank(seller.iban)) {
    problems.push({
      field: 'seller.iban',
      message: 'Für die E-Rechnung fehlt die eigene IBAN.',
    });
  }

  return problems;
}

/** Kurzform für die Oberfläche. */
export function isEinvoiceReady(input: EinvoiceReadinessInput): boolean {
  return checkEinvoiceReady(input).length === 0;
}
