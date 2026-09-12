/**
 * Der Weg über die Mail-Anwendung dieses Rechners (D45).
 *
 * Die Schnittstelle ist so schmal wie das, was dieser Weg überhaupt kann:
 * einen Entwurf öffnen und einen Ordner zeigen. Mehr gibt `mailto` nicht
 * her — es trägt Empfänger, Betreff und Text, aber keine Dateien. Die
 * Anhänge legt die Anwendung deshalb in einen Ordner und zeigt ihn; anhängen
 * muss sie der Benutzer selbst.
 *
 * Das ist die unbequeme, aber ehrliche Umsetzung. Die bequeme wäre, den
 * Vorgang als „versendet" zu verbuchen und zu hoffen — und genau davon
 * hängt hier ein Zahlungsvermerk ab.
 */
export interface MailHandoff {
  /** Öffnet den Standard-Mailclient mit vorbelegtem Entwurf. */
  openDraft(mailtoUrl: string): Promise<void>;

  /** Zeigt den Ordner mit den Anhängen im Dateimanager. */
  revealFolder(folderPath: string): Promise<void>;
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
