import crypto from 'node:crypto';
import fs from 'node:fs';
import fsp from 'node:fs/promises';
import path from 'node:path';
import { pipeline } from 'node:stream/promises';
import yauzl from 'yauzl';
import { BACKUP_FORMAT_VERSION, type BackupEntry, type BackupManifest } from '@privatura/shared';

/**
 * Die Wiederherstellung aus einem Archiv (Abschnitt 17).
 *
 * Bewusst kein API-Endpunkt, sondern eine Funktion hinter `pnpm restore`:
 * Sie ersetzt das Datenverzeichnis unter den Füßen der laufenden Anwendung.
 * Ein Klick im Browser, der das auslöst, wäre der gefährlichste Knopf der
 * ganzen Anwendung — und der einzige, dessen Wirkung man nicht rückgängig
 * machen kann.
 *
 * Der Ablauf ist auf den Moment ausgelegt, in dem man ihn braucht: nach
 * einem Datenverlust, unter Zeitdruck, ohne Lust auf Überraschungen.
 *
 * 1. Manifest lesen und Formatversion prüfen.
 * 2. **Erst prüfen, dann anfassen:** Jede Datei im Archiv wird entpackt und
 *    ihr Hash mit dem Manifest verglichen — in ein temporäres Verzeichnis.
 *    Ein unvollständiges Archiv soll auffallen, bevor die vorhandenen Daten
 *    weichen.
 * 3. Vorhandene Daten beiseitelegen statt löschen (`data.bak-<Zeitstempel>`).
 * 4. Geprüfte Dateien an ihren Platz verschieben.
 */

export interface RestoreOptions {
  archivePath: string;
  /** Zielverzeichnis für Assets, PDFs und verwaiste Dateien. */
  dataDir: string;
  /** Zieldatei der Datenbank (aus DATABASE_URL aufgelöst). */
  databaseFile: string;
  /** Vorhandene Daten beiseitelegen; ohne das bricht die Wiederherstellung ab. */
  force?: boolean;
}

export interface RestoreResult {
  manifest: BackupManifest;
  restoredFiles: number;
  /** Wohin die bisherigen Daten verschoben wurden, falls es welche gab. */
  movedExistingTo: string | null;
}

export async function restoreBackup(options: RestoreOptions): Promise<RestoreResult> {
  const staging = await fsp.mkdtemp(path.join(path.dirname(options.dataDir), 'restore-'));

  try {
    const manifest = await extractAndVerify(options.archivePath, staging);

    const existing = hasContent(options.dataDir) || fs.existsSync(options.databaseFile);
    if (existing && options.force !== true) {
      throw new Error(
        `Unter ${options.dataDir} liegen bereits Daten. Mit --force werden sie ` +
          'beiseitegelegt (nicht gelöscht) und durch das Backup ersetzt.',
      );
    }

    const movedExistingTo = existing ? await moveAside(options) : null;

    await fsp.mkdir(path.dirname(options.databaseFile), { recursive: true });
    await fsp.rename(path.join(staging, 'database.sqlite'), options.databaseFile);

    // WAL- und SHM-Datei der alten Datenbank dürfen nicht neben der neuen
    // liegen bleiben: SQLite hielte sie für das Write-Ahead-Log genau dieser
    // Datei und läse Änderungen ein, die es nicht mehr gibt.
    for (const suffix of ['-wal', '-shm']) {
      await fsp.rm(`${options.databaseFile}${suffix}`, { force: true });
    }

    await fsp.mkdir(options.dataDir, { recursive: true });
    const files = path.join(staging, 'files');
    if (fs.existsSync(files)) {
      for (const entry of await fsp.readdir(files)) {
        await fsp.rename(path.join(files, entry), path.join(options.dataDir, entry));
      }
    }

    return { manifest, restoredFiles: manifest.files.length, movedExistingTo };
  } finally {
    await fsp.rm(staging, { recursive: true, force: true });
  }
}

/** Entpackt das Archiv und prüft jede Datei gegen das Manifest. */
async function extractAndVerify(archivePath: string, target: string): Promise<BackupManifest> {
  const entries = await readArchive(archivePath, target);

  const manifestRaw = entries.get('manifest.json');
  if (manifestRaw === undefined) {
    throw new Error(`${archivePath} enthält kein manifest.json — das ist kein Backup-Archiv.`);
  }

  const manifest = JSON.parse(
    await fsp.readFile(path.join(target, manifestRaw.path), 'utf8'),
  ) as BackupManifest;

  if (manifest.formatVersion > BACKUP_FORMAT_VERSION) {
    throw new Error(
      `Das Archiv hat Format ${manifest.formatVersion}, diese Version kennt nur ` +
        `${BACKUP_FORMAT_VERSION}. Bitte die neuere Anwendungsversion benutzen.`,
    );
  }

  for (const expected of [manifest.database, ...manifest.files]) {
    verify(expected, entries.get(expected.path));
  }

  return manifest;
}

