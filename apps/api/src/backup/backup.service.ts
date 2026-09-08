import crypto from 'node:crypto';
import fs from 'node:fs';
import fsp from 'node:fs/promises';
import path from 'node:path';
import { pipeline } from 'node:stream/promises';
import { Injectable, Logger } from '@nestjs/common';
import yazl from 'yazl';
import {
  BACKUP_FORMAT_VERSION,
  backupFilename,
  type BackupArchive,
  type BackupEntry,
  type BackupManifest,
  type BackupSummary,
} from '@agentur-tool/shared';
import { ApiError } from '../common/api-error';
import { StorageConfig } from '../common/config.service';
import { PrismaService } from '../common/prisma.service';

/** Was gesichert wird — und was nicht. */
const BACKED_UP_DIRECTORIES = ['assets', 'invoices', 'orphans'];

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

  async createBackup(now: Date = new Date()): Promise<BackupSummary> {
    await fsp.mkdir(this.directory, { recursive: true });
    await fsp.mkdir(this.storage.tmpDir, { recursive: true });

    const databaseCopy = path.join(this.storage.tmpDir, `backup-${crypto.randomUUID()}.sqlite`);
    const filename = backupFilename(now);
    const archivePath = path.join(this.directory, filename);

    try {
      await this.copyDatabase(databaseCopy);

      const files = await this.collectFiles();
      const manifest: BackupManifest = {
        formatVersion: BACKUP_FORMAT_VERSION,
        appVersion: process.env.npm_package_version ?? '0.1.0',
        schemaVersion: await this.schemaVersion(),
        createdAt: now.toISOString(),
        counts: await this.counts(),
        database: {
          path: 'database.sqlite',
          sha256: await hashFile(databaseCopy),
          sizeBytes: (await fsp.stat(databaseCopy)).size,
        },
        files,
      };

      await this.writeArchive(archivePath, databaseCopy, manifest);

      const summary: BackupSummary = {
        filename,
        sizeBytes: (await fsp.stat(archivePath)).size,
        sha256: await hashFile(archivePath),
        createdAt: manifest.createdAt,
        counts: manifest.counts,
      };

      this.logger.log(
        `Backup ${filename} erstellt: ${manifest.files.length} Dateien, ${summary.sizeBytes} Bytes.`,
      );
      return summary;
    } finally {
      // Die Kopie der Datenbank ist im Archiv; als lose Datei wäre sie nur
      // eine zweite, veraltende Wahrheit unter data/tmp.
      await fsp.rm(databaseCopy, { force: true });
    }
  }

  /** Die vorhandenen Archive, neueste zuerst. */
  async list(): Promise<BackupArchive[]> {
    if (!fs.existsSync(this.directory)) return [];

    const names = (await fsp.readdir(this.directory)).filter((name) => name.endsWith('.zip'));

    const summaries = await Promise.all(
      names.map(async (filename) => {
        const stats = await fsp.stat(path.join(this.directory, filename));
        return {
          filename,
          sizeBytes: stats.size,
          createdAt: stats.mtime.toISOString(),
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
   * Schreibt eine konsistente Kopie der Datenbank.
   *
   * Über `$executeRawUnsafe`, weil `VACUUM INTO` keinen Parameter für den
   * Zielpfad annimmt — die Anführungszeichen im Pfad werden deshalb von Hand
   * verdoppelt, so wie SQLite es für Zeichenketten verlangt.
   */
  private async copyDatabase(target: string): Promise<void> {
    await this.prisma.$executeRawUnsafe(`VACUUM INTO '${target.replace(/'/gu, "''")}'`);
  }

  /** Alle zu sichernden Dateien samt Hash, relativ zu DATA_DIR. */
  private async collectFiles(): Promise<BackupEntry[]> {
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

  private async writeArchive(
    archivePath: string,
    databaseCopy: string,
    manifest: BackupManifest,
  ): Promise<void> {
    const zip = new yazl.ZipFile();

    // Das Manifest zuerst, damit es beim Wiederherstellen als erster Eintrag
    // gelesen werden kann, ohne das ganze Archiv zu durchlaufen.
    zip.addBuffer(Buffer.from(JSON.stringify(manifest, null, 2), 'utf8'), 'manifest.json');
    zip.addFile(databaseCopy, manifest.database.path);

    for (const file of manifest.files) {
      zip.addFile(path.join(this.storage.dataDir, file.path.replace(/^files\//u, '')), file.path);
    }

    zip.end();
    await pipeline(zip.outputStream, fs.createWriteStream(archivePath));
  }

  /** Die zuletzt angewandte Migration; sagt, gegen welches Schema die Daten passen. */
  private async schemaVersion(): Promise<string | null> {
    try {
      const rows = await this.prisma.$queryRawUnsafe<{ migration_name: string }[]>(
        `SELECT "migration_name" FROM "_prisma_migrations"
          WHERE "finished_at" IS NOT NULL
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
