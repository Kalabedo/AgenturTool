import {
  Body,
  Controller,
  Get,
  HttpCode,
  HttpStatus,
  Param,
  ParseIntPipe,
  Post,
  Put,
  Query,
} from '@nestjs/common';
import { z } from 'zod';
import {
  MAIL_TEMPLATE_KEY_VALUES,
  mailMessageListQuerySchema,
  mailSendInputSchema,
  mailSettingsInputSchema,
  mailSourceSchema,
  mailTemplateInputSchema,
  type MailConnectionCheckResponse,
  type MailDraftResponse,
  type MailMessageListQuery,
  type MailMessageResponse,
  type MailSendPayload,
  type MailSendResponse,
  type MailSettingsPayload,
  type MailSettingsResponse,
  type MailTemplateKey,
  type MailTemplatePayload,
  type MailTemplateResponse,
} from '@privatura/shared';
import { ZodValidationPipe } from '../common/zod-validation.pipe';
import { MailService } from './mail.service';
import { MailSettingsService } from './mail-settings.service';
import { MailTemplatesService } from './mail-templates.service';

/** Der Zeitraum eines Zeitnachweis-Entwurfs, wie er in der Abfragezeichenkette steht. */
const timeReportDraftQuerySchema = z.object({
  customerId: z.coerce.number().int().positive(),
  from: z.string().trim(),
  to: z.string().trim(),
});

const templateKeySchema = z.enum(
  MAIL_TEMPLATE_KEY_VALUES as [MailTemplateKey, ...MailTemplateKey[]],
);

@Controller('mail')
export class MailController {
  constructor(
    private readonly mail: MailService,
    private readonly settings: MailSettingsService,
    private readonly templates: MailTemplatesService,
  ) {}

  // ---------------------------------------------------------------------------
  // Einrichtung
  // ---------------------------------------------------------------------------

  @Get('settings')
  getSettings(): Promise<MailSettingsResponse> {
    return this.settings.get();
  }

  @Put('settings')
  updateSettings(
    @Body(new ZodValidationPipe(mailSettingsInputSchema)) payload: MailSettingsPayload,
  ): Promise<MailSettingsResponse> {
    return this.settings.update(payload);
  }

  /**
   * „Verbindung prüfen".
   *
   * 200 auch bei einem abgelehnten Anmeldeversuch: Die Prüfung ist
   * gelaufen, und ihr Ergebnis ist die Antwort. Ein HTTP-Fehler hieße, die
   * Prüfung selbst sei gescheitert — und die Oberfläche müsste zwei Wege
   * unterscheiden, um denselben Satz anzuzeigen.
   */
  @Post('settings/check')
  @HttpCode(HttpStatus.OK)
  checkConnection(): Promise<MailConnectionCheckResponse> {
    return this.mail.checkConnection();
  }

  // ---------------------------------------------------------------------------
  // Vorlagen
  // ---------------------------------------------------------------------------

  @Get('templates')
  listTemplates(): Promise<MailTemplateResponse[]> {
    return this.templates.list();
  }

  @Put('templates/:key')
  updateTemplate(
    @Param('key', new ZodValidationPipe(templateKeySchema)) key: MailTemplateKey,
    @Body(new ZodValidationPipe(mailTemplateInputSchema)) payload: MailTemplatePayload,
  ): Promise<MailTemplateResponse> {
    return this.templates.update(key, payload);
  }

  /** Zurück auf den Auslieferungstext — der Weg heraus aus einer verkorksten Vorlage. */
  @Post('templates/:key/reset')
  @HttpCode(HttpStatus.OK)
  resetTemplate(
    @Param('key', new ZodValidationPipe(templateKeySchema)) key: MailTemplateKey,
  ): Promise<MailTemplateResponse> {
    return this.templates.reset(key);
  }

  // ---------------------------------------------------------------------------
  // Entwurf und Versand
  // ---------------------------------------------------------------------------

  /**
   * Was im Versanddialog steht, bevor jemand etwas ändert.
   *
   * Lesend und folgenlos, deshalb GET — und deshalb entstehen hier auch
   * noch keine PDFs: Der Entwurf nennt die möglichen Anhänge, erzeugt sie
   * aber erst der Versand.
   */
  @Get('draft/invoice/:id')
  invoiceDraft(@Param('id', ParseIntPipe) id: number): Promise<MailDraftResponse> {
    return this.mail.draft(mailSourceSchema.parse({ kind: 'INVOICE', invoiceId: id }));
  }

  @Get('draft/time-report')
  timeReportDraft(
    @Query(new ZodValidationPipe(timeReportDraftQuerySchema))
    query: z.output<typeof timeReportDraftQuerySchema>,
  ): Promise<MailDraftResponse> {
    return this.mail.draft(mailSourceSchema.parse({ kind: 'TIME_REPORT', ...query }));
  }

  /**
   * Verschickt die Nachricht.
   *
   * 200 statt 201: Es entsteht ein Protokolleintrag, aber die Handlung ist
   * das Verschicken — und dafür gibt es keine neue Adresse, unter der man
   * anschließend nachsehen könnte.
   */
  @Post('send')
  @HttpCode(HttpStatus.OK)
  async send(
    @Body(new ZodValidationPipe(mailSendInputSchema)) payload: MailSendPayload,
  ): Promise<MailSendResponse> {
    return this.mail.send(payload);
  }

  /** Das Versandprotokoll, wahlweise auf eine Rechnung eingeschränkt. */
  @Get('messages')
  messages(
    @Query(new ZodValidationPipe(mailMessageListQuerySchema)) query: MailMessageListQuery,
  ): Promise<MailMessageResponse[]> {
    return this.mail.messages(query);
  }
}
