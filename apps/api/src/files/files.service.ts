import crypto from 'node:crypto';
import fs from 'node:fs/promises';
import path from 'node:path';
import { Injectable } from '@nestjs/common';
import type { Asset } from '@prisma/client';
import { LOGO_MAX_BYTES, formatBytes } from '@agentur-tool/shared';
import { ApiError } from '../common/api-error';
import { StorageConfig } from '../common/config.service';
import { PrismaService } from '../common/prisma.service';
import { detectImageMimeType, extensionFor } from './image-type';

/**
 * Ablage hochgeladener Dateien.
 *
 * Dateien liegen im Dateisystem unter DATA_DIR, die Metadaten in der
 * Datenbank (D13). Der Dateiname ist der Inhalts-Hash, nicht der
 * Originalname: Ein hochgeladener Name kann Pfadanteile oder
 * Sonderzeichen enthalten, und identische Dateien belegen so nur einmal
 * Platz.
 */
@Injectable()
export class FilesService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly storage: StorageConfig,
  ) {
    this.storage.ensureDirectories();
  }

  /**
   * Nimmt ein hochgeladenes Bild an und legt es als Asset ab.
   *
   * Der gemeldete MIME-Typ wird ignoriert; entscheidend ist die Signatur im
   * Inhalt.
   */
  async storeImage(buffer: Buffer, originalFilename: string | null): Promise<Asset> {
    if (buffer.length === 0) {
      throw ApiError.validation('Die Datei ist leer.');
    }
    if (buffer.length > LOGO_MAX_BYTES) {
      throw ApiError.fileTooLarge(
        `Die Datei ist ${formatBytes(buffer.length)} groß, erlaubt sind höchstens ${formatBytes(LOGO_MAX_BYTES)}.`,
      );
    }

    const mimeType = detectImageMimeType(buffer);
    if (mimeType === null) {
      throw ApiError.unsupportedFileType(
        'Nur PNG, JPEG und WebP werden unterstützt. Die Datei sieht nach keinem dieser Formate aus.',
      );
    }

    const sha256 = crypto.createHash('sha256').update(buffer).digest('hex');
    const relativePath = path.join('assets', `${sha256}.${extensionFor(mimeType)}`);

    const existing = await this.prisma.asset.findUnique({ where: { path: relativePath } });
    if (existing !== null) {
      // Dieselbe Datei war schon einmal da. Erneut zu schreiben brächte
      // nichts, da der Inhalt per Definition identisch ist.
      return existing;
    }

    await fs.writeFile(this.storage.resolve(relativePath), buffer);

    return this.prisma.asset.create({
      data: {
        path: relativePath,
        mimeType,
        sizeBytes: buffer.length,
        sha256,
        originalFilename,
      },
    });
  }

  async findById(id: number): Promise<Asset> {
    const asset = await this.prisma.asset.findUnique({ where: { id } });
    if (asset === null) {
      throw ApiError.notFound(`Datei ${id} existiert nicht.`);
    }
    return asset;
  }

  async readContent(asset: Asset): Promise<Buffer> {
    try {
      return await fs.readFile(this.storage.resolve(asset.path));
    } catch {
      // Metadaten ohne Datei: Das Verzeichnis wurde außerhalb der Anwendung
      // verändert oder ein Backup unvollständig eingespielt.
      throw ApiError.notFound(
        `Zu Datei ${asset.id} fehlt der Inhalt unter ${asset.path}. Möglicherweise ist ein Backup unvollständig.`,
      );
    }
  }

  /**
   * Entfernt Datensatz und Datei.
   *
   * Reihenfolge mit Absicht: erst die Datenbankzeile, dann die Datei. Bricht
   * es dazwischen ab, bleibt eine verwaiste Datei zurück — unschön, aber
   * harmlos. Andersherum entstünde ein Datensatz, dessen Datei fehlt, und
   * das wäre ein defekter Zustand.
   */
  async delete(id: number): Promise<void> {
    const asset = await this.prisma.asset.findUnique({ where: { id } });
    if (asset === null) return;

    await this.prisma.asset.delete({ where: { id } });
    await fs.rm(this.storage.resolve(asset.path), { force: true });
  }
}
