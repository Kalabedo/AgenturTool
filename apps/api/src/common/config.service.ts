import fs from 'node:fs';
import path from 'node:path';
import { Injectable } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';

/**
 * Auflösung der Ablageorte.
 *
 * Alles unterhalb von DATA_DIR: Datenbank, hochgeladene Assets und später
 * die erzeugten PDFs. Ein einziges Verzeichnis zu sichern ist die Grundlage
 * der Backup-Strategie — verstreute Pfade wären dort der erste Fehler.
 */
@Injectable()
export class StorageConfig {
  readonly dataDir: string;

  constructor(config: ConfigService) {
    const configured = config.get<string>('DATA_DIR') ?? './data';
    this.dataDir = path.resolve(process.cwd(), configured);
  }

  get assetsDir(): string {
    return path.join(this.dataDir, 'assets');
  }

  get invoicesDir(): string {
    return path.join(this.dataDir, 'invoices');
  }

  /** Temporäre Ablage: PDFs entstehen hier und werden erst nach dem Commit verschoben. */
  get tmpDir(): string {
    return path.join(this.dataDir, 'tmp');
  }

  /**
   * Dateien ohne Datensatz landen hier statt im Papierkorb.
   *
   * Ein PDF, zu dem die Datenbank nichts weiß, ist entweder Rest eines
   * abgebrochenen Vorgangs oder das Wertvollste, was vom Backup übrig ist.
   * Gelöscht wird es deshalb nie automatisch.
   */
  get orphansDir(): string {
    return path.join(this.dataDir, 'orphans');
  }

  /**
   * Anhänge, die auf ihre Übergabe an die Mail-Anwendung warten.
   *
   * Kopien von Dokumenten, die längst abgelegt und gesichert sind — deshalb
   * steht dieses Verzeichnis nicht in der Liste des Backups. Was hier
   * liegt, räumt der Versand nach sieben Tagen selbst auf.
   */
  get mailOutboxDir(): string {
    return path.join(this.dataDir, 'mail-anhaenge');
  }

  ensureDirectories(): void {
    for (const dir of [
      this.dataDir,
      this.assetsDir,
      this.invoicesDir,
      this.tmpDir,
      this.orphansDir,
      this.mailOutboxDir,
    ]) {
      fs.mkdirSync(dir, { recursive: true });
    }
  }

  /** Wandelt einen in der Datenbank gespeicherten relativen Pfad in einen absoluten. */
  resolve(relativePath: string): string {
    const absolute = path.resolve(this.dataDir, relativePath);

    // Schutz gegen Pfadausbruch: Ein manipulierter Datenbankeintrag wie
    // "../../etc/passwd" darf nicht außerhalb von DATA_DIR landen.
    if (!absolute.startsWith(this.dataDir + path.sep)) {
      throw new Error(`Pfad liegt außerhalb von DATA_DIR: ${relativePath}`);
    }
    return absolute;
  }
}
