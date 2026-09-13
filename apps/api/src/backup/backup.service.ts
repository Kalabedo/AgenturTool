import crypto from 'node:crypto';
import fs from 'node:fs';
import fsp from 'node:fs/promises';
import path from 'node:path';
import { Transform } from 'node:stream';
import { pipeline } from 'node:stream/promises';
import { Injectable, Logger } from '@nestjs/common';
import yazl from 'yazl';
import {
  BACKUP_FORMAT_VERSION,
  backupFilename,
  formatBytes,
  parseBackupFilename,
  type BackupArchive,
  type BackupEntry,
  type BackupManifest,
  type BackupReason,
  type BackupSummary,
} from '@agentur-tool/shared';
import { ApiError } from '../common/api-error';
import { StorageConfig } from '../common/config.service';
import { PrismaService } from '../common/prisma.service';
import { archivesToRemove } from './retention';

/** Was gesichert wird — und was nicht. */
const BACKED_UP_DIRECTORIES = ['assets', 'invoices', 'orphans'];

/**
 * Reserve über den geschätzten Bedarf hinaus.
 *
 * Die Schätzung ist die Summe der Eingaben; PDFs sind schon komprimiert, das
 * Archiv wird also kaum kleiner. Die Reserve deckt den Rest: Verzeichnisse,
 * das Journal der Datenbank, und den Umstand, dass eine Platte, die genau
 * aufgeht, keine Platte mehr ist, auf der sich arbeiten lässt.
 */
const SPACE_HEADROOM_BYTES = 64 * 1024 * 1024;

/** Ab wann Arbeitsmaterial unter `data/tmp` als liegengeblieben gilt. */
const TMP_LEFTOVER_MS = 24 * 60 * 60 * 1000;

export interface CreateBackupOptions {
  now?: Date;
  reason?: BackupReason;
}

/**
 * Die Datensicherung (Abschnitt 17).
 *
 * Ziel ist eine Datei, die alles enthält, und ein Weg zurück, den man auch
 * unter Stress noch versteht. Deshalb:
 *
 * - **ZIP statt tar.gz.** Das Archiv soll sich auf Windows, macOS und iOS
 *   mit Bordmitteln öffnen lassen — im Zweifel will man einzelne PDFs
 *   herausholen, ohne die Anwendung überhaupt zu starten.
 * - **`VACUUM INTO` statt `cp`.** Die Datenbank läuft im WAL-Modus; eine
 *   einfache Kopie der Datei kann Änderungen enthalten, die noch im
 *   Write-Ahead-Log stehen, und ist dann inkonsistent. `VACUUM INTO`
 *   schreibt eine in sich geschlossene Kopie.
 * - **Erst die Datenbank, dann die Dateien.** In dieser Reihenfolge kann das
 *   Backup höchstens Dateien enthalten, die die Datenbank noch nicht kennt —
 *   nie umgekehrt. Ein Datensatz ohne Datei wäre ein defektes Backup, eine
 *   Datei ohne Datensatz nur Ballast.
 * - **Ein Manifest mit SHA-256 je Datei.** Ohne Hashes ist beim
 *   Wiederherstellen nicht feststellbar, ob das Archiv vollständig ist —
 *   und ein Backup, dessen Zustand man nicht prüfen kann, ist eine
 *   Vermutung.
 * - **Erst nach `tmp`, dann an den Platz.** Ein abgebrochener Vorgang —
 *   Absturz, Stromausfall, volle Platte — hinterließe sonst ein
 *   abgeschnittenes ZIP in `backups/`, das in der Übersicht wie eine gültige
 *   Sicherung aussieht. Seit die Anwendung von selbst sichert, fiele das
 *   niemandem mehr auf.
 */
@Injectable()
export class BackupService {
  private readonly logger = new Logger(BackupService.name);

  constructor(
    private readonly prisma: PrismaService,
    private readonly storage: StorageConfig,
  ) {}

  get directory(): string {
    return path.join(this.storage.dataDir, 'backups');
  }

