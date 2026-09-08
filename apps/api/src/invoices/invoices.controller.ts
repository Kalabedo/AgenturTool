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
import { z } from 'zod';
import {
  invoiceDraftInputSchema,
  invoiceListQuerySchema,
  type InvoiceDraftPayload,
  type InvoiceListQuery,
  type InvoiceResponse,
} from '@agentur-tool/shared';
import { ZodValidationPipe } from '../common/zod-validation.pipe';
import { InvoicesService } from './invoices.service';

/** Beim Anlegen genügt der Kunde; alles Weitere belegt der Server vor. */
const createDraftSchema = z.object({
  customerId: z
    .union([z.string().trim(), z.number(), z.null()])
    .optional()
    .transform((value) => {
      if (value === undefined || value === null || value === '') return null;
      const parsed = typeof value === 'number' ? value : Number(value);
      return Number.isInteger(parsed) && parsed > 0 ? parsed : null;
    }),
});

@Controller('invoices')
export class InvoicesController {
  constructor(private readonly invoices: InvoicesService) {}

  @Get()
  list(
    @Query(new ZodValidationPipe(invoiceListQuerySchema)) query: InvoiceListQuery,
  ): Promise<InvoiceResponse[]> {
    return this.invoices.list(query);
  }

  @Get(':id')
  findById(@Param('id', ParseIntPipe) id: number): Promise<InvoiceResponse> {
    return this.invoices.findById(id);
  }

  @Post()
  create(
    @Body(new ZodValidationPipe(createDraftSchema)) body: { customerId: number | null },
  ): Promise<InvoiceResponse> {
    return this.invoices.createDraft(body.customerId);
  }

  /**
   * Ersetzt den Entwurf vollständig; bei einer finalisierten Rechnung
   * antwortet der Service mit 409.
   */
  @Patch(':id')
  update(
    @Param('id', ParseIntPipe) id: number,
    @Body(new ZodValidationPipe(invoiceDraftInputSchema)) payload: InvoiceDraftPayload,
  ): Promise<InvoiceResponse> {
    return this.invoices.updateDraft(id, payload);
  }

  @Post(':id/refresh-customer')
  refreshCustomer(@Param('id', ParseIntPipe) id: number): Promise<InvoiceResponse> {
    return this.invoices.refreshCustomerData(id);
  }

  @Delete(':id')
  @HttpCode(HttpStatus.NO_CONTENT)
  delete(@Param('id', ParseIntPipe) id: number): Promise<void> {
    return this.invoices.deleteDraft(id);
  }
}
