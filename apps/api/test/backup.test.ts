import crypto from 'node:crypto';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { afterAll, beforeAll, beforeEach, describe, expect, it } from 'vitest';
import yauzl from 'yauzl';
import { PrismaClient } from '@prisma/client';
import {
  BACKUP_FORMAT_VERSION,
  DISCOUNT_TYPE,
  backupFilename,
  type BackupManifest,
} from '@privatura/shared';
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
  dataDir = fs.mkdtempSync(path.join(os.tmpdir(), 'privatura-backup-'));
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

/** Das Manifest aus einem Archiv, ohne es auszupacken. */
async function readManifest(archivePath: string): Promise<BackupManifest> {
  return new Promise<BackupManifest>((resolve, reject) => {
    yauzl.open(archivePath, { lazyEntries: true }, (error, zip) => {
      if (error !== null || zip === undefined) {
        reject(error ?? new Error(`${archivePath} lässt sich nicht öffnen.`));
        return;
      }

      zip.on('entry', (entry: yauzl.Entry) => {
        if (entry.fileName !== 'manifest.json') {
          zip.readEntry();
          return;
        }

        zip.openReadStream(entry, (streamError, stream) => {
          if (streamError !== null || stream === undefined) {
            reject(streamError ?? new Error('manifest.json lässt sich nicht lesen.'));
            return;
          }

          const chunks: Buffer[] = [];
          stream.on('data', (chunk: Buffer) => chunks.push(chunk));
          stream.on('error', reject);
          stream.on('end', () => {
            zip.close();
            resolve(JSON.parse(Buffer.concat(chunks).toString('utf8')) as BackupManifest);
          });
        });
      });

      zip.on('end', () => reject(new Error(`${archivePath} enthält kein manifest.json.`)));
      zip.on('error', reject);
      zip.readEntry();
    });
  });
}

