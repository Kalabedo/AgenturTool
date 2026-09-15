import {
  Body,
  Controller,
  Delete,
  Get,
  HttpCode,
  HttpStatus,
  Param,
  ParseIntPipe,
  Patch,
  Post,
  Query,
} from '@nestjs/common';
import {
  taxProfileInputSchema,
  taxProfileListQuerySchema,
  type TaxProfileListQuery,
  type TaxProfilePayload,
  type TaxProfileResponse,
} from '@privatura/shared';
import { ZodValidationPipe } from '../common/zod-validation.pipe';
import { TaxProfilesService } from './tax-profiles.service';

@Controller('tax-profiles')
export class TaxProfilesController {
  constructor(private readonly taxProfiles: TaxProfilesService) {}

  @Get()
  list(
    @Query(new ZodValidationPipe(taxProfileListQuerySchema)) query: TaxProfileListQuery,
  ): Promise<TaxProfileResponse[]> {
    return this.taxProfiles.list(query);
  }

  @Get(':id')
  findById(@Param('id', ParseIntPipe) id: number): Promise<TaxProfileResponse> {
    return this.taxProfiles.findById(id);
  }

  @Post()
  create(
    @Body(new ZodValidationPipe(taxProfileInputSchema)) payload: TaxProfilePayload,
  ): Promise<TaxProfileResponse> {
    return this.taxProfiles.create(payload);
  }

  @Patch(':id')
  update(
    @Param('id', ParseIntPipe) id: number,
    @Body(new ZodValidationPipe(taxProfileInputSchema)) payload: TaxProfilePayload,
  ): Promise<TaxProfileResponse> {
    return this.taxProfiles.update(id, payload);
  }

  @Post(':id/archive')
  archive(@Param('id', ParseIntPipe) id: number): Promise<TaxProfileResponse> {
    return this.taxProfiles.archive(id);
  }

  @Post(':id/unarchive')
  unarchive(@Param('id', ParseIntPipe) id: number): Promise<TaxProfileResponse> {
    return this.taxProfiles.unarchive(id);
  }

  @Delete(':id')
  @HttpCode(HttpStatus.NO_CONTENT)
  deletePermanently(@Param('id', ParseIntPipe) id: number): Promise<void> {
    return this.taxProfiles.deletePermanently(id);
  }
}
