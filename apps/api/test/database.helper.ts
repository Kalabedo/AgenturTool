import { execFileSync } from 'node:child_process';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { PrismaClient } from '@prisma/client';

const apiRoot = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');

export interface TestDatabase {
  prisma: PrismaClient;
  /**
   * Die Verbindungszeichenkette der Testdatenbank.
   *
   * Nötig für den seltenen Fall, dass ein Test eine eigene Verbindung
   * braucht — siehe `withSingleConnection`.
   */
  url: string;
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

  // Prisma 6.19 legt die Datei bei `migrate deploy` je nach Plattform nicht
  // selbst an. Der Container tut beim ersten Start dasselbe; damit prüft die
  // Testsuite genau den produktiven Pfad.
  fs.closeSync(fs.openSync(file, 'wx'));

  execFileSync('pnpm', ['exec', 'prisma', 'migrate', 'deploy'], {
    cwd: apiRoot,
    env: { ...process.env, DATABASE_URL: url },
    stdio: 'pipe',
  });

  const prisma = new PrismaClient({ datasources: { db: { url } } });
  await applyPragmas(prisma);

  return {
    prisma,
    url,
    cleanup: async () => {
      await prisma.$disconnect();
      fs.rmSync(dir, { recursive: true, force: true });
    },
  };
}

/**
 * Führt etwas auf einer eigenen, einzelnen Verbindung aus.
 *
 * Der Grund ist ein Verbindungspool: Prisma hält für SQLite mehrere
 * Verbindungen offen und verteilt jede Anweisung auf irgendeine davon. Die
 * meisten PRAGMAs stören sich daran nicht — `foreign_keys`, `busy_timeout`
 * und `journal_mode` stehen auf jeder Verbindung gleich, weil Prisma sie
 * beim Öffnen selbst setzt beziehungsweise weil sie in der Datei stehen.
 *
 * Wer eines davon aber **abschaltet**, tut das nur für eine Verbindung —
 * und die nächste Anweisung landet womöglich auf einer anderen, auf der die
 * Prüfung noch greift. Genau das braucht der Test, der einen verwaisten
 * Fremdschlüssel herstellen will; ohne diese Klammer gelingt ihm das mal
 * und mal nicht, je nachdem, wie ausgelastet der Rechner gerade ist.
 *
 * `connection_limit=1` nimmt dem Pool diese Wahl. In einer Transaktion
 * ließe sich das nicht lösen: SQLite ignoriert `PRAGMA foreign_keys`
 * innerhalb einer Transaktion stillschweigend.
 */
export async function withSingleConnection(
  url: string,
  work: (prisma: PrismaClient) => Promise<void>,
): Promise<void> {
  const prisma = new PrismaClient({
    datasources: { db: { url: `${url}?connection_limit=1` } },
  });
  try {
    await work(prisma);
  } finally {
    await prisma.$disconnect();
  }
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

/**
 * Räumt alle Rechnungen samt Positionen ab.
 *
 * Nicht so trivial, wie es aussieht: Die Trigger blockieren das Löschen von
 * Positionen und Rechnungen, sobald diese ausgestellt sind. Der Aufräum-Code
 * muss deshalb denselben Weg gehen wie „Finalisierung zurücknehmen" — genau
 * die Form, die der Trigger als Ausnahme durchlässt.
 */
export async function resetInvoices(prisma: PrismaClient): Promise<void> {
  await prisma.$executeRawUnsafe(
    `UPDATE "Invoice"
        SET "status" = 'DRAFT',
            "number" = NULL,
            "numberYear" = NULL,
            "numberSeq" = NULL,
            "issuedAt" = NULL
      WHERE "status" <> 'DRAFT'`,
  );
  // Storno und Originalrechnung verweisen aufeinander, und der
  // Fremdschlüssel steht auf RESTRICT — ohne dieses Lösen der Verbindung
  // ließe sich keine der beiden Zeilen entfernen.
  await prisma.$executeRawUnsafe(
    `UPDATE "Invoice" SET "cancelsInvoiceId" = NULL, "cancelledAt" = NULL`,
  );
  await prisma.invoiceItem.deleteMany();
  await prisma.invoiceEvent.deleteMany();
  await prisma.invoiceDocument.deleteMany();
  await prisma.invoice.deleteMany();
}
