import { execFileSync } from 'node:child_process';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { PrismaClient } from '@prisma/client';

const apiRoot = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');

export interface TestDatabase {
  prisma: PrismaClient;
  cleanup: () => Promise<void>;
}

/**
 * Legt eine frische SQLite-Datei an und wendet alle Migrationen darauf an.
 *
 * Bewusst über `prisma migrate deploy` statt über ein abgekürztes
 * `db push`: Nur so laufen die handgeschriebenen CHECK-Constraints und
 * Trigger tatsächlich mit — und genau die sollen hier geprüft werden.
 */
export async function createTestDatabase(): Promise<TestDatabase> {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'agentur-tool-test-'));
  const file = path.join(dir, 'test.sqlite');
  const url = `file:${file}`;

  execFileSync('pnpm', ['exec', 'prisma', 'migrate', 'deploy'], {
    cwd: apiRoot,
    env: { ...process.env, DATABASE_URL: url },
    stdio: 'pipe',
  });

  const prisma = new PrismaClient({ datasources: { db: { url } } });
  await applyPragmas(prisma);

  return {
    prisma,
    cleanup: async () => {
      await prisma.$disconnect();
      fs.rmSync(dir, { recursive: true, force: true });
    },
  };
}

/** Legt einen minimalen Entwurf an und liefert dessen id. */
export async function createDraft(
  prisma: PrismaClient,
  overrides: Record<string, unknown> = {},
): Promise<number> {
  const invoice = await prisma.invoice.create({
    data: {
      invoiceDate: '2026-03-01',
      serviceDate: '2026-02-28',
      dueDate: '2026-03-15',
      ...overrides,
    },
  });
  return invoice.id;
}

/**
 * Versetzt einen Entwurf in den Zustand ISSUED — so, wie es der
 * Finalisieren-Service ab Schritt 9 tun wird. Geht bewusst über Roh-SQL,
 * damit der Zustand unabhängig von noch nicht existierendem Anwendungscode
 * herstellbar ist.
 */
export async function markIssued(
  prisma: PrismaClient,
  invoiceId: number,
  options: { number?: string; year?: number; seq?: number } = {},
): Promise<void> {
  const number = options.number ?? '2026-001';
  const year = options.year ?? 2026;
  const seq = options.seq ?? 1;

  await prisma.$executeRawUnsafe(
    `UPDATE "Invoice"
        SET "status" = 'ISSUED',
            "number" = ?,
            "numberYear" = ?,
            "numberSeq" = ?,
            "issuedAt" = ?,
            "snapshotVersion" = 1
      WHERE "id" = ?`,
    number,
    year,
    seq,
    new Date().toISOString(),
    invoiceId,
  );
}

/** Setzt dieselben PRAGMAs wie der PrismaService beim Start. */
export async function applyPragmas(prisma: PrismaClient): Promise<void> {
  for (const pragma of ['journal_mode = WAL', 'foreign_keys = ON', 'busy_timeout = 5000']) {
    await prisma.$queryRawUnsafe(`PRAGMA ${pragma}`);
  }
}
