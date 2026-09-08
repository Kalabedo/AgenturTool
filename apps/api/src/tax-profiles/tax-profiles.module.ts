import { Module } from '@nestjs/common';
import { TaxProfilesController } from './tax-profiles.controller';
import { TaxProfilesService } from './tax-profiles.service';

@Module({
  controllers: [TaxProfilesController],
  providers: [TaxProfilesService],
  exports: [TaxProfilesService],
})
export class TaxProfilesModule {}
