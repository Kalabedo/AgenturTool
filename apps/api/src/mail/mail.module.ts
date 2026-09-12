import { Module } from '@nestjs/common';
import { CompanyModule } from '../company/company.module';
import { CustomersModule } from '../customers/customers.module';
import { EinvoiceModule } from '../einvoice/einvoice.module';
import { InvoicesModule } from '../invoices/invoices.module';
import { PdfModule } from '../pdf/pdf.module';
import { TimeEntriesModule } from '../time-entries/time-entries.module';
import { MailController } from './mail.controller';
import { MailComposerService } from './mail-composer.service';
import { MailSenderService } from './mail-sender.service';
import { MailSettingsService } from './mail-settings.service';
import { MailTemplatesService } from './mail-templates.service';
import { MailService } from './mail.service';

/**
 * Der E-Mail-Versand (Abschnitt 27).
 *
 * Das Modul liegt am Ende der Abhängigkeitskette und wird von niemandem
 * gebraucht: Es liest Rechnungen, Kunden, Zeiten und Dokumente, aber nichts
 * davon weiß von ihm. Das ist Absicht — der Versand ist eine Handlung auf
 * dem Bestand, keine Eigenschaft davon. Eine Rechnung, die ihren eigenen
 * Versand kennte, hätte einen Grund, ins Netz zu greifen.
 */
@Module({
  imports: [
    CompanyModule,
    CustomersModule,
    EinvoiceModule,
    InvoicesModule,
    PdfModule,
    TimeEntriesModule,
  ],
  controllers: [MailController],
  providers: [
    MailService,
    MailSettingsService,
    MailTemplatesService,
    MailComposerService,
    MailSenderService,
  ],
  exports: [MailService, MailSettingsService, MailTemplatesService],
})
export class MailModule {}
