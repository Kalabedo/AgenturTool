/**
 * Was die Desktop-Anwendung zum E-Mail-Versand beisteuert (Abschnitt 27).
 *
 * Zwei Dinge, die ein Server allein nicht kann, weil sie einen Rechner mit
 * Bildschirm und Benutzerkonto voraussetzen:
 *
 * 1. **Die Mail-Anwendung öffnen.** Ein `mailto` an `shell.openExternal`
 *    übergeben und den Ordner mit den Anhängen im Dateimanager zeigen.
 * 2. **Das SMTP-Passwort verwahren.** Electrons `safeStorage` verschlüsselt
 *    mit einem Schlüssel aus dem Schlüsselbund des Betriebssystems —
 *    Keychain auf macOS, DPAPI auf Windows. Damit liegt der Schlüssel weder
 *    in der Datenbank noch im Backup, und das Passwort bleibt an diesen
 *    Rechner und dieses Benutzerkonto gebunden.
 */
import { safeStorage, shell } from 'electron';

/** Spiegelt `MailHandoff` aus `apps/api/src/mail/mail-handoff.ts`. */
export interface MailHandoff {
  openDraft(mailtoUrl: string): Promise<void>;
  revealFolder(folderPath: string): Promise<void>;
}

/** Spiegelt `SecretStore` aus `apps/api/src/mail/secret-store.ts`. */
export interface SecretStore {
  readonly id: string;
  encrypt(plaintext: string): string;
  decrypt(payload: string): string | null;
}

export class ElectronMailHandoff implements MailHandoff {
  constructor(private readonly log: (message: string) => void) {}

  /**
   * Übergibt den Entwurf an das Standard-Mailprogramm.
   *
   * `openExternal` und nicht der Netzwerkfilter aus `network.ts`: Dieser
   * Aufruf geht nicht ins Netz, sondern an das Betriebssystem, das für
   * `mailto` eine Anwendung hinterlegt hat. Die Sperre des Fensters bleibt
   * davon unberührt — sie gilt dem, was das Dokument selbst lädt.
   */
  async openDraft(mailtoUrl: string): Promise<void> {
    this.log(`E-Mail-Entwurf an die Mail-Anwendung übergeben (${mailtoUrl.length} Zeichen).`);
    await shell.openExternal(mailtoUrl);
  }

  /**
   * Zeigt den Ordner mit den Anhängen.
   *
   * `openPath` auf den Ordner und nicht `showItemInFolder` auf eine Datei:
   * Es sind oft mehrere Anhänge, und der geöffnete Ordner ist das, woraus
   * sich alle zusammen in den Entwurf ziehen lassen.
   */
  async revealFolder(folderPath: string): Promise<void> {
    const error = await shell.openPath(folderPath);
    if (error !== '') this.log(`Ordner ${folderPath} ließ sich nicht öffnen: ${error}`);
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
