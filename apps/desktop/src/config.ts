/**
 * Die Konfiguration der Desktop-Anwendung.
 *
 * Es ist genau ein Wert, aber er braucht eine Prüfung: `Number('dreißig')`
 * ist `NaN`, und ein Zeitlimit von `NaN` heißt in `setTimeout`, dass sofort
 * abgebrochen wird — jedes PDF schlüge fehl, und die Meldung spräche von
 * einem Zeitlimit, das niemand gesetzt zu haben glaubt.
 *
 * Diese Prüfung stand früher in `ChromiumConfig` und ist mit Puppeteer
 * verschwunden; hier ist ihr neuer Ort.
 */

const DEFAULT_TIMEOUT_MS = 30_000;
const MIN_TIMEOUT_MS = 1_000;
const MAX_TIMEOUT_MS = 300_000;

/** Zeitlimit für einen Renderlauf, aus `PDF_TIMEOUT_MS`. */
export function pdfTimeoutMs(raw: string | undefined = process.env.PDF_TIMEOUT_MS): number {
  if (raw === undefined || raw === '') {
    return DEFAULT_TIMEOUT_MS;
  }

  const value = Number(raw);
  if (!Number.isInteger(value) || value < MIN_TIMEOUT_MS || value > MAX_TIMEOUT_MS) {
    throw new Error(
      `PDF_TIMEOUT_MS muss eine ganze Zahl zwischen ${String(MIN_TIMEOUT_MS)} und ` +
        `${String(MAX_TIMEOUT_MS)} sein (erhalten: ${raw}).`,
    );
  }
  return value;
}
