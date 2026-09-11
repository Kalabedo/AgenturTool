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
import { z } from 'zod';
import {
  invoiceDraftInputSchema,
  invoiceListQuerySchema,
  invoicePaymentInputSchema,
  invoiceSentInputSchema,
  type InvoiceDraftPayload,
  type InvoiceListQuery,
  type InvoiceListResponse,
  type InvoicePaymentPayload,
  type InvoiceResponse,
  type InvoiceSentPayload,
} from '@agentur-tool/shared';
import { ZodValidationPipe } from '../common/zod-validation.pipe';
import { InvoicePdfService, type RenderedInvoicePdf } from '../pdf/invoice-pdf.service';
import { EinvoiceService } from '../einvoice/einvoice.service';
import { InvoiceFinalizeService } from './invoice-finalize.service';
import { InvoicesService } from './invoices.service';

/** Beim Anlegen genügt der Kunde; alles Weitere belegt der Server vor. */
const createDraftSchema = z.object({
  customerId: z
    .union([z.string().trim(), z.number(), z.null()])
    .optional()
    .transform((value) => {
      if (value === undefined || value === null || value === '') return null;
      const parsed = typeof value === 'number' ? value : Number(value);
      return Number.isInteger(parsed) && parsed > 0 ? parsed : null;
    }),
});

@Controller('invoices')
export class InvoicesController {
  constructor(
    private readonly invoices: InvoicesService,
    private readonly finalizer: InvoiceFinalizeService,
    private readonly pdf: InvoicePdfService,
    private readonly einvoice: EinvoiceService,
  ) {}

  /**
   * PDF aus ungespeicherten Formulardaten.
   *
   * Steht vor `:id`, damit „preview" nicht als Rechnungs-id gelesen wird.
   */
  @Post('preview/pdf')
  // POST, weil die Formulardaten in den Rumpf gehören — aber 200 statt 201:
  // Es entsteht nichts, was danach eine Adresse hätte.
  @HttpCode(HttpStatus.OK)
  async previewPdf(
    @Body(new ZodValidationPipe(invoiceDraftInputSchema)) payload: InvoiceDraftPayload,
    @Res() response: Response,
  ): Promise<void> {
    this.sendPdf(response, await this.pdf.renderPreview(payload));
  }

  @Get()
  list(
    @Query(new ZodValidationPipe(invoiceListQuerySchema)) query: InvoiceListQuery,
  ): Promise<InvoiceListResponse> {
    return this.invoices.list(query);
  }

  @Get(':id')
  findById(@Param('id', ParseIntPipe) id: number): Promise<InvoiceResponse> {
    return this.invoices.findById(id);
  }

  @Post()
  create(
    @Body(new ZodValidationPipe(createDraftSchema)) body: { customerId: number | null },
  ): Promise<InvoiceResponse> {
    return this.invoices.createDraft(body.customerId);
  }

  /**
   * Ersetzt den Entwurf vollständig; bei einer finalisierten Rechnung
   * antwortet der Service mit 409.
   */
  @Patch(':id')
  update(
    @Param('id', ParseIntPipe) id: number,
    @Body(new ZodValidationPipe(invoiceDraftInputSchema)) payload: InvoiceDraftPayload,
  ): Promise<InvoiceResponse> {
    return this.invoices.updateDraft(id, payload);
  }

  /**
   * Liefert das PDF der Rechnung.
   *
   * `inline` statt `attachment`: Der Browser zeigt es in seinem eigenen
   * Betrachter, und von dort ist Speichern ein Klick — umgekehrt ließe sich
   * ein Download nicht ansehen, ohne ihn erst abzulegen.
   *
   * Ab Schritt 9 kommt das PDF einer ausgestellten Rechnung aus der
   * gespeicherten Datei (Abschnitt 13); bis dahin entsteht es aus den
   * eingefrorenen Snapshots, was dasselbe Dokument ergibt.
   */
  @Get(':id/pdf')
  async pdfById(@Param('id', ParseIntPipe) id: number, @Res() response: Response): Promise<void> {
    this.sendPdf(response, await this.pdf.deliver(id));
  }

  /**
   * Was der E-Rechnung dieser Rechnung noch fehlt.
   *
   * Eigener Endpunkt und kein Feld an der Rechnung: Die Antwort hängt an
   * den Snapshots und interessiert nur die eine Maske, die den
   * Download-Knopf zeigt. Sie in jede Rechnungsantwort zu legen hieße, sie
   * auch dort zu berechnen, wo niemand sie liest.
   */
  @Get(':id/xml/status')
  async einvoiceStatus(
    @Param('id', ParseIntPipe) id: number,
  ): Promise<{ ready: boolean; problems: { field: string; message: string }[] }> {
    const problems = await this.einvoice.problems(id);
    return { ready: problems.length === 0, problems };
  }

