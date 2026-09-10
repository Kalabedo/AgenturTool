import crypto from 'node:crypto';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { afterAll, beforeAll, beforeEach, describe, expect, it } from 'vitest';
import { PrismaClient } from '@prisma/client';
import { BACKUP_FORMAT_VERSION, DISCOUNT_TYPE, backupFilename } from '@agentur-tool/shared';
import { StorageConfig } from '../src/common/config.service';
import { BackupService } from '../src/backup/backup.service';
import { resolveSqliteFile } from '../src/backup/database-file';
import { restoreBackup } from '../src/backup/restore';
import { createTestDatabase, resetInvoices, type TestDatabase } from './database.helper';

/**
 * Backup und Wiederherstellung (Abschnitt 17).
 *
 * Der Test aus Abschnitt 23, Punkt 9, automatisiert: Backup erzeugen, Daten
 * wegwerfen, wiederherstellen — alle Rechnungen und PDFs sind wieder da und
 * die Hashes stimmen. Ein ungetestetes Backup ist kein Backup.
 */

let db: TestDatabase;
let prisma: PrismaClient;
let backup: BackupService;
let storage: StorageConfig;
let dataDir: string;

beforeAll(async () => {
  db = await createTestDatabase();
  prisma = db.prisma;
  dataDir = fs.mkdtempSync(path.join(os.tmpdir(), 'agentur-tool-backup-'));
  storage = new StorageConfig({ get: () => dataDir } as never);
  storage.ensureDirectories();
  backup = new BackupService(prisma as never, storage);
});

afterAll(async () => {
  await db.cleanup();
  fs.rmSync(dataDir, { recursive: true, force: true });
});

beforeEach(async () => {
  await resetInvoices(prisma);
  await prisma.asset.deleteMany();
  await prisma.customer.deleteMany();
  fs.rmSync(path.join(dataDir, 'invoices'), { recursive: true, force: true });
  fs.rmSync(path.join(dataDir, 'assets'), { recursive: true, force: true });
  fs.rmSync(path.join(dataDir, 'backups'), { recursive: true, force: true });
  storage.ensureDirectories();
});

/** Eine ausgestellte Rechnung samt abgelegtem PDF und einem Logo. */
async function seedData(): Promise<{ pdfPath: string; assetPath: string; pdfHash: string }> {
  const customer = await prisma.customer.create({
    data: { companyName: 'Nordwind Logistik', street: 'Hafenstraße 12', city: 'Hamburg' },
  });

  const invoice = await prisma.invoice.create({
    data: {
      customerId: customer.id,
      invoiceDate: '2026-03-01',
      serviceDate: '2026-03-01',
      dueDate: '2026-03-15',
      buyerData: JSON.stringify({ companyName: 'Nordwind Logistik' }),
      items: {
        create: [
          {
            position: 1,
            description: 'Beratung',
            quantity: 1000,
            unitPriceCents: 10_000,
            discountType: DISCOUNT_TYPE.PERCENT,
            discountValue: 0,
            taxRateBasisPoints: 1900,
            lineNetCents: 10_000,
          },
        ],
      },
    },
  });

  const pdfRelative = 'invoices/2026/2026-001.pdf';
  const pdfPath = path.join(dataDir, pdfRelative);
  const pdfContent = Buffer.from('%PDF-1.4 Testdokument');
  fs.mkdirSync(path.dirname(pdfPath), { recursive: true });
  fs.writeFileSync(pdfPath, pdfContent);
  const pdfHash = crypto.createHash('sha256').update(pdfContent).digest('hex');

  await prisma.$executeRawUnsafe(
    `UPDATE "Invoice" SET "status" = 'ISSUED', "number" = '2026-001', "numberYear" = 2026,
        "numberSeq" = 1, "issuedAt" = ?, "snapshotVersion" = 1 WHERE "id" = ?`,
    new Date().toISOString(),
    invoice.id,
  );
  await prisma.invoiceDocument.create({
    data: {
      invoiceId: invoice.id,
      path: pdfRelative,
      sha256: pdfHash,
      sizeBytes: pdfContent.length,
    },
  });

  const assetRelative = 'assets/logo.png';
  const assetPath = path.join(dataDir, assetRelative);
  fs.writeFileSync(assetPath, Buffer.from('PNG-Testinhalt'));
  await prisma.asset.create({
    data: {
      path: assetRelative,
      mimeType: 'image/png',
      sizeBytes: 14,
      sha256: crypto.createHash('sha256').update('PNG-Testinhalt').digest('hex'),
    },
  });

  return { pdfPath, assetPath, pdfHash };
}

