import { Body, Controller, Get, Put } from '@nestjs/common';
import {
  updateTemplateSettingsSchema,
  type TemplateSettingsResponse,
  type UpdateTemplateSettingsPayload,
} from '@agentur-tool/shared';
import { ZodValidationPipe } from '../common/zod-validation.pipe';
import { TemplateSettingsService } from './template-settings.service';

@Controller('template-settings')
export class TemplateSettingsController {
  constructor(private readonly settings: TemplateSettingsService) {}

  @Get()
  get(): Promise<TemplateSettingsResponse> {
    return this.settings.get();
  }

  @Put()
  update(
    @Body(new ZodValidationPipe(updateTemplateSettingsSchema))
    payload: UpdateTemplateSettingsPayload,
  ): Promise<TemplateSettingsResponse> {
    return this.settings.update(payload);
  }
}
