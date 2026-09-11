import { Module } from '@nestjs/common';
import { PdfModule } from '../pdf/pdf.module';
import { EinvoiceService } from './einvoice.service';

@Module({
  imports: [PdfModule],
  providers: [EinvoiceService],
  exports: [EinvoiceService],
})
export class EinvoiceModule {}