describe('Backup erstellen', () => {
  it('schreibt ein Archiv mit Manifest, Datenbank und Dateien', async () => {
    await seedData();

    const summary = await backup.createBackup(new Date('2026-03-02T09:15:00Z'));

    expect(summary.filename).toBe(backupFilename(new Date('2026-03-02T09:15:00Z')));
    expect(summary.filename).toBe('agentur-tool-backup-20260302-091500.zip');
    expect(summary.counts).toEqual({ invoices: 1, documents: 1, assets: 1, customers: 1 });
    expect(summary.sizeBytes).toBeGreaterThan(0);

    const archive = path.join(backup.directory, summary.filename);
    expect(fs.existsSync(archive)).toBe(true);
    expect(crypto.createHash('sha256').update(fs.readFileSync(archive)).digest('hex')).toBe(
      summary.sha256,
    );
  });

  it('lässt keine Kopie der Datenbank unter data/tmp zurück', async () => {
    await seedData();
    await backup.createBackup();

    // Eine liegengebliebene Kopie wäre eine zweite, veraltende Wahrheit im
    // Datenverzeichnis — und sie käme ins nächste Backup mit hinein.
    expect(fs.readdirSync(path.join(dataDir, 'tmp'))).toEqual([]);
  });

  it('überschreibt keine zweite Sicherung aus derselben Sekunde', async () => {
    await seedData();
    const now = new Date('2026-03-02T09:15:00Z');

    const first = await backup.createBackup(now);
    const second = await backup.createBackup(now);

    expect(first.filename).toBe('agentur-tool-backup-20260302-091500.zip');
    expect(second.filename).toBe('agentur-tool-backup-20260302-091500-1.zip');
    expect(fs.existsSync(path.join(backup.directory, first.filename))).toBe(true);
    expect(fs.existsSync(path.join(backup.directory, second.filename))).toBe(true);
  });

  it('listet die vorhandenen Archive, neueste zuerst', async () => {
    await seedData();
    await backup.createBackup(new Date('2026-03-01T08:00:00Z'));
    await backup.createBackup(new Date('2026-03-02T08:00:00Z'));

    const list = await backup.list();
    expect(list).toHaveLength(2);
    expect(list[0]?.filename).toContain('20260302');
  });

  it('weist einen Dateinamen mit Pfadanteilen ab', () => {
    // Der Name kommt aus einer URL.
    expect(() => backup.resolveArchive('../../etc/passwd')).toThrow();
    expect(() => backup.resolveArchive('nicht-vorhanden.zip')).toThrow();
  });
});

