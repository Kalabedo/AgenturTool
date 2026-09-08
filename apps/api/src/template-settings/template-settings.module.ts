import { Module } from '@nestjs/common';
import { TemplateSettingsController } from './template-settings.controller';
import { TemplateSettingsService } from './template-settings.service';

@Module({
  controllers: [TemplateSettingsController],
  providers: [TemplateSettingsService],
  exports: [TemplateSettingsService],
})
export class TemplateSettingsModule {}
