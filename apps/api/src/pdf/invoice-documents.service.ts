import crypto from 'node:crypto';
import fs from 'node:fs';
import fsp from 'node:fs/promises';
import path from 'node:path';
import { Injectable, Logger, type OnApplicationBootstrap } from '@nestjs/common';
import {
  DOCUMENT_KIND,
  DOCUMENT_KIND_EXTENSION,
  DOCUMENT_KIND_VALUES,
  type DocumentKind,
} from '@agentur-tool/shared';
import { ApiError } from '../common/api-error';
import { StorageConfig } from '../common/config.service';
import { PrismaService } from '../common/prisma.service';

/** Ein geschriebenes, aber noch nicht endgültig abgelegtes Dokument. */
export interface StagedDocument {
  /** PDF oder XML — dieselbe Ablage trägt beide. */
  kind: DocumentKind;
  /** Absoluter Pfad unterhalb von `data/tmp`. */
  tempPath: string;
  /** Zielpfad relativ zu DATA_DIR, wie er in der Datenbank steht. */
  relativePath: string;
  sha256: string;
  sizeBytes: number;
}

/**
 * Die Ablage der erzeugten PDFs (Abschnitt 13).
 *
 * Dateien im Dateisystem, Metadaten und Hash in der Datenbank. Die
 * Konsistenzlücke zwischen beidem ist der ganze Grund für diese Klasse:
 *
 * - Das PDF entsteht **vor** dem Commit unter `data/tmp` und wird erst
 *   **nach** dem Commit an seinen Platz verschoben. `rename` ist innerhalb
 *   desselben Dateisystems atomar — es gibt keinen Moment, in dem eine halbe
 *   Datei unter der endgültigen Adresse liegt.
 * - Bricht die Transaktion ab, wird die temporäre Datei verworfen und es
 *   bleibt nichts zurück.
 * - Bricht es zwischen Commit und Verschieben ab, gibt es einen Datensatz
 *   ohne Datei. Das ist der einzige verbleibende Fall, er ist beim Start
 *   erkennbar (`reconcile`) und aus dem Snapshot reparierbar.
 */
@Injectable()
export class InvoiceDocumentsService implements OnApplicationBootstrap {
  private readonly logger = new Logger(InvoiceDocumentsService.name);

  constructor(
    private readonly prisma: PrismaService,
    private readonly storage: StorageConfig,
  ) {
    this.storage.ensureDirectories();
  }

  /**
   * Der Abgleich läuft beim Start, nicht auf Knopfdruck.
   *
   * Der Fall, den er entdeckt, entsteht durch einen Absturz oder ein
   * unvollständig eingespieltes Backup — beides bemerkt man beim nächsten
   * Start, und dann soll es im Log stehen und nicht erst auffallen, wenn
   * jemand ein PDF herunterladen will. Ein Fehler dabei darf den Start
   * nicht verhindern: Eine laufende Anwendung mit einer Warnung ist besser
   * als eine, die nicht hochkommt.
   */
  async onApplicationBootstrap(): Promise<void> {
    try {
      const result = await this.reconcile();
      if (result.missingFiles.length === 0 && result.orphanedFiles.length === 0) return;

      this.logger.warn(
        `Abgleich: ${result.missingFiles.length} Datensätze ohne Datei, ` +
          `${result.orphanedFiles.length} Dateien ohne Datensatz.`,
      );
    } catch (error) {
      this.logger.error(
        'Der Abgleich von Datenbank und Dateiablage ist fehlgeschlagen.',
        error instanceof Error ? error.stack : error,
      );
    }
  }

  /**
   * `invoices/2026/2026-001.pdf` — nach Jahr sortiert wie ein Ordner im Regal.
   *
   * PDF und XML derselben Rechnung liegen nebeneinander und unterscheiden
   * sich nur in der Endung. Damit bleibt der Unique-Index auf `path`
   * aussagekräftig, ohne dass er die Art mit aufnehmen müsste.
   */
  relativePathFor(year: number, number: string, kind: DocumentKind = DOCUMENT_KIND.PDF): string {
    return path.posix.join('invoices', String(year), `${number}${DOCUMENT_KIND_EXTENSION[kind]}`);
  }

