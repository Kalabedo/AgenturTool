import { Injectable, type ArgumentMetadata, type PipeTransform } from '@nestjs/common';
import { ZodError, type ZodTypeAny, type z } from 'zod';
import { ApiError } from './api-error';

/**
 * Validiert eingehende Daten gegen ein Zod-Schema aus `@privatura/shared`.
 *
 * Bewusst statt class-validator: Die Schemas im shared-Paket sind damit die
 * einzige Validierungsquelle für Frontend und Backend. Zwei parallele
 * Systeme — Zod im Formular, Decorators im Controller — laufen mit
 * Sicherheit irgendwann auseinander, und dann validiert das Formular etwas
 * anderes als der Server akzeptiert.
 */
@Injectable()
export class ZodValidationPipe<T extends ZodTypeAny> implements PipeTransform {
  constructor(private readonly schema: T) {}

  transform(value: unknown, _metadata: ArgumentMetadata): z.infer<T> {
    try {
      return this.schema.parse(value) as z.infer<T>;
    } catch (error) {
      if (error instanceof ZodError) {
        throw ApiError.validation(
          'Die übermittelten Daten sind ungültig.',
          // Feldbezogen, damit das Formular die Meldung an der richtigen
          // Stelle anzeigen kann statt als anonymen Sammelfehler.
          error.errors.map((issue) => ({
            field: issue.path.join('.'),
            message: issue.message,
          })),
        );
      }
      throw error;
    }
  }
}
