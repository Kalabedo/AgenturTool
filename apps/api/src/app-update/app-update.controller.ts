import { Body, Controller, Get, HttpCode, HttpStatus, Inject, Post, Put } from '@nestjs/common';
import { z } from 'zod';
import type { UpdateStatus } from '@agentur-tool/shared';
import { ApiError } from '../common/api-error';
import { ZodValidationPipe } from '../common/zod-validation.pipe';
import { UPDATE_HOST, type UpdateHost } from './update-host';

const settingsSchema = z.object({ automatic: z.boolean() });

/**
 * Der Zustand der Updateprüfung für die Oberfläche.
 *
 * Vier schmale Routen, und keine davon reicht etwas nach draußen weiter:
 * Der Hauptprozess kennt die Adresse des Feeds, prüft sie und liefert nur
 * das Ergebnis. Die Oberfläche fragt hier nach — auf der Rückschleife, wie
 * bei jeder anderen Route auch.
 */
@Controller('app/update')
export class AppUpdateController {
  constructor(@Inject(UPDATE_HOST) private readonly host: UpdateHost | null) {}

  @Get()
  status(): UpdateStatus {
    return this.host?.status() ?? NOT_SUPPORTED;
  }

  /**
   * Fragt den Feed sofort.
   *
   * `POST`, weil es etwas auslöst — eine Anfrage nach draußen —, und das
   * soll kein Browser aus einem `GET` heraus vorwegnehmen.
   */
  @Post('check')
  @HttpCode(HttpStatus.OK)
  check(): Promise<UpdateStatus> {
    if (this.host === null) return Promise.resolve(NOT_SUPPORTED);
    return this.host.check();
  }

  @Put('settings')
  settings(
    @Body(new ZodValidationPipe(settingsSchema)) body: { automatic: boolean },
  ): UpdateStatus {
    return this.host?.setAutomatic(body.automatic) ?? NOT_SUPPORTED;
  }

  /** Öffnet das Paket im Browser des Rechners. */
  @Post('download')
  @HttpCode(HttpStatus.OK)
  async download(): Promise<{ opened: true }> {
    const opened = (await this.host?.openDownload()) ?? false;
    if (!opened) {
      throw ApiError.notFound('Es liegt gerade kein Paket zum Laden bereit.');
    }
    return { opened: true };
  }
}

/**
 * Die Antwort ohne Gastgeber.
 *
 * Kein Fehler: Im Browserbetrieb gibt es schlicht nichts zu aktualisieren,
 * und die Oberfläche blendet den ganzen Bereich daraufhin aus.
 */
const NOT_SUPPORTED: UpdateStatus = {
  state: 'nicht-unterstuetzt',
  currentVersion: '',
  automatic: false,
  lastCheckedAt: null,
  available: null,
  error: null,
  feedUrl: null,
};
