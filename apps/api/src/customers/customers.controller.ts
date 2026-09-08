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
  customerInputSchema,
  customerListQuerySchema,
  type CustomerListQuery,
  type CustomerPayload,
  type CustomerResponse,
} from '@agentur-tool/shared';
import { ZodValidationPipe } from '../common/zod-validation.pipe';
import { CustomersService } from './customers.service';

@Controller('customers')
export class CustomersController {
  constructor(private readonly customers: CustomersService) {}

  @Get()
  list(
    @Query(new ZodValidationPipe(customerListQuerySchema)) query: CustomerListQuery,
  ): Promise<CustomerResponse[]> {
    return this.customers.list(query);
  }

  @Get(':id')
  findById(@Param('id', ParseIntPipe) id: number): Promise<CustomerResponse> {
    return this.customers.findById(id);
  }

  @Post()
  create(
    @Body(new ZodValidationPipe(customerInputSchema)) payload: CustomerPayload,
  ): Promise<CustomerResponse> {
    return this.customers.create(payload);
  }

  /**
   * Ersetzt den Kunden vollständig — das Schema verlangt alle Felder.
   *
   * Bewusst so: Würden fehlende Felder einfach übersprungen, könnte ein
   * Aufruf, der ein neu hinzugekommenes Feld noch nicht kennt, es
   * stillschweigend leeren. So schlägt stattdessen die Validierung an.
   */
  @Patch(':id')
  update(
    @Param('id', ParseIntPipe) id: number,
    @Body(new ZodValidationPipe(customerInputSchema)) payload: CustomerPayload,
  ): Promise<CustomerResponse> {
    return this.customers.update(id, payload);
  }

  /**
   * Archivieren ist der Regelfall. Eigener Endpunkt statt PATCH auf ein
   * Feld, damit der Zustandswechsel absichtlich geschieht und nicht als
   * Nebenwirkung einer Formularübertragung.
   */
  @Post(':id/archive')
  archive(@Param('id', ParseIntPipe) id: number): Promise<CustomerResponse> {
    return this.customers.archive(id);
  }

  @Post(':id/unarchive')
  unarchive(@Param('id', ParseIntPipe) id: number): Promise<CustomerResponse> {
    return this.customers.unarchive(id);
  }

  /** Endgültiges Löschen; scheitert, sobald Rechnungen auf den Kunden zeigen. */
  @Delete(':id')
  @HttpCode(HttpStatus.NO_CONTENT)
  deletePermanently(@Param('id', ParseIntPipe) id: number): Promise<void> {
    return this.customers.deletePermanently(id);
  }
}
