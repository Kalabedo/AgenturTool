import { Injectable } from '@nestjs/common';
import type { Prisma } from '@prisma/client';
import {
  DEFAULT_NUMBER_PATTERN,
  NUMBER_PATTERN_SETTING_KEY,
  NUMBER_SEQUENCE_SCOPE,
  numberPatternSchema,
} from '@privatura/shared';
import { ApiError } from '../common/api-error';
import { PrismaService } from '../common/prisma.service';

/**
 * Die Nummernvergabe (Abschnitt 9).
 *
 * Eine Rechnungsnummer wird genau einmal vergeben, ist innerhalb ihres
 * Jahres lückenlos und darf unter keinen Umständen doppelt entstehen. Prisma
 * reicht auf SQLite kein `BEGIN IMMEDIATE` durch, deshalb sichert das
 * Ziehen sich dreifach ab:
 *
 * 1. **Bedingtes Update**: Der Zähler wird nur erhöht, wenn er noch auf dem
 *    Wert steht, den dieser Vorgang gelesen hat. Hat ihn jemand anders
 *    weitergezählt, trifft das Update null Zeilen und der Vorgang bricht ab,
 *    statt eine bereits vergebene Nummer zu benutzen.
 * 2. **Unique-Index auf `number`** als letzte Instanz in der Datenbank.
 * 3. **Wiederholung** im aufrufenden Finalisieren, weil der abgebrochene
 *    Vorgang beim zweiten Anlauf einfach die nächste Nummer zieht.
 *
 * Bei einem Einzelplatzwerkzeug ist echte Nebenläufigkeit die Ausnahme —
 * aber Doppelvergabe darf auch in der Ausnahme nicht passieren.
 */
@Injectable()
export class InvoiceNumbersService {
  constructor(private readonly prisma: PrismaService) {}

  /**
   * Das konfigurierte Nummernmuster.
   *
   * Liegt in `AppSetting` und nicht in den Template-Einstellungen: Es ist
   * keine Frage des Aussehens, sondern der Buchhaltung. Ein unbrauchbar
   * gewordenes Muster (von Hand in der Datenbank geändert) fällt auf den
   * Standard zurück, statt das Finalisieren unmöglich zu machen.
   */
  async pattern(): Promise<string> {
    const setting = await this.prisma.appSetting.findUnique({
      where: { key: NUMBER_PATTERN_SETTING_KEY },
    });
    if (setting === null) return DEFAULT_NUMBER_PATTERN;

    const parsed = numberPatternSchema.safeParse(setting.value);
    return parsed.success ? parsed.data : DEFAULT_NUMBER_PATTERN;
  }

  /** Nächster freier Zählerstand eines Jahres, ohne ihn zu ziehen. */
  async nextValueFor(year: number): Promise<number | null> {
    const sequence = await this.prisma.numberSequence.findUnique({
      where: { scope_year: { scope: NUMBER_SEQUENCE_SCOPE.INVOICE, year } },
    });
    return sequence?.nextValue ?? null;
  }

  /** Alle Zählerstände, für Listen — eine Abfrage statt einer je Rechnung. */
  async allNextValues(): Promise<Map<number, number>> {
    const sequences = await this.prisma.numberSequence.findMany({
      where: { scope: NUMBER_SEQUENCE_SCOPE.INVOICE },
    });
    return new Map(sequences.map((sequence) => [sequence.year, sequence.nextValue]));
  }

  /**
   * Zieht die nächste Nummer des Jahres. Nur innerhalb einer Transaktion
   * aufrufen — die gezogene Nummer gilt erst mit deren Commit.
   */
  async allocate(tx: Prisma.TransactionClient, year: number): Promise<number> {
    const scope = NUMBER_SEQUENCE_SCOPE.INVOICE;
    const existing = await tx.numberSequence.findUnique({ where: { scope_year: { scope, year } } });

    if (existing === null) {
      // Erste Rechnung des Jahres. Der Unique-Index auf (scope, year) macht
      // aus einem gleichzeitigen zweiten Anlauf einen Fehler statt eines
      // zweiten Zählers.
      await tx.numberSequence.create({ data: { scope, year, nextValue: 2 } });
      return 1;
    }

    const affected = await tx.$executeRaw`
      UPDATE "NumberSequence"
         SET "nextValue" = "nextValue" + 1
       WHERE "scope" = ${scope}
         AND "year" = ${year}
         AND "nextValue" = ${existing.nextValue}`;

    if (affected !== 1) {
      throw ApiError.numberSequenceConflict(
        `Die Rechnungsnummer für ${year} wurde zwischenzeitlich vergeben. Bitte erneut versuchen.`,
      );
    }

    return existing.nextValue;
  }

  /**
   * Gibt die zuletzt gezogene Nummer zurück an die Sequenz.
   *
   * Auch hier bedingt: Zurückgesetzt wird nur, wenn der Zähler noch genau
   * eins über der zurückgegebenen Nummer steht. Alles andere hieße, dass
   * inzwischen weitergezählt wurde — dann bliebe eine Lücke, und die
   * Rücknahme darf nicht stattfinden.
   */
  async release(tx: Prisma.TransactionClient, year: number, seq: number): Promise<void> {
    const affected = await tx.$executeRaw`
      UPDATE "NumberSequence"
         SET "nextValue" = "nextValue" - 1
       WHERE "scope" = ${NUMBER_SEQUENCE_SCOPE.INVOICE}
         AND "year" = ${year}
         AND "nextValue" = ${seq + 1}`;

    if (affected !== 1) {
      throw ApiError.unfinalizeNotAllowed(
        'Inzwischen wurde eine neuere Nummer vergeben; die Finalisierung lässt sich nicht mehr zurücknehmen.',
      );
    }
  }
}
