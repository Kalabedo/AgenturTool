import { Module } from '@nestjs/common';
import { CompanyModule } from '../company/company.module';
import { EinvoiceModule } from '../einvoice/einvoice.module';
import { PdfModule } from '../pdf/pdf.module';
import { TaxProfilesModule } from '../tax-profiles/tax-profiles.module';
import { TemplateSettingsModule } from '../template-settings/template-settings.module';
import { InvoicesController } from './invoices.controller';
import { InvoicesService } from './invoices.service';
import { InvoiceFinalizeService } from './invoice-finalize.service';
import { InvoiceNumbersService } from './invoice-numbers.service';
import { InvoiceFromTimeService } from './invoice-from-time.service';

@Module({
  imports: [CompanyModule, EinvoiceModule, PdfModule, TaxProfilesModule, TemplateSettingsModule],
  controllers: [InvoicesController],
  providers: [
    InvoicesService,
    InvoiceFinalizeService,
    InvoiceNumbersService,
    InvoiceFromTimeService,
  ],
  exports: [InvoicesService, InvoiceFinalizeService, InvoiceNumbersService, InvoiceFromTimeService],
})
export class InvoicesModule {}
