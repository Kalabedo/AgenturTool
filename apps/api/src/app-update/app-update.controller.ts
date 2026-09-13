import { Body, Controller, Get, HttpCode, HttpStatus, Inject, Post, Put } from '@nestjs/common';
import { z } from 'zod';
import type { UpdateStatus } from '@agentur-tool/shared';
import { ApiError } from '../common/api-error';
import { ZodValidationPipe } from '../common/zod-validation.pipe';
import { UPDATE_HOST, type UpdateHost } from './update-host';

const settingsSchema = z.object({ automatic: z.boolean() });

/**
 * Der Updateweg für die Oberfläche.
 *
 * Eine Route je Schritt — prüfen, laden, abbrechen, installieren — und
 * keine davon reicht etwas nach draußen weiter: Der Hauptprozess kennt die
 * Adresse des Feeds, prüft Prüfsumme und Signatur und liefert nur den
 * Zustand. Die Oberfläche fragt hier nach, auf der Rückschleife, wie bei
 * jeder anderen Route auch.
 *
 * Jeder Schritt ist eine eigene Route und kein Automat: Zwischen „es gibt
 * ein Update", „geladen" und „installiert" steht jeweils ein Klick.
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

  /**
   * Beginnt den Download.
   *
   * Antwortet mit dem Zustand, sobald er läuft — der Fortschritt kommt
   * danach über `GET`. Ein zweiter Aufruf während eines laufenden
   * Downloads tut nichts.
   */
  @Post('download')
  @HttpCode(HttpStatus.OK)
  download(): Promise<UpdateStatus> {
    if (this.host === null) return Promise.resolve(NOT_SUPPORTED);
    return this.host.download();
  }

  @Post('download/cancel')
  @HttpCode(HttpStatus.OK)
  cancel(): UpdateStatus {
    return this.host?.cancelDownload() ?? NOT_SUPPORTED;
  }

  /**
   * Sichert, installiert und startet neu.
   *
   * Die Antwort kann ausbleiben, weil sich die Anwendung dabei beendet;
   * die Oberfläche rechnet damit. Kommt sie an und nennt einen Fehler, ist
   * nichts geschehen — die alte Installation steht unangetastet da.
   */
  @Post('install')
  @HttpCode(HttpStatus.OK)
  install(): Promise<UpdateStatus> {
    if (this.host === null) return Promise.resolve(NOT_SUPPORTED);
    return this.host.install();
  }

  /** Zeigt das geladene Paket im Dateimanager. */
  @Post('reveal')
  @HttpCode(HttpStatus.OK)
  reveal(): { revealed: true } {
    if (this.host?.revealDownload() !== true) {
      throw ApiError.notFound('Es liegt kein geladenes Paket vor.');
    }
    return { revealed: true };
  }

  /**
   * Öffnet das Paket im Browser des Rechners — der Weg von Hand.
   *
   * Bleibt neben dem Download in der Anwendung: Für ein System ohne
   * eigenes Paket ist er der einzige, und wer lieber selbst installiert,
   * soll es können.
   */
  @Post('open')
  @HttpCode(HttpStatus.OK)
  async open(): Promise<{ opened: true }> {
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
  progress: null,
  ready: null,
  error: null,
  feedUrl: null,
};
