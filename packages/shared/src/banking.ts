/**
 * Prüfung von Bankverbindungsangaben.
 *
 * Bewusst nur Format- und Prüfsummenkontrolle, keine Kontodaten-Verifikation:
 * Eine formal gültige IBAN kann trotzdem das falsche Konto sein. Der Zweck
 * ist, Tippfehler zu fangen, bevor sie auf einer Rechnung landen — dort
 * verursachen sie eine ausbleibende Zahlung und eine unangenehme Rückfrage.
 */

/** Entfernt Leerzeichen und normalisiert auf Großbuchstaben. */
export function normaliseIban(input: string): string {
  return input.replace(/\s+/g, '').toUpperCase();
}

/**
 * Prüft eine IBAN nach dem Verfahren aus ISO 13616 / ISO 7064 (mod 97 = 1).
 *
 * Die Prüfsumme fängt genau die Fehler ab, die beim Abtippen entstehen:
 * vertauschte Ziffern, eine fehlende Stelle, ein falsches Zeichen.
 */
export function isValidIban(input: string): boolean {
  const iban = normaliseIban(input);

  if (!/^[A-Z]{2}\d{2}[A-Z0-9]{11,30}$/.test(iban)) return false;

  // Die ersten vier Zeichen (Ländercode + Prüfziffern) wandern ans Ende,
  // anschließend werden Buchstaben durch Zahlen ersetzt: A = 10 … Z = 35.
  const rearranged = iban.slice(4) + iban.slice(0, 4);
  const digits = [...rearranged]
    .map((char) => (/[A-Z]/.test(char) ? String(char.charCodeAt(0) - 55) : char))
    .join('');

  // Die Zahl ist zu groß für Number, deshalb stückweise Modulo rechnen.
  let remainder = 0;
  for (const digit of digits) {
    remainder = (remainder * 10 + Number(digit)) % 97;
  }

  return remainder === 1;
}

/** Gruppiert eine IBAN in Viererblöcke: "DE02 1203 0000 0000 2020 51" */
export function formatIban(input: string): string {
  return normaliseIban(input)
    .replace(/(.{4})/g, '$1 ')
    .trim();
}

/** BIC nach ISO 9362: 8 oder 11 Stellen. */
export function isValidBic(input: string): boolean {
  return /^[A-Z]{6}[A-Z0-9]{2}([A-Z0-9]{3})?$/.test(input.replace(/\s+/g, '').toUpperCase());
}

/**
 * Lockere Prüfung der USt-IdNr: Ländercode plus 2 bis 13 alphanumerische
 * Zeichen.
 *
 * Absichtlich nicht strenger. Die Formate der Mitgliedstaaten unterscheiden
 * sich erheblich und ändern sich gelegentlich; eine zu strenge Prüfung würde
 * gültige Nummern ausländischer Kunden ablehnen und wäre schlimmer als gar
 * keine. Die inhaltliche Bestätigung leistet ohnehin nur eine Abfrage beim
 * Bundeszentralamt für Steuern.
 */
export function isPlausibleVatId(input: string): boolean {
  return /^[A-Z]{2}[A-Z0-9]{2,13}$/.test(input.replace(/[\s.-]/g, '').toUpperCase());
}

export function normaliseVatId(input: string): string {
  return input.replace(/[\s.-]/g, '').toUpperCase();
}