describe('Wiederherstellen', () => {
  it('bringt Datenbank, PDFs und Assets zurück — mit stimmenden Hashes', async () => {
    const seeded = await seedData();
    const summary = await backup.createBackup();
    const archive = path.join(backup.directory, summary.filename);

    // Der Ernstfall: Das Datenverzeichnis ist weg.
    const targetDir = fs.mkdtempSync(path.join(os.tmpdir(), 'agentur-tool-restored-'));
    fs.rmSync(targetDir, { recursive: true, force: true });
    const targetDb = path.join(path.dirname(targetDir), `${path.basename(targetDir)}.sqlite`);

    const result = await restoreBackup({
      archivePath: archive,
      dataDir: targetDir,
      databaseFile: targetDb,
    });

    expect(result.manifest.formatVersion).toBe(BACKUP_FORMAT_VERSION);
    expect(result.manifest.counts.invoices).toBe(1);
    expect(result.restoredFiles).toBe(2);

    // Die Dateien sind wieder da und byteweise identisch.
    const restoredPdf = path.join(targetDir, 'invoices/2026/2026-001.pdf');
    expect(fs.existsSync(restoredPdf)).toBe(true);
    expect(crypto.createHash('sha256').update(fs.readFileSync(restoredPdf)).digest('hex')).toBe(
      seeded.pdfHash,
    );
    expect(fs.readFileSync(path.join(targetDir, 'assets/logo.png'), 'utf8')).toBe('PNG-Testinhalt');

    // Und die Datenbank enthält, was sie enthalten soll.
    const restored = new PrismaClient({ datasources: { db: { url: `file:${targetDb}` } } });
    try {
      const invoice = await restored.invoice.findFirstOrThrow({ include: { documents: true } });
      expect(invoice.number).toBe('2026-001');
      expect(invoice.documents[0]?.sha256).toBe(seeded.pdfHash);
      expect(await restored.customer.count()).toBe(1);
    } finally {
      await restored.$disconnect();
    }

    fs.rmSync(targetDir, { recursive: true, force: true });
    fs.rmSync(targetDb, { force: true });
  }, 60_000);

  it('legt vorhandene Daten beiseite, statt sie zu löschen', async () => {
    await seedData();
    const summary = await backup.createBackup();

    const targetDir = fs.mkdtempSync(path.join(os.tmpdir(), 'agentur-tool-existing-'));
    fs.writeFileSync(path.join(targetDir, 'wichtig.txt'), 'nicht verlieren');
    const targetDb = path.join(targetDir, 'db.sqlite');

    // Ohne --force passiert nichts: Wer sich vertut, soll nicht die
    // vorhandenen Daten dabei verlieren.
    await expect(
      restoreBackup({
        archivePath: path.join(backup.directory, summary.filename),
        dataDir: targetDir,
        databaseFile: targetDb,
      }),
    ).rejects.toThrow(/--force/u);

    const result = await restoreBackup({
      archivePath: path.join(backup.directory, summary.filename),
      dataDir: targetDir,
      databaseFile: targetDb,
      force: true,
    });

    expect(result.movedExistingTo).not.toBeNull();
    expect(fs.readFileSync(path.join(result.movedExistingTo ?? '', 'wichtig.txt'), 'utf8')).toBe(
      'nicht verlieren',
    );

    fs.rmSync(targetDir, { recursive: true, force: true });
    fs.rmSync(result.movedExistingTo ?? '', { recursive: true, force: true });
  }, 60_000);

  it('bricht bei einem beschädigten Archiv ab, bevor es etwas anfasst', async () => {
    await seedData();
    const summary = await backup.createBackup();
    const archive = path.join(backup.directory, summary.filename);

    // Ein einzelnes verändertes Byte im komprimierten Datenstrom.
    const bytes = fs.readFileSync(archive);
    const position = Math.floor(bytes.length / 2);
    bytes[position] = (bytes[position] ?? 0) ^ 0xff;
    fs.writeFileSync(archive, bytes);

    const targetDir = fs.mkdtempSync(path.join(os.tmpdir(), 'agentur-tool-broken-'));
    fs.writeFileSync(path.join(targetDir, 'wichtig.txt'), 'nicht verlieren');

    await expect(
      restoreBackup({
        archivePath: archive,
        dataDir: targetDir,
        databaseFile: path.join(targetDir, 'db.sqlite'),
        force: true,
      }),
    ).rejects.toThrow();

    // Entscheidend: Die vorhandenen Daten sind noch da. Geprüft wird vor dem
    // Anfassen, nicht danach.
    expect(fs.readFileSync(path.join(targetDir, 'wichtig.txt'), 'utf8')).toBe('nicht verlieren');
    fs.rmSync(targetDir, { recursive: true, force: true });
  }, 60_000);
});

describe('resolveSqliteFile', () => {
  it('löst einen relativen Pfad gegen das Prisma-Verzeichnis auf', () => {
    // Genau so macht es Prisma — wer gegen das Arbeitsverzeichnis auflöst,
    // stellt die Datenbank an einer Stelle wieder her, an der sie niemand
    // sucht.
    expect(resolveSqliteFile('file:../../../data/db.sqlite', '/app/apps/api/prisma')).toBe(
      '/app/data/db.sqlite',
    );
  });

  it('nimmt einen absoluten Pfad, wie er ist', () => {
    expect(resolveSqliteFile('file:/var/data/db.sqlite', '/app/apps/api/prisma')).toBe(
      '/var/data/db.sqlite',
    );
  });

  it('weist eine Nicht-SQLite-URL ab', () => {
    expect(() => resolveSqliteFile('postgresql://localhost/db', '/app')).toThrow(/SQLite/u);
  });
});
