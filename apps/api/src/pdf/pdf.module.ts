import { Module } from '@nestjs/common';
import { CompanyModule } from '../company/company.module';
import { FilesModule } from '../files/files.module';
import { TaxProfilesModule } from '../tax-profiles/tax-profiles.module';
import { TemplateSettingsModule } from '../template-settings/template-settings.module';
import { ChromiumConfig } from './chromium';
import { InvoiceDocumentsService } from './invoice-documents.service';
import { InvoicePdfService } from './invoice-pdf.service';
import { PDF_RENDERER, PDF_RENDERER_HOST, type PdfRenderer } from './pdf-renderer';
import { PdfService } from './pdf.service';
import { TimeReportService } from './time-report.service';

/**
 * Die PDF-Erzeugung als eigenes Modul.
 *
 * Kein eigener Controller: Ein PDF ist immer das PDF von etwas: Die Routen
 * liegen deshalb bei den Rechnungen. Was hier liegt, ist der Browser und
 * das Zusammensetzen des Dokuments — beides wird ab Schritt 9 auch vom
 * Finalisieren gebraucht.
 */
@Module({
  imports: [CompanyModule, TemplateSettingsModule, TaxProfilesModule, FilesModule],
  providers: [
    ChromiumConfig,
    PdfService,
    {
      // Wer PDFs erzeugt, fragt nach dem Token, nicht nach der Klasse.
      // Bringt der Gastgeber einen Renderer mit — die Desktop-Anwendung
      // ihren über Electrons Chromium —, gilt der; sonst steuert Puppeteer
      // einen installierten Browser fern.
      provide: PDF_RENDERER,
      useFactory: (host: PdfRenderer | null, puppeteer: PdfService): PdfRenderer =>
        host ?? puppeteer,
      inject: [{ token: PDF_RENDERER_HOST, optional: true }, PdfService],
    },
    InvoicePdfService,
    InvoiceDocumentsService,
    TimeReportService,
  ],
  exports: [PDF_RENDERER, InvoicePdfService, InvoiceDocumentsService, TimeReportService],
})
export class PdfModule {}
