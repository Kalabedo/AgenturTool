/**
 * Was die Desktop-Anwendung zum E-Mail-Versand beisteuert (Abschnitt 27).
 *
 * Zwei Dinge, die ein Server allein nicht kann, weil sie einen Rechner mit
 * Bildschirm und Benutzerkonto voraussetzen:
 *
 * 1. **Die Nachricht ins Mailprogramm bringen.** Bei Apple Mail als echter
 *    Entwurf über AppleScript, sonst als `.eml`-Datei über `shell.openPath`.
 * 2. **Das SMTP-Passwort verwahren.** Electrons `safeStorage` verschlüsselt
 *    mit einem Schlüssel aus dem Schlüsselbund des Betriebssystems —
 *    Keychain auf macOS, DPAPI auf Windows. Damit liegt der Schlüssel weder
 *    in der Datenbank noch im Backup, und das Passwort bleibt an diesen
 *    Rechner und dieses Benutzerkonto gebunden.
 */
import { execFile } from 'node:child_process';
import { app, safeStorage, shell } from 'electron';

/** Spiegelt `MailDraft` aus `apps/api/src/mail/mail-handoff.ts`. */
export interface MailDraft {
  to: readonly string[];
  cc: readonly string[];
  bcc: readonly string[];
  subject: string;
  body: string;
  attachmentPaths: readonly string[];
}

/** Spiegelt `MailHandoff` aus `apps/api/src/mail/mail-handoff.ts`. */
export interface MailHandoff {
  openDraft(draft: MailDraft): Promise<boolean>;
  openMessage(filePath: string): Promise<void>;
  applicationName(): string | null;
}

/** Spiegelt `SecretStore` aus `apps/api/src/mail/secret-store.ts`. */
export interface SecretStore {
  readonly id: string;
  encrypt(plaintext: string): string;
  decrypt(payload: string): string | null;
}

/**
 * Der Entwurf in Apple Mail.
 *
 * Die Werte kommen als **Argumente** herein (`on run argv`) und werden
 * nirgends in den Quelltext eingesetzt. Das ist keine Stilfrage: Betreff und
 * Nachricht schreibt der Benutzer, und ein Anführungszeichen darin würde
 * einen zusammengebauten Skripttext zerreißen — im besten Fall mit einem
 * Syntaxfehler, im schlechteren mit einer Anweisung, die niemand vorgesehen
 * hat. Als Argument ist jeder Text nur ein Text.
 *
 * Listen reisen als eine Zeichenkette mit Zeilenumbrüchen: Adressen und
 * Dateipfade enthalten keine Zeilenumbrüche, und so bleiben die
 * Argumentpositionen fest, egal wie viele Empfänger es sind.
 *
 * **Erst füllen, dann zeigen.** Der Entwurf entsteht mit `visible:false` und
 * wird erst am Ende sichtbar. Das ist keine Feinheit: Sobald Mail das
 * Verfassen-Fenster geöffnet hat, nimmt es über AppleScript keine Empfänger
 * und keine Anhänge mehr an — ohne Fehlermeldung. Gemessen an einem
 * Entwurf, der mit `visible:true` entstand: Betreff und Text kamen an,
 * `to recipients` und `attachments` blieben leer. Genau die Felder also, um
 * derentwillen es diesen Weg überhaupt gibt.
 */
const APPLE_MAIL_DRAFT_SCRIPT = `
on run argv
  set theSubject to item 1 of argv
  set theBody to item 2 of argv
  set toList to my nonEmpty(paragraphs of (item 3 of argv))
  set ccList to my nonEmpty(paragraphs of (item 4 of argv))
  set bccList to my nonEmpty(paragraphs of (item 5 of argv))
  set fileList to my nonEmpty(paragraphs of (item 6 of argv))

  tell application "Mail"
    set theDraft to make new outgoing message with properties {subject:theSubject, content:theBody, visible:false}
    tell theDraft
      repeat with theAddress in toList
        make new to recipient at end of to recipients with properties {address:(theAddress as text)}
      end repeat
      repeat with theAddress in ccList
        make new cc recipient at end of cc recipients with properties {address:(theAddress as text)}
      end repeat
      repeat with theAddress in bccList
        make new bcc recipient at end of bcc recipients with properties {address:(theAddress as text)}
      end repeat
      repeat with thePath in fileList
        tell content to make new attachment with properties {file name:(POSIX file (thePath as text))} at after the last paragraph
      end repeat
    end tell
    set visible of theDraft to true
    activate
  end tell
end run

on nonEmpty(theList)
  set kept to {}
  repeat with theEntry in theList
    set theText to theEntry as text
    if theText is not "" then set end of kept to theText
  end repeat
  return kept
end nonEmpty
`;

/**
 * Zeitgrenze für den AppleScript-Aufruf.
 *
 * Beim ersten Mal fragt macOS, ob AgenturTool Mail steuern darf, und das
 * Skript wartet so lange auf die Antwort. Wer den Dialog stehen lässt, soll
 * nicht auf einen hängenden Versanddialog schauen — danach greift der Weg
 * über die Nachrichtendatei.
 */
const APPLESCRIPT_TIMEOUT_MS = 60_000;

export class ElectronMailHandoff implements MailHandoff {
  constructor(private readonly log: (message: string) => void) {}

