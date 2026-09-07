import {
  Body,
  Controller,
  Delete,
  Get,
  Post,
  Put,
  UploadedFile,
  UseInterceptors,
} from '@nestjs/common';
import { FileInterceptor } from '@nestjs/platform-express';
import {
  LOGO_MAX_BYTES,
  updateCompanySchema,
  type CompanyResponse,
  type UpdateCompanyPayload,
} from '@agentur-tool/shared';
import { ApiError } from '../common/api-error';
import { ZodValidationPipe } from '../common/zod-validation.pipe';
import { CompanyService } from './company.service';

@Controller('company')
export class CompanyController {
  constructor(private readonly company: CompanyService) {}

  @Get()
  get(): Promise<CompanyResponse> {
    return this.company.get();
  }

  @Put()
  update(
    @Body(new ZodValidationPipe(updateCompanySchema)) payload: UpdateCompanyPayload,
  ): Promise<CompanyResponse> {
    return this.company.update(payload);
  }

  @Post('logo')
  @UseInterceptors(
    FileInterceptor('file', {
      // Erste Verteidigungslinie: Multer bricht ab, bevor eine übergroße
      // Datei vollständig im Speicher landet. Die inhaltliche Prüfung
      // (Signatur, endgültige Größe) macht anschließend der FilesService.
      limits: { fileSize: LOGO_MAX_BYTES, files: 1 },
    }),
  )
  uploadLogo(@UploadedFile() file?: Express.Multer.File): Promise<CompanyResponse> {
    if (file === undefined) {
      throw ApiError.validation('Es wurde keine Datei übermittelt.');
    }
    return this.company.setLogo(file.buffer, file.originalname ?? null);
  }

  @Delete('logo')
  removeLogo(): Promise<CompanyResponse> {
    return this.company.removeLogo();
  }
}
