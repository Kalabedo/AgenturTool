import { Prisma } from '@prisma/client';

/**
 * Kennung, die die Immutability-Trigger per RAISE(ABORT, ...) werfen.
 * Siehe das handgeschriebene SQL in der Initial-Migration.
 */
export const IMMUTABILITY_ABORT_MARKER = 'INVOICE_IMMUTABLE';

/**
 * Erkennt, dass eine Schreiboperation an einer der Immutability-Sperren
 * gescheitert ist.
 *
 * Das ist leider nicht trivial: SQLite liefert für RAISE(ABORT, ...) den
 * Fehlercode SQLITE_CONSTRAINT_TRIGGER, und Prisma bildet den auf P2003
 * ab — denselben Code wie eine echte Fremdschlüsselverletzung, mit
 * `constraint: null` und ohne die Meldung aus dem Trigger. Nur bei
 * Roh-Queries (`$executeRaw`) kommt der Text durch.
 *
 * Deshalb werden beide Formen geprüft. Im Normalbetrieb greift ohnehin
 * zuerst die fachliche Prüfung im Service; wer hier landet, hat einen Fehler
 * im Code oder ist an der Service-Schicht vorbeigegangen.
 */
export function isImmutabilityViolation(error: unknown): boolean {
  if (error instanceof Prisma.PrismaClientKnownRequestError) {
    if (error.code === 'P2003') {
      const model = error.meta?.['modelName'];
      return model === 'Invoice' || model === 'InvoiceItem';
    }
  }

  if (error instanceof Error) {
    return error.message.includes(IMMUTABILITY_ABORT_MARKER);
  }

  return false;
}