  /**
   * Schreibt das PDF in die temporäre Ablage und bildet den Hash.
   *
   * Der Hash entsteht über genau die Bytes, die geschrieben werden — er ist
   * später die Grundlage der Integritätsprüfung im Backup.
   */
  async stage(
    bytes: Buffer,
    year: number,
    number: string,
    kind: DocumentKind = DOCUMENT_KIND.PDF,
  ): Promise<StagedDocument> {
    const tempPath = path.join(
      this.storage.tmpDir,
      `${crypto.randomUUID()}${DOCUMENT_KIND_EXTENSION[kind]}`,
    );
    await fsp.writeFile(tempPath, bytes);

    return {
      kind,
      tempPath,
      relativePath: this.relativePathFor(year, number, kind),
      sha256: crypto.createHash('sha256').update(bytes).digest('hex'),
      sizeBytes: bytes.length,
    };
  }

  /** Verschiebt die temporäre Datei an ihren endgültigen Platz. */
  async commit(staged: StagedDocument): Promise<void> {
    const target = this.storage.resolve(staged.relativePath);
    await fsp.mkdir(path.dirname(target), { recursive: true });
    await fsp.rename(staged.tempPath, target);
  }

  /** Nach einem Abbruch: die temporäre Datei verwerfen. */
  async discard(staged: StagedDocument): Promise<void> {
    await fsp.rm(staged.tempPath, { force: true });
  }

  exists(relativePath: string): boolean {
    return fs.existsSync(this.storage.resolve(relativePath));
  }

  async read(relativePath: string): Promise<Buffer> {
    try {
      return await fsp.readFile(this.storage.resolve(relativePath));
    } catch {
      throw ApiError.notFound(
        `Die Datei ${relativePath} fehlt. Sie lässt sich aus den gespeicherten Daten neu erzeugen.`,
      );
    }
  }

  async remove(relativePath: string): Promise<void> {
    await fsp.rm(this.storage.resolve(relativePath), { force: true });
  }

  /**
   * Gleicht Datenbank und Dateisystem ab (Abschnitt 13, Schritt 4).
   *
   * Läuft beim Start. Er repariert nichts von selbst — er macht sichtbar,
   * was auseinandergelaufen ist: Datensätze ohne Datei werden protokolliert
   * und in der Oberfläche als reparierbar angezeigt, Dateien ohne Datensatz
   * wandern nach `data/orphans/`, statt gelöscht zu werden.
   */
  async reconcile(): Promise<{ missingFiles: string[]; orphanedFiles: string[] }> {
    const documents = await this.prisma.invoiceDocument.findMany({
      select: { path: true, invoiceId: true },
    });
    const known = new Set(documents.map((document) => document.path));

    const missingFiles = documents
      .filter((document) => !this.exists(document.path))
      .map((document) => document.path);

    for (const missing of missingFiles) {
      this.logger.warn(`Zu ${missing} fehlt die Datei — Neuerzeugung aus dem Snapshot möglich.`);
    }

    const orphanedFiles: string[] = [];
    for (const file of this.listStoredFiles()) {
      if (known.has(file)) continue;

      const target = await this.moveToOrphans(file);
      orphanedFiles.push(file);
      this.logger.warn(`${file} gehört zu keiner Rechnung und liegt jetzt unter ${target}.`);
    }

    return { missingFiles, orphanedFiles };
  }

  /** Alle abgelegten Dokumente als Pfade relativ zu DATA_DIR. */
  private listStoredFiles(): string[] {
    const root = this.storage.invoicesDir;
    if (!fs.existsSync(root)) return [];

    return fs
      .readdirSync(root, { recursive: true, withFileTypes: true })
      .filter(
        (entry) =>
          entry.isFile() &&
          DOCUMENT_KIND_VALUES.some((kind) =>
            entry.name.endsWith(DOCUMENT_KIND_EXTENSION[kind as DocumentKind]),
          ),
      )
      .map((entry) =>
        path
          .relative(this.storage.dataDir, path.join(entry.parentPath, entry.name))
          .split(path.sep)
          .join('/'),
      );
  }

  private async moveToOrphans(relativePath: string): Promise<string> {
    await fsp.mkdir(this.storage.orphansDir, { recursive: true });

    // Der Jahresordner steckt mit im Namen, damit zwei gleichnamige Dateien
    // aus verschiedenen Jahren sich nicht gegenseitig überschreiben.
    const flatName = relativePath
      .replace(/^invoices\//u, '')
      .split('/')
      .join('-');
    const target = path.join(this.storage.orphansDir, flatName);

    await fsp.rename(this.storage.resolve(relativePath), target);
    return path.relative(this.storage.dataDir, target);
  }
}