  async createBackup(options: CreateBackupOptions = {}): Promise<BackupSummary> {
    const now = options.now ?? new Date();
    const reason = options.reason ?? 'manuell';

    await fsp.mkdir(this.directory, { recursive: true });
    await fsp.mkdir(this.storage.tmpDir, { recursive: true });
    await this.sweepTmp(now);

    const token = crypto.randomUUID();
    const databaseCopy = path.join(this.storage.tmpDir, `backup-${token}.sqlite`);
    const partial = path.join(this.storage.tmpDir, `backup-${token}.zip.part`);

    try {
      await this.copyDatabase(databaseCopy);

      const files = await this.collectFiles();
      const databaseSize = (await fsp.stat(databaseCopy)).size;
      await this.ensureSpace(databaseSize, files);

      const manifest: BackupManifest = {
        formatVersion: BACKUP_FORMAT_VERSION,
        appVersion: process.env.npm_package_version ?? '0.1.0',
        schemaVersion: await this.schemaVersion(),
        createdAt: now.toISOString(),
        reason,
        counts: await this.counts(),
        database: {
          path: 'database.sqlite',
          sha256: await hashFile(databaseCopy),
          sizeBytes: databaseSize,
        },
        files,
      };

      await this.writeArchive(partial, databaseCopy, manifest);

      // Der Name fällt so spät wie möglich: Zwischen Beginn und Ende der
      // Sicherung kann eine zweite entstanden sein.
      const { filename, archivePath } = this.availableArchive(backupFilename(now, reason));
      await fsp.rename(partial, archivePath);

      const summary: BackupSummary = {
        filename,
        sizeBytes: (await fsp.stat(archivePath)).size,
        sha256: await hashFile(archivePath),
        createdAt: manifest.createdAt,
        reason,
        counts: manifest.counts,
        removed: await this.prune(now),
      };

      this.logger.log(
        `Backup ${filename} erstellt: ${manifest.files.length} Dateien, ${summary.sizeBytes} Bytes.` +
          (summary.removed.length === 0
            ? ''
            : ` ${summary.removed.length} ältere Archive ausgedünnt.`),
      );
      return summary;
    } finally {
      // Die Kopie der Datenbank ist im Archiv; als lose Datei wäre sie nur
      // eine zweite, veraltende Wahrheit unter data/tmp. Das halbe Archiv
      // eines gescheiterten Laufs hat dort ebenso wenig verloren.
      await fsp.rm(databaseCopy, { force: true });
      await fsp.rm(partial, { force: true });
    }
  }

  /** Verhindert, dass zwei Sicherungen derselben Sekunde einander ersetzen. */
  private availableArchive(preferredFilename: string): {
    filename: string;
    archivePath: string;
  } {
    const extension = path.extname(preferredFilename);
    const stem = preferredFilename.slice(0, -extension.length);

    for (let suffix = 0; ; suffix += 1) {
      const filename = suffix === 0 ? preferredFilename : `${stem}-${String(suffix)}${extension}`;
      const archivePath = path.join(this.directory, filename);
      if (!fs.existsSync(archivePath)) return { filename, archivePath };
    }
  }

  /** Die vorhandenen Archive, neueste zuerst. */
  async list(): Promise<BackupArchive[]> {
    if (!fs.existsSync(this.directory)) return [];

    const names = (await fsp.readdir(this.directory)).filter((name) => name.endsWith('.zip'));

    const summaries = await Promise.all(
      names.map(async (filename) => {
        const stats = await fsp.stat(path.join(this.directory, filename));
        const parsed = parseBackupFilename(filename);

        return {
          filename,
          sizeBytes: stats.size,
          // Der Zeitstempel aus dem Namen schlägt die Änderungszeit: Ein
          // synchronisierter oder zurückkopierter Ordner trägt überall die
          // Zeit des Kopiervorgangs.
          createdAt: (parsed?.createdAt ?? stats.mtime).toISOString(),
          reason: parsed?.reason ?? null,
        } satisfies BackupArchive;
      }),
    );

    return summaries.sort((a, b) => b.createdAt.localeCompare(a.createdAt));
  }

  /**
   * Der Pfad zu einem Archiv, gegen Pfadausbruch abgesichert.
   *
   * Der Dateiname kommt aus einer URL; ohne diese Prüfung wäre
   * `../../etc/passwd` ein gültiger „Backup-Name".
   */
  resolveArchive(filename: string): string {
    const resolved = path.resolve(this.directory, filename);

    if (path.dirname(resolved) !== path.resolve(this.directory) || !filename.endsWith('.zip')) {
      throw ApiError.validation(`"${filename}" ist kein Name eines Backup-Archivs.`);
    }
    if (!fs.existsSync(resolved)) {
      throw ApiError.notFound(`Das Archiv ${filename} existiert nicht.`);
    }
    return resolved;
  }

