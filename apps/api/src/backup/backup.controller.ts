import { Controller, Get, Header, HttpCode, HttpStatus, Param, Post, Res } from '@nestjs/common';
import type { Response } from 'express';
import type { BackupStatusResponse, BackupSummary } from '@agentur-tool/shared';
import { BackupService } from './backup.service';

@Controller('backup')
export class BackupController {
  constructor(private readonly backup: BackupService) {}

  /**
   * Erzeugt ein Archiv und liefert seine Eckdaten.
   *
   * Erzeugen und Herunterladen sind zwei Schritte, weil das Archiv nicht nur
   * für den Browser entsteht: Es bleibt unter `data/backups` liegen, damit
   * ein nächtlicher Cron dieselbe Funktion benutzen kann und ein
   * abgebrochener Download nichts kostet.
   */
  @Post('export')
  @HttpCode(HttpStatus.CREATED)
  export(): Promise<BackupSummary> {
    return this.backup.createBackup();
  }

  @Get('status')
  async status(): Promise<BackupStatusResponse> {
    return { backups: await this.backup.list(), directory: this.backup.directory };
  }

  /** Lädt ein vorhandenes Archiv herunter. */
  @Get(':filename')
  @Header('Cache-Control', 'no-store')
  download(@Param('filename') filename: string, @Res() response: Response): void {
    const archive = this.backup.resolveArchive(filename);

    response.setHeader('Content-Type', 'application/zip');
    response.setHeader('X-Content-Type-Options', 'nosniff');
    // `attachment`: Ein Backup will man speichern, nicht ansehen.
    response.setHeader('Content-Disposition', `attachment; filename="${filename}"`);
    response.sendFile(archive);
  }
}
