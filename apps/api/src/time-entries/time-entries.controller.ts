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
  TIME_ENTRY_BILLING_FILTER,
  summarizeTimeEntries,
  timeEntryBillingSchema,
  timeEntryInputSchema,
  timeEntryRangeSchema,
  timeEntryUnbillSchema,
  type TimeEntryBillingPayload,
  type TimeEntryOpenSummary,
  type TimeEntryPayload,
  type TimeEntryRangeQuery,
  type TimeEntryResponse,
  type TimeEntryUnbillPayload,
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

  /**
   * Die offenen Zeiten je Kunde — die Reiterleiste der Oberfläche.
   *
   * Steht wie „report" vor `:id`, damit „open-summary" nicht als Id gelesen wird.
   */
  @Get('open-summary')
  openSummary(): Promise<TimeEntryOpenSummary[]> {
    return this.timeEntries.openSummary();
  }

  /**
   * Rechnet die offenen Zeiten eines Kunden ab und liefert den Nachweis.
   *
   * Ein Aufruf statt zwei: Markieren und Drucken gehören zusammen, und
   * zwischen zwei Aufrufen könnte das eine gelingen und das andere
   * scheitern — mit dem Ergebnis, dass Zeiten als abgerechnet gelten,
   * für die es kein Dokument gibt.
   *
   * Der Rumpf ist das PDF; was die Oberfläche zum Rückgängigmachen braucht,
   * steht in `X-Billing-Result`. Ein JSON-Rumpf mit eingebettetem PDF wäre
   * die Alternative gewesen — dann müsste der Browser das Dokument aus
   * Base64 wieder zusammensetzen, statt es einfach zu speichern.
   */
  @Post('bill')
  async bill(
    @Body(new ZodValidationPipe(timeEntryBillingSchema)) payload: TimeEntryBillingPayload,
    @Res() response: Response,
  ): Promise<void> {
    const { entries, billedAt } = await this.timeEntries.bill(payload.customerId);

    // Die Liste kommt chronologisch aus dem Service, also stehen früher und
    // spätester Tag an den Rändern.
    const from = entries[0]?.date ?? '';
    const to = entries[entries.length - 1]?.date ?? '';
    const summary = summarizeTimeEntries(entries);

    const document = await this.report.render(
      // Ohne Zeitraum: Der Nachweis leitet ihn aus den Einträgen ab. Ihn
      // hier zu setzen hieße, dieselbe Rechnung zweimal zu führen.
      {
        from: null,
        to: null,
        customerId: payload.customerId,
        billing: TIME_ENTRY_BILLING_FILTER.ALL,
      },
      entries,
    );

    response.setHeader(
      'X-Billing-Result',
      // Base64, weil Kundennamen Umlaute enthalten und HTTP-Header nur
      // Latin-1 tragen.
      Buffer.from(
        JSON.stringify({
          customerId: payload.customerId,
          customerName: entries[0]?.customerName ?? '',
          entryCount: summary.entryCount,
          durationMinutes: summary.durationMinutes,
          from,
          to,
          billedAt,
          ids: entries.map((entry) => entry.id),
        }),
        'utf8',
      ).toString('base64'),
    );
    this.sendPdf(response, document);
  }

  /** Nimmt eine Abrechnung zurück — das Gegenstück zum Abrechnen ohne Rückfrage. */
  @Post('unbill')
  @HttpCode(HttpStatus.OK)
  async unbill(
    @Body(new ZodValidationPipe(timeEntryUnbillSchema)) payload: TimeEntryUnbillPayload,
  ): Promise<{ count: number }> {
    return { count: await this.timeEntries.unbill(payload.ids) };
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
