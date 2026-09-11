import { Module } from '@nestjs/common';
import { PdfModule } from '../pdf/pdf.module';
import { TaxAdvisorExportController } from './tax-advisor-export.controller';
import { TaxAdvisorExportService } from './tax-advisor-export.service';

@Module({
  imports: [PdfModule],
  controllers: [TaxAdvisorExportController],
  providers: [TaxAdvisorExportService],
  exports: [TaxAdvisorExportService],
})
export class TaxAdvisorExportModule {}
