import {
  Body,
  Controller,
  Delete,
  Get,
  HttpCode,
  HttpStatus,
  Param,
  ParseIntPipe,
  Patch,
  Post,
  Query,
  Res,
} from '@nestjs/common';
import type { Response } from 'express';
import {
  timeEntryInputSchema,
  timeEntryRangeSchema,
  type TimeEntryPayload,
  type TimeEntryRangeQuery,
  type TimeEntryResponse,
} from '@agentur-tool/shared';
import { ZodValidationPipe } from '../common/zod-validation.pipe';
import { TimeReportService, type RenderedTimeReport } from '../pdf/time-report.service';
import { TimeEntriesService } from './time-entries.service';

@Controller('time-entries')
export class TimeEntriesController {
  constructor(
    private readonly timeEntries: TimeEntriesService,
    private readonly report: TimeReportService,
  ) {}

  /**
   * Der Zeitnachweis als PDF.
   *
   * Steht vor `:id`, damit „report" nicht als Eintrags-id gelesen wird — und
   * nimmt denselben Filter entgegen wie die Liste: Was auf dem Bildschirm
   * steht, ist auch das, was im PDF landet.
   */
  @Get('report/pdf')
  async reportPdf(
    @Query(new ZodValidationPipe(timeEntryRangeSchema)) query: TimeEntryRangeQuery,
    @Res() response: Response,
  ): Promise<void> {
    const entries = await this.timeEntries.list(query);
    this.sendPdf(response, await this.report.render(query, entries));
  }

  @Get()
  list(
    @Query(new ZodValidationPipe(timeEntryRangeSchema)) query: TimeEntryRangeQuery,
  ): Promise<TimeEntryResponse[]> {
    return this.timeEntries.list(query);
  }

  @Get(':id')
  findById(@Param('id', ParseIntPipe) id: number): Promise<TimeEntryResponse> {
    return this.timeEntries.findById(id);
  }

  @Post()
  create(
    @Body(new ZodValidationPipe(timeEntryInputSchema)) payload: TimeEntryPayload,
  ): Promise<TimeEntryResponse> {
    return this.timeEntries.create(payload);
  }

  /** Ersetzt den Eintrag vollständig; das Schema verlangt alle Felder. */
  @Patch(':id')
  update(
    @Param('id', ParseIntPipe) id: number,
    @Body(new ZodValidationPipe(timeEntryInputSchema)) payload: TimeEntryPayload,
  ): Promise<TimeEntryResponse> {
    return this.timeEntries.update(id, payload);
  }

  /**
   * Löscht endgültig — ohne Archiv.
   *
   * Anders als beim Kunden gibt es hier nichts zu bewahren: Ein
   * Zeiteintrag hat keine Historie, die auf ihn zeigt. Ein Vertipper soll
   * verschwinden können, statt die Monatssumme zu verfälschen.
   */
  @Delete(':id')
  @HttpCode(HttpStatus.NO_CONTENT)
  remove(@Param('id', ParseIntPipe) id: number): Promise<void> {
    return this.timeEntries.remove(id);
  }

  /** Wie beim Rechnungs-PDF: Dateiname zweimal im Header, nichts aus dem Cache. */
  private sendPdf(response: Response, document: RenderedTimeReport): void {
    const asciiName = document.filename.replace(/[^\x20-\x7e]/gu, '_');

    response.setHeader('Content-Type', 'application/pdf');
    response.setHeader('Content-Length', document.bytes.length);
    response.setHeader(
      'Content-Disposition',
      `inline; filename="${asciiName}"; filename*=UTF-8''${encodeURIComponent(document.filename)}`,
    );
    response.setHeader('Cache-Control', 'no-store');
    response.setHeader('X-Content-Type-Options', 'nosniff');
    response.end(document.bytes);
  }
}
