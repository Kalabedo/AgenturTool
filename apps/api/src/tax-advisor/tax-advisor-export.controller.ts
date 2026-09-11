import { Body, Controller, HttpCode, HttpStatus, Post, Res } from '@nestjs/common';
import type { Response } from 'express';
import {
  taxAdvisorExportInputSchema,
  type TaxAdvisorExportPayload,
  type TaxAdvisorExportSummary,
} from '@agentur-tool/shared';
import { ZodValidationPipe } from '../common/zod-validation.pipe';
import { TaxAdvisorExportService } from './tax-advisor-export.service';

@Controller('tax-advisor')
export class TaxAdvisorExportController {
  constructor(private readonly taxAdvisorExport: TaxAdvisorExportService) {}

  @Post('preview')
  @HttpCode(HttpStatus.OK)
  preview(
    @Body(new ZodValidationPipe(taxAdvisorExportInputSchema)) payload: TaxAdvisorExportPayload,
  ): Promise<TaxAdvisorExportSummary> {
    return this.taxAdvisorExport.preview(payload);
  }

  @Post('export')
  @HttpCode(HttpStatus.OK)
  async export(
    @Body(new ZodValidationPipe(taxAdvisorExportInputSchema)) payload: TaxAdvisorExportPayload,
    @Res() response: Response,
  ): Promise<void> {
    const archive = await this.taxAdvisorExport.create(payload);

    response.setHeader('Content-Type', 'application/zip');
    response.setHeader('Content-Length', archive.bytes.length);
    response.setHeader('Cache-Control', 'no-store');
    response.setHeader('X-Content-Type-Options', 'nosniff');
    response.setHeader(
      'Content-Disposition',
      `attachment; filename="${archive.filename}"; filename*=UTF-8''${encodeURIComponent(archive.filename)}`,
    );
    response.end(archive.bytes);
  }
}
