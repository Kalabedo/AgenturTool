/**
 * Geld- und Mengenarithmetik.
 *
 * Konventionen im gesamten Projekt:
 *   Geldbeträge   -> Integer in Cent            (12,34 € = 1234)
 *   Mengen        -> Integer in Tausendstel     (7,5 h  = 7500)
 *   Prozentsätze  -> Integer in Basispunkten    (19 %   = 1900)
 *
 * Fließkommazahlen kommen in Beträgen nicht vor.
 */

export const CENTS_PER_EURO = 100;
export const QUANTITY_SCALE = 1000;
export const BASIS_POINTS_SCALE = 10000;

/**
 * Kaufmännisches Runden, symmetrisch zur Null ("half away from zero").
 *
 * `Math.round` rundet .5 immer aufwärts, also `Math.round(-0.5) === -0`.
 * Bei Storno-Dokumenten mit negativen Beträgen liefe die Stornosumme dadurch
 * um einzelne Cent an der Originalrechnung vorbei — der Storno würde die
 * Rechnung nicht exakt ausgleichen. Deshalb wird der Betrag am Vorzeichen
 * gespiegelt gerundet.
 */
export function roundHalfAwayFromZero(value: number): number {
  if (!Number.isFinite(value)) {
    throw new RangeError(`Nicht rundbarer Wert: ${value}`);
  }
  return value < 0 ? -Math.round(-value) : Math.round(value);
}

/** Menge (Tausendstel) mal Einzelpreis (Cent) -> Betrag in Cent. */
export function multiplyQuantity(quantityThousandths: number, unitPriceCents: number): number {
  return roundHalfAwayFromZero((quantityThousandths * unitPriceCents) / QUANTITY_SCALE);
}

/** Anteil in Basispunkten von einem Cent-Betrag. */
export function applyBasisPoints(amountCents: number, basisPoints: number): number {
  return roundHalfAwayFromZero((amountCents * basisPoints) / BASIS_POINTS_SCALE);
}

/** "1234" -> "12,34 €" */
export function formatCents(cents: number, currency = 'EUR', locale = 'de-DE'): string {
  return new Intl.NumberFormat(locale, { style: 'currency', currency }).format(
    cents / CENTS_PER_EURO,
  );
}

/** "1900" -> "19 %", "750" -> "7,5 %" */
export function formatBasisPoints(basisPoints: number, locale = 'de-DE'): string {
  const percent = basisPoints / (BASIS_POINTS_SCALE / 100);
  return `${new Intl.NumberFormat(locale, { maximumFractionDigits: 2 }).format(percent)} %`;
}

/** "7500" -> "7,5" */
export function formatQuantity(quantityThousandths: number, locale = 'de-DE'): string {
  return new Intl.NumberFormat(locale, { maximumFractionDigits: 3 }).format(
    quantityThousandths / QUANTITY_SCALE,
  );
}

/**
 * Nimmt eine Benutzereingabe wie "1.234,56" oder "1234.56" und liefert Cent.
 * Gibt `null` zurück, wenn die Eingabe nicht als Betrag lesbar ist.
 */
export function parseCents(input: string): number | null {
  const trimmed = input.trim();
  if (trimmed === '') return null;

  // Deutsches Format (1.234,56) von englischem (1,234.56) unterscheiden:
  // Es zählt, welches Zeichen zuletzt vorkommt — das ist das Dezimaltrennzeichen.
  const lastComma = trimmed.lastIndexOf(',');
  const lastDot = trimmed.lastIndexOf('.');
  const decimalSeparator = lastComma > lastDot ? ',' : '.';
  const thousandsSeparator = decimalSeparator === ',' ? '.' : ',';

  const normalised = trimmed
    .split(thousandsSeparator)
    .join('')
    .replace(decimalSeparator, '.')
    .replace(/\s/g, '');

  if (!/^-?\d*(\.\d*)?$/.test(normalised) || normalised === '' || normalised === '-') {
    return null;
  }

  const asNumber = Number(normalised);
  if (!Number.isFinite(asNumber)) return null;

  return roundHalfAwayFromZero(asNumber * CENTS_PER_EURO);
}

/**
 * Liest eine Prozenteingabe und liefert Basispunkte.
 *
 * Nimmt "19", "7,5" und "7.5" gleichermaßen — beim Steuersatz tippt man je
 * nach Tastaturgewohnheit das eine oder das andere. Gibt `null` zurück, wenn
 * die Eingabe kein Prozentsatz ist.
 */
export function parsePercentToBasisPoints(input: string): number | null {
  const normalised = input.trim().replace(',', '.');
  if (normalised === '') return null;
  if (!/^\d*(\.\d*)?$/.test(normalised) || normalised === '.') return null;

  const percent = Number(normalised);
  if (!Number.isFinite(percent) || percent < 0 || percent > 100) return null;

  return roundHalfAwayFromZero(percent * (BASIS_POINTS_SCALE / 100));
}

/** Basispunkte als reine Zahl für ein Eingabefeld: 1900 -> "19", 750 -> "7,5" */
export function basisPointsToPercentInput(basisPoints: number): string {
  const percent = basisPoints / (BASIS_POINTS_SCALE / 100);
  return Number.isInteger(percent) ? String(percent) : String(percent).replace('.', ',');
}
