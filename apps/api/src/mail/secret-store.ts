import crypto from 'node:crypto';
import fs from 'node:fs';
import path from 'node:path';

/**
 * Die Ablage für das eine Geheimnis, das diese Anwendung kennt: das
 * SMTP-Passwort (D46).
 *
 * Verschlüsselt in der Datenbank, Schlüssel außerhalb davon. Das schützt
 * nicht gegen jemanden, der bereits auf diesem Rechner arbeitet — es
 * schützt gegen den Weg, auf dem ein Passwort sonst am ehesten verloren
 * geht: ein Backup, das an einen anderen Ort wandert. Die Sicherung enthält
 * die Datenbank, aber weder den Schlüsselbund des Betriebssystems noch die
 * Schlüsseldatei. Wer sie einspielt, muss das Passwort neu eingeben — und
 * die Einstellungen sagen das, statt den ersten Versand daran scheitern zu
 * lassen.
 */
export interface SecretStore {
  /**
   * Kennung der Ablage, die dem verschlüsselten Wert vorangestellt wird.
   *
   * Sie beantwortet beim Lesen die Frage, die sonst zu einem unverständlichen
   * Entschlüsselungsfehler führte: Wurde dieser Wert überhaupt von der
   * Ablage geschrieben, die jetzt zur Verfügung steht?
   */
  readonly id: string;

  encrypt(plaintext: string): string;

  /** `null`, wenn der Wert von einer anderen Ablage oder einem anderen Rechner stammt. */
  decrypt(payload: string): string | null;
}

/**
 * Die Ablage, die der Gastgeber mitbringt — oder `null`.
 *
 * Die Desktop-Anwendung reicht hier Electrons `safeStorage` herein, das den
 * Schlüsselbund des Betriebssystems benutzt. Auf der Kommandozeile bleibt
 * es leer, und es greift die Schlüsseldatei unten.
 */
export const SECRET_STORE_HOST = Symbol('SECRET_STORE_HOST');

const ALGORITHM = 'aes-256-gcm';
const KEY_BYTES = 32;
const IV_BYTES = 12;

/**
 * Schlüsseldatei neben der Datenbank.
 *
 * Der Rückfall für den Betrieb ohne Electron — die Entwicklung und die
 * Tests. Sie liegt unter DATA_DIR, aber **nicht** in einem der Verzeichnisse,
 * die das Backup einpackt (`assets`, `invoices`, `orphans`). Das ist keine
 * Nachlässigkeit, sondern die Zusage von oben: Der Schlüssel bleibt auf
 * diesem Rechner.
 */
export class FileKeySecretStore implements SecretStore {
  readonly id = 'file';

  constructor(private readonly keyPath: string) {}

  encrypt(plaintext: string): string {
    const iv = crypto.randomBytes(IV_BYTES);
    const cipher = crypto.createCipheriv(ALGORITHM, this.key(), iv);
    const encrypted = Buffer.concat([cipher.update(plaintext, 'utf8'), cipher.final()]);

    return [
      iv.toString('base64'),
      cipher.getAuthTag().toString('base64'),
      encrypted.toString('base64'),
    ].join('.');
  }

  decrypt(payload: string): string | null {
    const [iv, tag, data] = payload.split('.');
    if (iv === undefined || tag === undefined || data === undefined) return null;

    try {
      const decipher = crypto.createDecipheriv(ALGORITHM, this.key(), Buffer.from(iv, 'base64'));
      decipher.setAuthTag(Buffer.from(tag, 'base64'));
      return Buffer.concat([
        decipher.update(Buffer.from(data, 'base64')),
        decipher.final(),
      ]).toString('utf8');
    } catch {
      // Falscher Schlüssel oder veränderte Daten. Beides ist dasselbe
      // Ergebnis: Dieser Wert ist hier nicht lesbar.
      return null;
    }
  }

  /**
   * Liest den Schlüssel oder legt ihn an.
   *
   * `wx` beim Anlegen und `0o600` bei den Rechten: Zwei gleichzeitig
   * startende Prozesse dürfen sich nicht gegenseitig einen frischen
   * Schlüssel über den bestehenden schreiben — der alte Wert wäre danach
   * unwiederbringlich.
   */
  private key(): Buffer {
    if (fs.existsSync(this.keyPath)) {
      const stored = fs.readFileSync(this.keyPath);
      if (stored.length === KEY_BYTES) return stored;
    }

    fs.mkdirSync(path.dirname(this.keyPath), { recursive: true });
    const generated = crypto.randomBytes(KEY_BYTES);

    try {
      fs.writeFileSync(this.keyPath, generated, { flag: 'wx', mode: 0o600 });
      return generated;
    } catch {
      return fs.readFileSync(this.keyPath);
    }
  }
}
