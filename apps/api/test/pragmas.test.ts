import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import type { PrismaClient } from '@prisma/client';
import { applyPragmas, createTestDatabase, type TestDatabase } from './database.helper.js';

let db: TestDatabase;
let prisma: PrismaClient;

beforeAll(async () => {
  db = await createTestDatabase();
  prisma = db.prisma;
});

afterAll(async () => {
  await db.cleanup();
});

/**
 * Regressionstest für einen Fehler, der beim ersten Start aufgetreten ist:
 * `PRAGMA journal_mode` und `PRAGMA busy_timeout` liefern eine Ergebniszeile
 * zurück, weshalb `$executeRaw` sie mit "Execute returned results" ablehnt.
 * Der Anwendungsstart scheiterte dadurch vollständig.
 */
describe('PRAGMA-Einstellungen', () => {
  it('lassen sich ohne Fehler setzen', async () => {
    await expect(applyPragmas(prisma)).resolves.not.toThrow();
  });

  it('schalten Fremdschlüsselprüfung und WAL tatsächlich ein', async () => {
    await applyPragmas(prisma);

    // Prisma liefert Zahlen aus Roh-Queries als BigInt, deshalb Number().
    const [foreignKeys] =
      await prisma.$queryRawUnsafe<{ foreign_keys: bigint }[]>('PRAGMA foreign_keys');
    expect(Number(foreignKeys?.foreign_keys)).toBe(1);

    const [journal] =
      await prisma.$queryRawUnsafe<{ journal_mode: string }[]>('PRAGMA journal_mode');
    expect(journal?.journal_mode).toBe('wal');
  });

  it('erzwingen die Fremdschlüsselprüfung im Betrieb', async () => {
    // Ohne aktives foreign_keys würde SQLite diese Zeile stillschweigend
    // annehmen und eine verwaiste Position anlegen.
    await applyPragmas(prisma);
    await expect(
      prisma.invoiceItem.create({
        data: { invoiceId: 999_999, position: 1, description: 'Verwaist' },
      }),
    ).rejects.toThrow();
  });
});
