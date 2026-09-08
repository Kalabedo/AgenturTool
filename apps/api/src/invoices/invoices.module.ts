import { Module } from '@nestjs/common';
import { CompanyModule } from '../company/company.module';
import { PdfModule } from '../pdf/pdf.module';
import { TaxProfilesModule } from '../tax-profiles/tax-profiles.module';
import { TemplateSettingsModule } from '../template-settings/template-settings.module';
import { InvoicesController } from './invoices.controller';
import { InvoicesService } from './invoices.service';
import { InvoiceFinalizeService } from './invoice-finalize.service';
import { InvoiceNumbersService } from './invoice-numbers.service';

@Module({
  imports: [CompanyModule, PdfModule, TaxProfilesModule, TemplateSettingsModule],
  controllers: [InvoicesController],
  providers: [InvoicesService, InvoiceFinalizeService, InvoiceNumbersService],
  exports: [InvoicesService, InvoiceFinalizeService, InvoiceNumbersService],
})
export class InvoicesModule {}
