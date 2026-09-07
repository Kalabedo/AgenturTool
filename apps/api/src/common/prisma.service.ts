import { Injectable, Logger, type OnModuleDestroy, type OnModuleInit } from '@nestjs/common';
import { PrismaClient } from '@prisma/client';

/** Verbindungseinstellungen, die bei jedem Start gesetzt werden müssen. */
export const REQUIRED_PRAGMAS = [
  // Ohne WAL blockieren sich Leser und Schreiber gegenseitig.
  'journal_mode = WAL',
  // SQLite prüft Fremdschlüssel nur, wenn das ausdrücklich eingeschaltet ist.
  'foreign_keys = ON',
  // Statt sofort mit SQLITE_BUSY abzubrechen, kurz auf den Schreiber warten.
  'busy_timeout = 5000',
] as const;

/**
 * Zentraler Datenbankzugang.
 */
@Injectable()
export class PrismaService extends PrismaClient implements OnModuleInit, OnModuleDestroy {
  private readonly logger = new Logger(PrismaService.name);

  async onModuleInit(): Promise<void> {
    await this.$connect();
    await this.applyPragmas();
    this.logger.log('Datenbank verbunden (WAL, foreign_keys aktiv)');
  }

  /**
   * Setzt die PRAGMAs.
   *
   * Bewusst über `$queryRawUnsafe`, nicht über `$executeRawUnsafe`: Manche
   * PRAGMAs (journal_mode, busy_timeout) liefern ihren neuen Wert als
   * Ergebniszeile zurück, und `$executeRaw` bricht bei Statements mit
   * Ergebnis mit "Execute returned results, which is not allowed in SQLite"
   * ab. `$queryRaw` verträgt beide Fälle.
   */
  async applyPragmas(): Promise<void> {
    for (const pragma of REQUIRED_PRAGMAS) {
      await this.$queryRawUnsafe(`PRAGMA ${pragma}`);
    }
  }

  async onModuleDestroy(): Promise<void> {
    await this.$disconnect();
  }
}
