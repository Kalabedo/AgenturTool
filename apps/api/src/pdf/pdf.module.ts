import { Module } from '@nestjs/common';
import { ApiError } from '../common/api-error';
import { CompanyModule } from '../company/company.module';
import { FilesModule } from '../files/files.module';
import { TaxProfilesModule } from '../tax-profiles/tax-profiles.module';
import { TemplateSettingsModule } from '../template-settings/template-settings.module';
import { InvoiceDocumentsService } from './invoice-documents.service';
import { InvoicePdfService } from './invoice-pdf.service';
import { PDF_RENDERER, PDF_RENDERER_HOST, type PdfRenderer } from './pdf-renderer';
import { TimeReportService } from './time-report.service';

/**
 * Der Renderer, wenn es keinen gibt.
 *
 * Gezeichnet wird von Electron, und Electron gibt es nur in der
 * Desktop-Anwendung. Läuft der Server ohne sie — auf der Kommandozeile, im
 * Entwicklungsbetrieb mit `pnpm dev`, in den Tests —, funktioniert alles
 * außer dem Druck.
 *
 * Ein Fehler beim Aufruf und nicht beim Start: Wer Stammdaten pflegt oder
 * an der Oberfläche arbeitet, soll die Anwendung starten können. Wer ein
 * PDF anfordert, bekommt einen Satz, der sagt, woran es liegt — die
 * Oberfläche zeigt ihn an, weil `PDF_RENDER_FAILED` dort schon behandelt
 * wird.
 */
class UnavailablePdfRenderer implements PdfRenderer {
  render(): Promise<Buffer> {
    return Promise.reject(
      ApiError.pdfRenderFailed(
        'PDFs entstehen in der Desktop-Anwendung. Dieser Server läuft ohne sie — ' +
          'starte AgenturTool als Anwendung, um Rechnungen zu drucken.',
      ),
    );
  }
}

/**
 * Die PDF-Erzeugung als eigenes Modul.
 *
 * Kein eigener Controller: Ein PDF ist immer das PDF von etwas: Die Routen
 * liegen deshalb bei den Rechnungen. Was hier liegt, ist das Zusammensetzen
 * des Dokuments — das braucht auch das Finalisieren.
 */
@Module({
  imports: [CompanyModule, TemplateSettingsModule, TaxProfilesModule, FilesModule],
  providers: [
    {
      // Wer PDFs erzeugt, fragt nach dem Token, nicht nach einer Klasse.
      // Dahinter steckt der Renderer, den der Gastgeber mitgebracht hat —
      // in der Desktop-Anwendung der über Electrons Chromium.
      provide: PDF_RENDERER,
      useFactory: (host: PdfRenderer | null): PdfRenderer => host ?? new UnavailablePdfRenderer(),
      inject: [{ token: PDF_RENDERER_HOST, optional: true }],
    },
    InvoicePdfService,
    InvoiceDocumentsService,
    TimeReportService,
  ],
  exports: [PDF_RENDERER, InvoicePdfService, InvoiceDocumentsService, TimeReportService],
})
export class PdfModule {}