interface ExtractedEntry {
  path: string;
  sha256: string;
  sizeBytes: number;
}

function verify(expected: BackupEntry, actual: ExtractedEntry | undefined): void {
  if (actual === undefined) {
    throw new Error(`Im Archiv fehlt ${expected.path}. Das Backup ist unvollständig.`);
  }
  if (actual.sha256 !== expected.sha256) {
    throw new Error(
      `${expected.path} stimmt nicht mit dem Manifest überein. Das Archiv ist beschädigt.`,
    );
  }
}

/**
 * Entpackt alle Einträge und bildet dabei ihre Hashes.
 *
 * Hash beim Schreiben statt in einem zweiten Durchgang: Die Datei ist dann
 * ohnehin im Speicher unterwegs, und ein zweites vollständiges Lesen kostet
 * bei einigen hundert Megabyte spürbar Zeit.
 */
async function readArchive(
  archivePath: string,
  target: string,
): Promise<Map<string, ExtractedEntry>> {
  const zip = await new Promise<yauzl.ZipFile>((resolve, reject) => {
    yauzl.open(archivePath, { lazyEntries: true }, (error, opened) => {
      if (error !== null || opened === undefined) {
        reject(error ?? new Error(`${archivePath} lässt sich nicht öffnen.`));
        return;
      }
      resolve(opened);
    });
  });

  const extracted = new Map<string, ExtractedEntry>();

  await new Promise<void>((resolve, reject) => {
    zip.on('entry', (entry: yauzl.Entry) => {
      if (entry.fileName.endsWith('/')) {
        zip.readEntry();
        return;
      }

      // Ein Archiv ist Fremdmaterial: Ein Eintrag namens "../../etc/passwd"
      // dürfte niemals außerhalb des Zielverzeichnisses landen.
      const destination = path.resolve(target, entry.fileName);
      if (!destination.startsWith(path.resolve(target) + path.sep)) {
        reject(new Error(`Das Archiv enthält einen unzulässigen Pfad: ${entry.fileName}`));
        return;
      }

      zip.openReadStream(entry, (error, stream) => {
        if (error !== null || stream === undefined) {
          reject(error ?? new Error(`${entry.fileName} lässt sich nicht lesen.`));
          return;
        }

        void (async () => {
          try {
            await fsp.mkdir(path.dirname(destination), { recursive: true });

            const hash = crypto.createHash('sha256');
            stream.on('data', (chunk: Buffer) => hash.update(chunk));
            await pipeline(stream, fs.createWriteStream(destination));

            extracted.set(entry.fileName, {
              path: entry.fileName,
              sha256: hash.digest('hex'),
              sizeBytes: (await fsp.stat(destination)).size,
            });
            zip.readEntry();
          } catch (failure) {
            reject(failure);
          }
        })();
      });
    });

    zip.on('end', resolve);
    zip.on('error', reject);
    zip.readEntry();
  });

  return extracted;
}

function hasContent(directory: string): boolean {
  return fs.existsSync(directory) && fs.readdirSync(directory).length > 0;
}

/**
 * Legt die vorhandenen Daten beiseite.
 *
 * Verschieben statt löschen: Wer eine Wiederherstellung startet, hat
 * womöglich das falsche Archiv erwischt. Die alten Daten liegen danach
 * daneben, und der Fehler ist zurücknehmbar.
 */
async function moveAside(options: RestoreOptions): Promise<string> {
  const stamp = new Date().toISOString().replace(/[-:]/gu, '').replace(/\..+$/u, '');
  const backupDir = `${options.dataDir}.bak-${stamp}`;

  if (fs.existsSync(options.dataDir)) {
    await fsp.rename(options.dataDir, backupDir);
  } else {
    await fsp.mkdir(backupDir, { recursive: true });
  }

  // Die Datenbank kann außerhalb von DATA_DIR liegen (DATABASE_URL ist eine
  // eigene Einstellung); dann wandert sie einzeln mit.
  for (const suffix of ['', '-wal', '-shm']) {
    const file = `${options.databaseFile}${suffix}`;
    if (!fs.existsSync(file)) continue;
    if (file.startsWith(options.dataDir + path.sep)) continue;

    await fsp.rename(file, path.join(backupDir, path.basename(file)));
  }

  return backupDir;
}
