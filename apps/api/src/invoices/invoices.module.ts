import { Module } from '@nestjs/common';
import { CompanyModule } from '../company/company.module';
import { PdfModule } from '../pdf/pdf.module';
import { InvoicesController } from './invoices.controller';
import { InvoicesService } from './invoices.service';

@Module({
  imports: [CompanyModule, PdfModule],
  controllers: [InvoicesController],
  providers: [InvoicesService],
  exports: [InvoicesService],
})
export class InvoicesModule {}