  /**
   * Die E-Rechnung nach EN 16931 als XRechnung-XML (Abschnitt 24).
   *
   * `attachment` und nicht `inline`: Eine XML-Datei will niemand im
   * Browser ansehen — sie geht an den Empfänger oder in dessen System.
   */
  @Get(':id/xml')
  async einvoiceById(
    @Param('id', ParseIntPipe) id: number,
    @Res() response: Response,
  ): Promise<void> {
    const document = await this.einvoice.deliver(id);
    const asciiName = document.filename.replace(/[^\x20-\x7e]/gu, '_');

    response.setHeader('Content-Type', 'application/xml; charset=utf-8');
    response.setHeader('Content-Length', document.bytes.length);
    response.setHeader(
      'Content-Disposition',
      `attachment; filename="${asciiName}"; filename*=UTF-8''${encodeURIComponent(document.filename)}`,
    );
    response.setHeader('Cache-Control', 'no-store');
    response.setHeader('X-Content-Type-Options', 'nosniff');
    response.end(document.bytes);
  }

  /**
   * Stellt die Rechnung aus: Nummer, Snapshots, PDF (Abschnitte 8, 9, 13).
   *
   * Ein eigener Endpunkt statt `PATCH { status }` — der Zustandswechsel ist
   * eine fachliche Handlung mit Vorbedingungen, kein Feld.
   */
  @Post(':id/finalize')
  @HttpCode(HttpStatus.OK)
  async finalize(@Param('id', ParseIntPipe) id: number): Promise<InvoiceResponse> {
    await this.finalizer.finalize(id);
    return this.invoices.findById(id);
  }

  /** Nimmt die Finalisierung zurück — nur unter den Bedingungen aus D6. */
  @Post(':id/unfinalize')
  @HttpCode(HttpStatus.OK)
  async unfinalize(@Param('id', ParseIntPipe) id: number): Promise<InvoiceResponse> {
    await this.finalizer.unfinalize(id);
    return this.invoices.findById(id);
  }

  /**
   * Storniert die Rechnung und liefert das entstandene Storno-Dokument.
   *
   * Bewusst das Storno und nicht die Originalrechnung: Der nächste Blick
   * gilt dem neuen Beleg — die Originalrechnung ist unverändert und trägt
   * nur noch den Verweis.
   */
  @Post(':id/cancel')
  @HttpCode(HttpStatus.OK)
  async cancel(@Param('id', ParseIntPipe) id: number): Promise<InvoiceResponse> {
    return this.invoices.findById(await this.finalizer.cancel(id));
  }

  /** Legt einen neuen Entwurf mit denselben Inhalten an. */
  @Post(':id/duplicate')
  @HttpCode(HttpStatus.CREATED)
  duplicate(@Param('id', ParseIntPipe) id: number): Promise<InvoiceResponse> {
    return this.invoices.duplicate(id);
  }

  /** Zahldatum setzen oder entfernen; der Status folgt dem Feld (D7). */
  @Post(':id/payment')
  @HttpCode(HttpStatus.OK)
  setPayment(
    @Param('id', ParseIntPipe) id: number,
    @Body(new ZodValidationPipe(invoicePaymentInputSchema)) payload: InvoicePaymentPayload,
  ): Promise<InvoiceResponse> {
    return this.invoices.setPayment(id, payload);
  }

  /** Versandvermerk setzen oder entfernen; ohne Angabe gilt „jetzt". */
  @Post(':id/sent')
  @HttpCode(HttpStatus.OK)
  setSent(
    @Param('id', ParseIntPipe) id: number,
    @Body(new ZodValidationPipe(invoiceSentInputSchema)) payload: InvoiceSentPayload,
  ): Promise<InvoiceResponse> {
    return this.invoices.setSent(id, payload);
  }

  /** Erzeugt das gespeicherte PDF aus den Snapshots neu (Reparaturweg). */
  @Post(':id/regenerate-pdf')
  @HttpCode(HttpStatus.OK)
  async regeneratePdf(@Param('id', ParseIntPipe) id: number): Promise<InvoiceResponse> {
    await this.finalizer.regenerateDocument(id);
    return this.invoices.findById(id);
  }

  @Post(':id/refresh-customer')
  refreshCustomer(@Param('id', ParseIntPipe) id: number): Promise<InvoiceResponse> {
    return this.invoices.refreshCustomerData(id);
  }

  @Delete(':id')
  @HttpCode(HttpStatus.NO_CONTENT)
  delete(@Param('id', ParseIntPipe) id: number): Promise<void> {
    return this.invoices.deleteDraft(id);
  }

  /**
   * Schickt das erzeugte Dokument.
   *
   * `no-store`, weil ein Entwurfs-PDF bei der nächsten Änderung anders
   * aussieht: Ein zwischengespeichertes Blatt aus dem Browser-Cache wäre
   * genau das Missverständnis, das dieser Schritt vermeiden soll.
   *
   * Der Dateiname wandert zweimal in den Header: einmal als ASCII-Rückfall
   * und einmal RFC-5987-kodiert, damit Umlaute überall ankommen.
   */
  private sendPdf(response: Response, document: RenderedInvoicePdf): void {
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
