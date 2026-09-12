/**
 * Der Weg über die Mail-Anwendung dieses Rechners (D45).
 *
 * Zwei Wege zum selben Ziel, und die Reihenfolge ist Absicht:
 *
 * 1. **Ein echter Entwurf.** Wo sich das Mailprogramm fernsteuern lässt —
 *    auf macOS Apple Mail über AppleScript —, entsteht ein fertiges
 *    Verfassen-Fenster mit Empfängern, Betreff, Text und Anhängen. Mehr als
 *    „Senden" bleibt nicht zu tun.
 * 2. **Eine Nachrichtendatei.** Sonst schreibt die Anwendung die
 *    vollständige Nachricht als `.eml` und lässt sie öffnen. Outlook erkennt
 *    an der Kopfzeile `X-Unsent: 1` einen unfertigen Entwurf und öffnet ihn
 *    zum Verfassen; andere Programme zeigen sie als eingegangene Nachricht,
 *    aus der ein „Weiterleiten" die Anhänge übernimmt.
 *
 * Der erste Entwurf dieser Schnittstelle ging über `mailto`. Das trägt keine
 * Dateien, also landeten die Anhänge in einem Ordner, der daneben aufging,
 * und der Benutzer zog sie von Hand hinüber — zwei Fenster für einen
 * Vorgang, und die Rechnung lag außerhalb der Nachricht. Beide Wege oben
 * tragen sie darin.
 */

/** Die Nachricht, wie ein fernsteuerbares Mailprogramm sie braucht. */
export interface MailDraft {
  to: readonly string[];
  cc: readonly string[];
  bcc: readonly string[];
  subject: string;
  body: string;
  /** Absolute Pfade der Anhänge; sie liegen bereits auf der Platte. */
  attachmentPaths: readonly string[];
}

export interface MailHandoff {
  /**
   * Legt einen bearbeitbaren Entwurf im Mailprogramm an.
   *
   * `false` heißt „auf diesem Rechner nicht möglich" und ist kein Fehler:
   * ein anderes Standardprogramm, eine abgelehnte Automatisierung, ein
   * anderes Betriebssystem. Der Aufrufer geht dann den Weg über die Datei.
   */
  openDraft(draft: MailDraft): Promise<boolean>;

  /**
   * Öffnet die Nachrichtendatei mit dem Mailprogramm des Rechners.
   *
   * Lässt sie sich nicht öffnen, ist die Umsetzung dafür zuständig, die
   * Datei wenigstens im Dateimanager zu zeigen — der Pfad steht danach auch
   * in der Oberfläche.
   */
  openMessage(filePath: string): Promise<void>;

  /** Das Programm, das `mailto` bedient — für die Rückmeldung an den Benutzer. */
  applicationName(): string | null;
}

/**
 * Was der Gastgeber anbietet — oder `null`.
 *
 * Die Desktop-Anwendung reicht hier ihre Umsetzung über Electrons `shell`
 * herein. Im Browserbetrieb bleibt es leer, und der Versandweg
 * „Mail-Anwendung" sagt das, statt ins Leere zu laufen: Ein Server, der ein
 * Fenster auf einem fremden Rechner öffnen will, kann das nicht.
 */
export const MAIL_HANDOFF_HOST = Symbol('MAIL_HANDOFF_HOST');