  /**
   * Dünnt die vorhandenen Archive nach dem Generationenprinzip aus.
   *
   * Läuft nach jeder erfolgreichen Sicherung und meldet, was sie entfernt
   * hat. Ein Fehlschlag wird protokolliert, nie geworfen: Unter Windows
   * scheitert das Löschen einer Datei, die gerade heruntergeladen wird — das
   * darf weder die Sicherung noch das Aufräumen der übrigen Archive
   * abbrechen. Deshalb sitzt der `catch` um die einzelne Datei.
   */
  private async prune(now: Date): Promise<string[]> {
    const removed: string[] = [];

    let names: string[];
    try {
      names = (await fsp.readdir(this.directory)).filter((name) => name.endsWith('.zip'));
    } catch (error) {
      this.logger.warn(`Die Archive ließen sich nicht lesen: ${message(error)}`);
      return removed;
    }

    for (const filename of archivesToRemove(names, now)) {
      try {
        await fsp.rm(path.join(this.directory, filename), { force: true });
        removed.push(filename);
      } catch (error) {
        this.logger.warn(`${filename} ließ sich nicht entfernen: ${message(error)}`);
      }
    }

    if (removed.length > 0) {
      this.logger.log(`Ausgedünnt: ${removed.join(', ')}`);
    }
    return removed;
  }

  /**
   * Liegengebliebenes Arbeitsmaterial.
   *
   * Bricht eine Sicherung hart ab — die Anwendung wird beendet, während das
   * Archiv entsteht —, läuft das `finally` nicht mehr. Ohne diesen Kehraus
   * bliebe der Rest für immer liegen, in einem Verzeichnis, auf das die
   * Anleitung den Benutzer ausdrücklich hinweist.
   */
  private async sweepTmp(now: Date): Promise<void> {
    try {
      const entries = await fsp.readdir(this.storage.tmpDir);

      for (const name of entries) {
        if (!/^backup-.*\.(?:sqlite|zip\.part)$/u.test(name)) continue;

        const file = path.join(this.storage.tmpDir, name);
        const stats = await fsp.stat(file);
        if (now.getTime() - stats.mtimeMs < TMP_LEFTOVER_MS) continue;

        await fsp.rm(file, { force: true });
        this.logger.warn(`Rest einer abgebrochenen Sicherung entfernt: ${name}`);
      }
    } catch (error) {
      // Aufräumen ist Nebensache; eine Sicherung darf nicht daran scheitern.
      this.logger.warn(`data/tmp ließ sich nicht aufräumen: ${message(error)}`);
    }
  }

  /**
   * Genug Platz für das Archiv?
   *
   * Eine Sicherung, die die Platte vollschreibt, richtet mehr Schaden an als
   * eine, die es gar nicht gibt: Danach lässt sich auch nicht mehr arbeiten.
   * Lässt sich der freie Platz nicht ermitteln, wird trotzdem gesichert —
   * die Prüfung ist eine Vorsichtsmaßnahme, kein Türsteher.
   */
  private async ensureSpace(databaseSize: number, files: readonly BackupEntry[]): Promise<void> {
    const required =
      databaseSize + files.reduce((sum, file) => sum + file.sizeBytes, 0) + SPACE_HEADROOM_BYTES;

    let available: number;
    try {
      const stats = await fsp.statfs(this.storage.dataDir);
      available = Number(stats.bavail) * Number(stats.bsize);
    } catch (error) {
      this.logger.warn(`Der freie Speicherplatz ließ sich nicht ermitteln: ${message(error)}`);
      return;
    }

    if (available >= required) return;

    throw ApiError.backupFailed(
      `Für die Sicherung werden etwa ${formatBytes(required)} gebraucht, frei sind ` +
        `${formatBytes(available)}. Bitte Platz schaffen und es erneut versuchen.`,
    );
  }

  /**
   * Schreibt eine konsistente Kopie der Datenbank.
   *
   * Über `$executeRawUnsafe`, weil `VACUUM INTO` keinen Parameter für den
   * Zielpfad annimmt — die Anführungszeichen im Pfad werden deshalb von Hand
   * verdoppelt, so wie SQLite es für Zeichenketten verlangt.
   */
  private async copyDatabase(target: string): Promise<void> {
    await this.prisma.$executeRawUnsafe(`VACUUM INTO '${target.replace(/'/gu, "''")}'`);
  }

  /**
   * Alle zu sichernden Dateien samt Hash, relativ zu DATA_DIR.
   *
   * `protected`, damit ein Test den Fall herstellen kann, in dem Manifest
   * und Datei auseinanderlaufen — von Hand ist er ein Wettlauf und deshalb
   * sonst nicht prüfbar.
   */
  protected async collectFiles(): Promise<BackupEntry[]> {
    const entries: BackupEntry[] = [];

    for (const directory of BACKED_UP_DIRECTORIES) {
      const root = path.join(this.storage.dataDir, directory);
      if (!fs.existsSync(root)) continue;

      const found = await fsp.readdir(root, { recursive: true, withFileTypes: true });

      for (const entry of found) {
        if (!entry.isFile()) continue;

        const absolute = path.join(entry.parentPath, entry.name);
        const relative = path.relative(this.storage.dataDir, absolute).split(path.sep).join('/');

        entries.push({
          path: `files/${relative}`,
          sha256: await hashFile(absolute),
          sizeBytes: (await fsp.stat(absolute)).size,
        });
      }
    }

    return entries.sort((a, b) => a.path.localeCompare(b.path));
  }