  /**
   * Das Programm hinter `mailto:` — „Mail", „Microsoft Outlook", …
   *
   * Electron fragt dafür den Launch-Service des Systems. Scheitert das,
   * bleibt es bei `null`; die Oberfläche sagt dann „deine Mail-Anwendung"
   * statt eines Namens.
   */
  applicationName(): string | null {
    try {
      const name = app.getApplicationNameForProtocol('mailto:');
      return name === '' ? null : name;
    } catch {
      return null;
    }
  }

  /**
   * Ein echter Entwurf, wo das Mailprogramm es zulässt.
   *
   * Bislang nur Apple Mail auf macOS, und zwar nur dann, wenn es auch das
   * Standardprogramm ist. Der Entwurf soll dort entstehen, wo der Benutzer
   * seine Mails schreibt — ein Fenster in einem Programm, das er gar nicht
   * benutzt, wäre schlechter als die Nachrichtendatei.
   *
   * Outlook braucht diesen Weg nicht: Es erkennt die `.eml` an `X-Unsent: 1`
   * als Entwurf und öffnet sie zum Verfassen.
   */
  async openDraft(draft: MailDraft): Promise<boolean> {
    if (process.platform !== 'darwin') return false;
    if (this.applicationName() !== 'Mail') return false;

    try {
      await this.runAppleScript(APPLE_MAIL_DRAFT_SCRIPT, [
        draft.subject,
        draft.body,
        draft.to.join('\n'),
        draft.cc.join('\n'),
        draft.bcc.join('\n'),
        draft.attachmentPaths.join('\n'),
      ]);
      return true;
    } catch (error) {
      // Kein Ausnahmefall, sondern der vorgesehene Rückfall: abgelehnte
      // Automatisierung (-1743), Mail nicht ansprechbar, ein geändertes
      // Skript-Vokabular. Der Aufrufer schreibt dann die Nachrichtendatei.
      this.log(
        `Entwurf in Apple Mail nicht möglich, Nachrichtendatei folgt: ${
          error instanceof Error ? error.message : String(error)
        }`,
      );
      return false;
    }
  }

  /**
   * Übergibt die fertige Nachricht an das Mailprogramm.
   *
   * `openPath` und nicht der Netzwerkfilter aus `network.ts`: Dieser Aufruf
   * geht nicht ins Netz, sondern an das Betriebssystem, das für `.eml` eine
   * Anwendung hinterlegt hat. Die Sperre des Fensters bleibt davon
   * unberührt — sie gilt dem, was das Dokument selbst lädt.
   *
   * Lässt sich nichts öffnen — keine Zuordnung für `.eml` —, wird die Datei
   * wenigstens im Dateimanager gezeigt. Ein stilles Nichts wäre hier der
   * schlechteste Ausgang: Der Benutzer hat gerade auf „Senden" geklickt.
   */
  async openMessage(filePath: string): Promise<void> {
    const error = await shell.openPath(filePath);
    if (error === '') return;

    this.log(`Nachricht ${filePath} ließ sich nicht öffnen: ${error}`);
    shell.showItemInFolder(filePath);
  }

  /**
   * Führt das Skript aus und reicht die Werte als Argumente nach.
   *
   * Der Quelltext kommt über die Standardeingabe (`osascript -`), damit er
   * nirgends als Datei liegen muss; die Werte stehen dahinter in `argv` und
   * berühren den Quelltext nie.
   */
  private runAppleScript(script: string, args: readonly string[]): Promise<void> {
    return new Promise((resolve, reject) => {
      const child = execFile(
        '/usr/bin/osascript',
        ['-', ...args],
        { timeout: APPLESCRIPT_TIMEOUT_MS },
        (error, _stdout, stderr) => {
          if (error === null) {
            resolve();
            return;
          }
          reject(new Error(stderr.trim() === '' ? error.message : stderr.trim()));
        },
      );

      child.stdin?.end(script);
    });
  }
}

/**
 * Das SMTP-Passwort im Schlüsselbund des Betriebssystems.
 *
 * `isEncryptionAvailable()` ist auf manchen Linux-Systemen ohne
 * Schlüsselbunddienst falsch. `create` liefert dann `null`, und die
 * Anwendung fällt auf die Schlüsseldatei zurück — das ist weniger, aber
 * immer noch die Zusage, die zählt: Der Schlüssel liegt nicht im Backup.
 */
export class SafeStorageSecretStore implements SecretStore {
  readonly id = 'os';

  static create(log: (message: string) => void): SafeStorageSecretStore | undefined {
    if (safeStorage.isEncryptionAvailable()) return new SafeStorageSecretStore();

    log(
      'Der Schlüsselbund des Systems steht nicht bereit; das SMTP-Passwort wird dateibasiert verschlüsselt.',
    );
    return undefined;
  }

  encrypt(plaintext: string): string {
    return safeStorage.encryptString(plaintext).toString('base64');
  }

  decrypt(payload: string): string | null {
    try {
      return safeStorage.decryptString(Buffer.from(payload, 'base64'));
    } catch {
      // Anderer Rechner, anderes Benutzerkonto, zurückgezogene
      // Schlüsselbundfreigabe — für den Aufrufer ist das alles dasselbe:
      // hier nicht lesbar.
      return null;
    }
  }
}