describe('Backup erstellen', () => {
  it('schreibt ein Archiv mit Manifest, Datenbank und Dateien', async () => {
    await seedData();

    const summary = await backup.createBackup({
      now: new Date('2026-03-02T09:15:00Z'),
      reason: 'taeglich',
    });

    expect(summary.filename).toBe(backupFilename(new Date('2026-03-02T09:15:00Z'), 'taeglich'));
    expect(summary.filename).toBe('privatura-backup-20260302-091500-taeglich.zip');
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

    const first = await backup.createBackup({ now });
    const second = await backup.createBackup({ now });

    expect(first.filename).toBe('privatura-backup-20260302-091500-manuell.zip');
    expect(second.filename).toBe('privatura-backup-20260302-091500-manuell-1.zip');
    expect(fs.existsSync(path.join(backup.directory, first.filename))).toBe(true);
    expect(fs.existsSync(path.join(backup.directory, second.filename))).toBe(true);
  });

  it('listet die vorhandenen Archive, neueste zuerst', async () => {
    await seedData();
    await backup.createBackup({ now: new Date('2026-03-01T08:00:00Z') });
    await backup.createBackup({ now: new Date('2026-03-02T08:00:00Z') });

    const list = await backup.list();
    expect(list).toHaveLength(2);
    expect(list[0]?.filename).toContain('20260302');
  });

  it('schreibt den Anlass in Namen, Manifest und Übersicht', async () => {
    await seedData();

    const summary = await backup.createBackup({
      now: new Date('2026-03-02T09:15:00Z'),
      reason: 'migration',
    });

    expect(summary.reason).toBe('migration');
    expect(summary.filename).toContain('-migration');

    const manifest = await readManifest(path.join(backup.directory, summary.filename));
    expect(manifest.reason).toBe('migration');
    // Die Übersicht liest den Anlass aus dem Namen: Sie darf kein Archiv
    // öffnen müssen, um eine Liste zu zeigen.
    expect((await backup.list())[0]?.reason).toBe('migration');
  });

  it('liest ein Archiv aus einer älteren Fassung ohne Anlass', async () => {
    await seedData();
    const summary = await backup.createBackup({ now: new Date('2026-03-02T09:15:00Z') });

    // So hieß ein Archiv, bevor der Anlass im Namen stand.
    const alt = 'privatura-backup-20260301-080000.zip';
    fs.renameSync(path.join(backup.directory, summary.filename), path.join(backup.directory, alt));

    const list = await backup.list();
    expect(list).toHaveLength(1);
    expect(list[0]?.filename).toBe(alt);
    expect(list[0]?.reason).toBeNull();
    expect(list[0]?.createdAt).toBe('2026-03-01T08:00:00.000Z');
  });

  it('nimmt den Zeitpunkt aus dem Namen, nicht aus der Änderungszeit', async () => {
    await seedData();
    const summary = await backup.createBackup({ now: new Date('2026-03-02T09:15:00Z') });

    // Ein Sync in die Cloud oder ein zurückkopierter Ordner setzt die
    // Änderungszeit auf „jetzt". Der Zeitpunkt der Sicherung ändert sich
    // dadurch nicht.
    const archive = path.join(backup.directory, summary.filename);
    const spaeter = new Date('2027-01-01T00:00:00Z');
    fs.utimesSync(archive, spaeter, spaeter);

    expect((await backup.list())[0]?.createdAt).toBe('2026-03-02T09:15:00.000Z');
  });

  it('dünnt zu alte Archive aus und sagt, welche', async () => {
    await seedData();

    // Vier Archive aus vier aufeinanderfolgenden Tagen vor drei Jahren:
    // Nach der Regel bleiben die jüngsten drei.
    fs.mkdirSync(backup.directory, { recursive: true });
    const alte = [
      '2023-01-01T02:00:00Z',
      '2023-01-02T02:00:00Z',
      '2023-01-03T02:00:00Z',
      '2023-01-04T02:00:00Z',
    ].map((iso) => backupFilename(new Date(iso), 'taeglich'));

    for (const name of alte) {
      fs.writeFileSync(path.join(backup.directory, name), 'kein echtes Archiv');
    }

    const summary = await backup.createBackup({ now: new Date('2026-03-02T09:15:00Z') });

    // Die neue Sicherung zählt als jüngste mit; von den vier alten bleiben
    // damit nur noch zwei übrig.
    expect(summary.removed).toEqual(expect.arrayContaining([alte[0], alte[1]]));
    expect(summary.removed).not.toContain(summary.filename);
    for (const entfernt of summary.removed) {
      expect(fs.existsSync(path.join(backup.directory, entfernt))).toBe(false);
    }
  });

  it('entfernt beim Ausdünnen nie die eben erzeugte Sicherung', async () => {
    await seedData();

    // Die Sicherung vor einem Update ist die wertvollste überhaupt — und
    // sie entsteht in einem Ordner, der voller alter Archive sein kann.
    fs.mkdirSync(backup.directory, { recursive: true });
    for (let tag = 1; tag <= 20; tag += 1) {
      const name = backupFilename(
        new Date(`2023-01-${String(tag).padStart(2, '0')}T02:00:00Z`),
        'taeglich',
      );
      fs.writeFileSync(path.join(backup.directory, name), 'kein echtes Archiv');
    }

    const summary = await backup.createBackup({
      now: new Date('2026-03-02T09:15:00Z'),
      reason: 'update',
    });

    expect(fs.existsSync(path.join(backup.directory, summary.filename))).toBe(true);
    expect(summary.removed).not.toContain(summary.filename);
  });

  it('rührt ein fremdes Archiv im Ordner nicht an', async () => {
    await seedData();

    fs.mkdirSync(backup.directory, { recursive: true });
    const fremd = path.join(backup.directory, 'urlaubsfotos.zip');
    fs.writeFileSync(fremd, 'gehört jemand anderem');
    for (let tag = 1; tag <= 20; tag += 1) {
      const name = backupFilename(
        new Date(`2023-01-${String(tag).padStart(2, '0')}T02:00:00Z`),
        'taeglich',
      );
      fs.writeFileSync(path.join(backup.directory, name), 'kein echtes Archiv');
    }

    const summary = await backup.createBackup({ now: new Date('2026-03-02T09:15:00Z') });

    expect(summary.removed.length).toBeGreaterThan(0);
    expect(fs.existsSync(fremd)).toBe(true);
  });

  it('verwirft ein Archiv, dessen Dateien nicht zum Manifest passen', async () => {
    await seedData();

    // Zwischen dem Hashen und dem Packen läuft die Anwendung weiter. Ändert
    // sich dort eine Datei, passte das Archiv nicht mehr zu seinen eigenen
    // Prüfsummen — und das fiele erst beim Wiederherstellen auf, also genau
    // dann, wenn man es braucht. Von Hand ist dieser Moment ein Wettlauf;
    // hier wird er hergestellt.
    const gelogen = new (class extends BackupService {
      protected override async collectFiles() {
        const entries = await super.collectFiles();
        return entries.map((entry) => ({ ...entry, sha256: 'a'.repeat(64) }));
      }
    })(prisma as never, storage);

    await expect(gelogen.createBackup()).rejects.toThrow(/während der Sicherung geändert/u);

    // Kein halbes Archiv im Ordner, keine Reste im Arbeitsverzeichnis.
    expect(fs.existsSync(backup.directory) ? fs.readdirSync(backup.directory) : []).toEqual([]);
    expect(fs.readdirSync(path.join(dataDir, 'tmp'))).toEqual([]);
  });

  it('bricht ab, wenn eine Datei mitten im Packen verschwindet', async () => {
    const { assetPath } = await seedData();

    // Dasselbe in Grün, nur dass die Datei ganz weg ist: yazl meldet den
    // Fehler auf dem ZipFile, nicht auf seinem Ausgabestrom. Ohne Zuhörer
    // dort wäre das kein abgebrochenes Backup, sondern ein beendeter Prozess.
    const verschwindend = new (class extends BackupService {
      protected override async collectFiles() {
        const entries = await super.collectFiles();
        fs.rmSync(assetPath, { force: true });
        return entries;
      }
    })(prisma as never, storage);

    await expect(verschwindend.createBackup()).rejects.toThrow();
    expect(fs.readdirSync(path.join(dataDir, 'tmp'))).toEqual([]);
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
    const targetDir = fs.mkdtempSync(path.join(os.tmpdir(), 'privatura-restored-'));
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

    const targetDir = fs.mkdtempSync(path.join(os.tmpdir(), 'privatura-existing-'));
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

    const targetDir = fs.mkdtempSync(path.join(os.tmpdir(), 'privatura-broken-'));
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
