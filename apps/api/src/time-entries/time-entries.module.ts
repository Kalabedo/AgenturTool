import { Module } from '@nestjs/common';
import { PdfModule } from '../pdf/pdf.module';
import { TimeEntriesController } from './time-entries.controller';
import { TimeEntriesService } from './time-entries.service';

/**
 * Die Zeiterfassung.
 *
 * Der Nachweis-Druck liegt im PdfModule, nicht hier — dort wohnt der
 * Browser, und ein zweiter wäre ein zweiter Chromium im Speicher.
 */
@Module({
  imports: [PdfModule],
  controllers: [TimeEntriesController],
  providers: [TimeEntriesService],
  exports: [TimeEntriesService],
})
export class TimeEntriesModule {}
