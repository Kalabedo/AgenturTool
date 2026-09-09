import { Module } from '@nestjs/common';
import { CompanyModule } from '../company/company.module';
import { FilesModule } from '../files/files.module';
import { TaxProfilesModule } from '../tax-profiles/tax-profiles.module';
import { TemplateSettingsModule } from '../template-settings/template-settings.module';
import { ChromiumConfig } from './chromium';
import { InvoiceDocumentsService } from './invoice-documents.service';
import { InvoicePdfService } from './invoice-pdf.service';
import { PdfService } from './pdf.service';

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
  providers: [ChromiumConfig, PdfService, InvoicePdfService, InvoiceDocumentsService],
  exports: [PdfService, InvoicePdfService, InvoiceDocumentsService],
})
export class PdfModule {}
