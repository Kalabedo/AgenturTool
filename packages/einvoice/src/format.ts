/**
 * Die Umrechnung der internen Einheiten in die Schreibweise der Norm.
 *
 * Genau **eine** Stelle, an der aus Cent, Tausendsteln und Basispunkten
 * Dezimalzahlen werden. Das ist kein Ordnungsfimmel: Die Beträge einer
 * ausgestellten Rechnung stehen im `totalsSnapshot`, und das XML muss
 * denselben Betrag zeigen wie das PDF — auf den Cent. Jede zweite
 * Umrechnungsstelle wäre eine Gelegenheit, sich um einen Cent zu
 * verrechnen, und auffallen würde es an einer Rechnung, die längst beim
 * Kunden liegt.
 *
 * `toFixed` und keine Gebietsschema-Formatierung: Die Norm will den Punkt
 * als Dezimaltrennzeichen, unabhängig davon, wo der Rechner steht.
 */

/**
 * Cent als Betrag mit zwei Nachkommastellen (BT-106 und Verwandte).
 *
 * Division durch 100 auf einer Ganzzahl bis etwa 9·10¹⁵ ist in
 * IEEE-754-Arithmetik exakt genug, dass `toFixed(2)` immer die richtige
 * Ziffer liefert. Bei Rechnungsbeträgen ist das mit großem Abstand erfüllt.
 */
export function amount(cents: number): string {
  return (cents / 100).toFixed(2);
}

/**
 * Basispunkte als Prozentsatz (BT-152, BT-119).
 *
 * Zwei Nachkommastellen, weil 7,5 % als `7.50` geschrieben wird und die
 * Norm bis zu zwei Stellen zulässt.
 */
export function percent(basisPoints: number): string {
  return (basisPoints / 100).toFixed(2);
}

/**
 * Tausendstel als Menge (BT-129).
 *
 * Vier Nachkommastellen sind erlaubt; hier genügen drei, weil die
 * Anwendung in Tausendsteln rechnet. Nachlaufende Nullen bleiben stehen —
 * die Prüfwerkzeuge nehmen beides, und `7.500` ist ehrlicher über die
 * Genauigkeit, mit der gerechnet wurde.
 */
export function quantity(thousandths: number): string {
  return (thousandths / 1000).toFixed(3);
}

/**
 * Ein Kalendertag im Format 102 der Norm: `YYYYMMDD`.
 *
 * Die Anwendung hält Kalenderdaten als `YYYY-MM-DD` (D21 — kein DateTime,
 * keine Zeitzonen). Hier fallen nur die Bindestriche weg; es gibt nichts
 * umzurechnen und damit auch nichts, was sich um einen Tag verschieben
 * könnte.
 */
export function dateString(isoDate: string): string {
  return isoDate.replace(/-/g, '');
}
