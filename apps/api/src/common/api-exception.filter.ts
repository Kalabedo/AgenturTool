import {
  Catch,
  HttpException,
  HttpStatus,
  Logger,
  type ArgumentsHost,
  type ExceptionFilter,
} from '@nestjs/common';
import type { Response } from 'express';
import { API_ERROR_CODE, ApiError, type ApiErrorBody } from './api-error';
import { isImmutabilityViolation } from './database-errors';

/**
 * Übersetzt jeden Fehler in ein einheitliches Antwortformat:
 * `{ error: { code, message, details? } }`.
 *
 * Ohne das bekäme das Frontend je nach Fehlerquelle drei verschiedene
 * Formen — Nest-Standard, Prisma-Fehler, unbehandelte Ausnahmen.
 */
@Catch()
export class ApiExceptionFilter implements ExceptionFilter {
  private readonly logger = new Logger(ApiExceptionFilter.name);

  catch(exception: unknown, host: ArgumentsHost): void {
    const response = host.switchToHttp().getResponse<Response>();

    if (exception instanceof ApiError) {
      response.status(exception.getStatus()).json(this.body(exception));
      return;
    }

    // Eine Sperrverletzung, die an der fachlichen Prüfung vorbeigekommen
    // ist. Sie darf nicht als 500 herauskommen, sonst sieht sie aus wie ein
    // Serverfehler statt wie eine korrekt gegriffene Schutzregel.
    if (isImmutabilityViolation(exception)) {
      const error = ApiError.invoiceNotEditable(
        'Diese Rechnung ist finalisiert und kann nicht mehr geändert werden.',
      );
      this.logger.warn('Immutability-Sperre hat gegriffen (Prüfung im Service fehlte)');
      response.status(error.getStatus()).json(this.body(error));
      return;
    }

    if (exception instanceof HttpException) {
      const status = exception.getStatus();
      const payload = exception.getResponse();
      response.status(status).json({
        error: {
          code:
            status === HttpStatus.NOT_FOUND
              ? API_ERROR_CODE.NOT_FOUND
              : API_ERROR_CODE.INTERNAL_ERROR,
          message:
            typeof payload === 'string'
              ? payload
              : ((payload as { message?: string }).message ?? exception.message),
        },
      } satisfies ApiErrorBody);
      return;
    }

    this.logger.error(
      'Unbehandelter Fehler',
      exception instanceof Error ? exception.stack : exception,
    );
    response.status(HttpStatus.INTERNAL_SERVER_ERROR).json({
      error: {
        code: API_ERROR_CODE.INTERNAL_ERROR,
        message: 'Unerwarteter Serverfehler.',
      },
    } satisfies ApiErrorBody);
  }

  private body(error: ApiError): ApiErrorBody {
    return {
      error: {
        code: error.code,
        message: error.message,
        ...(error.details === undefined ? {} : { details: error.details }),
      },
    };
  }
}