  /**
   * Packt das Archiv — und prüft dabei, dass das Manifest die Wahrheit sagt.
   *
   * Zwischen dem Hashen in `collectFiles()` und dem Packen liegt Zeit, und
   * die Anwendung läuft weiter. Ändert sich in dieser Lücke eine Datei,
   * enthielte das Archiv Inhalt, der nicht zu seinen eigenen Prüfsummen
   * passt — die Wiederherstellung weist es dann als beschädigt zurück, und
   * zwar erst in dem Moment, in dem man es braucht. Deshalb läuft jede Datei
   * durch einen mitrechnenden Strom und wird am Ende gegen das Manifest
   * gehalten. Lieber keine Sicherung als eine, die nur so aussieht.
   */
  private async writeArchive(
    archivePath: string,
    databaseCopy: string,
    manifest: BackupManifest,
  ): Promise<void> {
    const zip = new yazl.ZipFile();
    const digests = new Map<string, crypto.Hash>();

    // Yazl meldet Packfehler auf dem ZipFile selbst, nicht auf seinem
    // Ausgabestrom — und ein `error` ohne Zuhörer beendet den Prozess. Was
    // hier auflaufen kann, landet deshalb in einem eigenen Versprechen, das
    // gegen das Schreiben antritt.
    let fail!: (error: Error) => void;
    const failed = new Promise<never>((_resolve, reject) => {
      fail = reject;
    });
    zip.on('error', fail);

    // Das Manifest zuerst, damit es beim Wiederherstellen als erster Eintrag
    // gelesen werden kann, ohne das ganze Archiv zu durchlaufen.
    zip.addBuffer(Buffer.from(JSON.stringify(manifest, null, 2), 'utf8'), 'manifest.json');
    // Die Datenbankkopie gehört uns allein und kann sich nicht mehr ändern.
    zip.addFile(databaseCopy, manifest.database.path);

    for (const file of manifest.files) {
      const source = path.join(this.storage.dataDir, file.path.replace(/^files\//u, ''));
      const hash = crypto.createHash('sha256');
      digests.set(file.path, hash);

      const counting = new Transform({
        transform(chunk: Buffer, _encoding, done) {
          hash.update(chunk);
          done(null, chunk);
        },
      });
      counting.on('error', fail);

      const reading = fs.createReadStream(source);
      reading.on('error', (error) => counting.destroy(error));
      reading.pipe(counting);

      // `size` aus dem Manifest: Wächst oder schrumpft die Datei mitten im
      // Vorgang, bricht yazl hier ab, statt ein Archiv mit falscher Länge zu
      // schreiben.
      zip.addReadStream(counting, file.path, { size: file.sizeBytes });
    }

    zip.end();
    await Promise.race([pipeline(zip.outputStream, fs.createWriteStream(archivePath)), failed]);

    for (const file of manifest.files) {
      if (digests.get(file.path)?.digest('hex') === file.sha256) continue;

      throw ApiError.backupFailed(
        `${file.path} hat sich während der Sicherung geändert. Das Archiv wurde ` +
          'verworfen; bitte erneut sichern.',
      );
    }
  }

  /** Die zuletzt angewandte Migration; sagt, gegen welches Schema die Daten passen. */
  private async schemaVersion(): Promise<string | null> {
    try {
      const rows = await this.prisma.$queryRawUnsafe<{ migration_name: string }[]>(
        `SELECT "migration_name" FROM "_prisma_migrations"
          WHERE "finished_at" IS NOT NULL AND "rolled_back_at" IS NULL
          ORDER BY "finished_at" DESC LIMIT 1`,
      );
      return rows[0]?.migration_name ?? null;
    } catch {
      // Eine Datenbank ohne Migrationstabelle ist ungewöhnlich, aber kein
      // Grund, das Backup zu verweigern — Daten sichern geht vor.
      return null;
    }
  }

  private async counts(): Promise<BackupManifest['counts']> {
    const [invoices, documents, assets, customers] = await this.prisma.$transaction([
      this.prisma.invoice.count(),
      this.prisma.invoiceDocument.count(),
      this.prisma.asset.count(),
      this.prisma.customer.count(),
    ]);
    return { invoices, documents, assets, customers };
  }
}

export async function hashFile(file: string): Promise<string> {
  const hash = crypto.createHash('sha256');
  await pipeline(fs.createReadStream(file), hash);
  return hash.digest('hex');
}

function message(error: unknown): string {
  return error instanceof Error ? error.message : String(error);
}
