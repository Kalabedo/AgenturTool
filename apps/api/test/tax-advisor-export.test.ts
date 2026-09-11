import crypto from 'node:crypto';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { afterAll, beforeAll, beforeEach, describe, expect, it } from 'vitest';
import type { PrismaClient } from '@prisma/client';
import yauzl from 'yauzl';
import {
  CURRENT_SNAPSHOT_VERSION,
  DISCOUNT_TYPE,
  DOCUMENT_KIND,
  DOCUMENT_TYPE,
  TAX_PROFILE_KIND,
  type TaxAdvisorExportManifest,
} from '@agentur-tool/shared';
import { StorageConfig } from '../src/common/config.service';
import { InvoiceDocumentsService } from '../src/pdf/invoice-documents.service';
import { TaxAdvisorExportService } from '../src/tax-advisor/tax-advisor-export.service';
import {
  createDraft,
  createTestDatabase,
  markIssued,
  resetInvoices,
  type TestDatabase,
} from './database.helper';

let db: TestDatabase;
let prisma: PrismaClient;
let dataDir: string;
let service: TaxAdvisorExportService;

const BUYER = {
  snapshotVersion: CURRENT_SNAPSHOT_VERSION,
  companyName: '=Gefährliche Formel',
  contactName: null,
  addressLine: null,
  address: { street: 'Testweg 1', postalCode: '10115', city: 'Berlin', country: 'DE' },
  email: null,
  vatId: 'DE123456789',
  customerNumber: 'K-17',
  buyerReference: null,
  electronicAddress: null,
  electronicAddressScheme: null,
};

const SELLER = {
  snapshotVersion: CURRENT_SNAPSHOT_VERSION,
  companyName: 'Agentur',
  address: { street: 'Weg 1', postalCode: '73479', city: 'Ellwangen', country: 'DE' },
  email: 'hallo@example.de',
  website: null,
  phone: null,
  vatId: 'DE987654321',
  taxNumber: '50000/12345',
  bankAccountHolder: null,
  iban: null,
  bic: null,
  bankName: null,
  electronicAddress: null,
  electronicAddressScheme: null,
  logoAssetId: null,
};

const TAX = {
  snapshotVersion: CURRENT_SNAPSHOT_VERSION,
  profileName: 'Deutschland 19 %',
  kind: TAX_PROFILE_KIND.STANDARD,
  defaultRateBasisPoints: 1900,
  noteText: null,
  showTaxColumn: true,
  taxCategoryCode: 'S',
  exemptionReasonCode: null,
  exemptionReasonText: null,
};

const TOTALS = {
  snapshotVersion: CURRENT_SNAPSHOT_VERSION,
  netCents: 10_000,
  taxCents: 1_900,
  grossCents: 11_900,
  totalDiscountCents: 0,
  taxGroups: [{ rateBasisPoints: 1900, netCents: 10_000, taxCents: 1_900 }],
};

beforeAll(async () => {
  db = await createTestDatabase();
  prisma = db.prisma;
  dataDir = fs.mkdtempSync(path.join(os.tmpdir(), 'agentur-tool-tax-advisor-'));
  const storage = new StorageConfig({ get: () => dataDir } as never);
  const documents = new InvoiceDocumentsService(prisma, storage);
  service = new TaxAdvisorExportService(prisma, documents);
});

afterAll(async () => {
  await db.cleanup();
  fs.rmSync(dataDir, { recursive: true, force: true });
});

beforeEach(async () => {
  await resetInvoices(prisma);
  fs.rmSync(path.join(dataDir, 'invoices'), { recursive: true, force: true });
});

async function issuedInvoice(options: {
  date: string;
  number: string;
  seq: number;
  withDocuments?: boolean;
  cancellation?: boolean;
}): Promise<number> {
  const direction = options.cancellation === true ? -1 : 1;
  const totals = {
    ...TOTALS,
    netCents: TOTALS.netCents * direction,
    taxCents: TOTALS.taxCents * direction,
    grossCents: TOTALS.grossCents * direction,
    taxGroups: TOTALS.taxGroups.map((group) => ({
      ...group,
      netCents: group.netCents * direction,
      taxCents: group.taxCents * direction,
    })),
  };
  const id = await createDraft(prisma, {
    documentType:
      options.cancellation === true ? DOCUMENT_TYPE.CANCELLATION : DOCUMENT_TYPE.INVOICE,
    invoiceDate: options.date,
    serviceDate: options.date,
    dueDate: options.date,
    buyerData: JSON.stringify(BUYER),
    sellerSnapshot: JSON.stringify(SELLER),
    taxSnapshot: JSON.stringify(TAX),
    templateSnapshot: JSON.stringify({
      snapshotVersion: CURRENT_SNAPSHOT_VERSION,
      templateKey: 'classic',
      accentColor: '#000000',
      fontFamily: 'Open Sans',
      logoWidthMm: 40,
      footerText: null,
      paymentNote: null,
      closingNote: null,
    }),
    totalsSnapshot: JSON.stringify(totals),
    items: {
      create: {
        position: 1,
        description: '@SUMME(A1:A2)',
        quantity: 1250 * direction,
        unit: 'Std.',
        unitCode: 'HUR',
        unitPriceCents: 8000,
        discountType: DISCOUNT_TYPE.PERCENT,
        discountValue: 0,
        taxRateBasisPoints: 1900,
        lineDiscountCents: 0,
        lineNetCents: 10_000 * direction,
      },
    },
  });
  await markIssued(prisma, id, {
    number: options.number,
    year: Number(options.date.slice(0, 4)),
    seq: options.seq,
  });

  if (options.withDocuments === true) {
    for (const [kind, contents] of [
      [DOCUMENT_KIND.PDF, Buffer.from('%PDF unverändert')],
      [DOCUMENT_KIND.XML, Buffer.from('<invoice />')],
    ] as const) {
      const extension = kind === DOCUMENT_KIND.PDF ? 'pdf' : 'xml';
      const relative = `invoices/2026/${options.number}.${extension}`;
      const absolute = path.join(dataDir, relative);
      fs.mkdirSync(path.dirname(absolute), { recursive: true });
      fs.writeFileSync(absolute, contents);
      await prisma.invoiceDocument.create({
        data: {
          invoiceId: id,
          kind,
          path: relative,
          sha256: crypto.createHash('sha256').update(contents).digest('hex'),
          sizeBytes: contents.length,
        },
      });
    }
  }
  return id;
}

describe('Steuerberater-Paket', () => {
  it('exportiert nur ausgestellte Belege im Zeitraum samt Originaldateien', async () => {
    await issuedInvoice({ date: '2026-03-15', number: '2026-002', seq: 2, withDocuments: true });
    await issuedInvoice({ date: '2026-02-28', number: '2026-001', seq: 1 });
    await createDraft(prisma, { invoiceDate: '2026-03-20' });

    const summary = await service.preview({
      from: '2026-03-01' as never,
      to: '2026-03-31' as never,
      includeDocuments: true,
    });
    expect(summary.ready).toBe(true);
    expect(summary.counts).toEqual({ invoices: 1, cancellations: 0, pdfs: 1, xmls: 1 });

    const archive = await service.create(
      { from: '2026-03-01' as never, to: '2026-03-31' as never, includeDocuments: true },
      new Date('2026-04-01T08:00:00.000Z'),
    );
    const entries = await unzip(archive.bytes);

    expect(archive.filename).toBe('steuerberater-20260301-20260331.zip');
    expect([...entries.keys()].sort()).toEqual([
      'README.txt',
      'belege/2026-002.pdf',
      'belege/2026-002.xml',
      'manifest.json',
      'positionen.csv',
      'rechnungen.csv',
      'steueraufteilung.csv',
    ]);
    expect(entries.get('belege/2026-002.pdf')?.toString()).toBe('%PDF unverändert');

    const invoicesCsv = entries.get('rechnungen.csv')?.toString('utf8') ?? '';
    expect(invoicesCsv.startsWith('\ufeff')).toBe(true);
    expect(invoicesCsv).toContain('"2026-002"');
    expect(invoicesCsv).not.toContain('2026-001');
    expect(invoicesCsv).toContain('"100,00";"19,00";"119,00"');
    expect(invoicesCsv).toContain("'=Gefährliche Formel");

    const itemsCsv = entries.get('positionen.csv')?.toString('utf8') ?? '';
    expect(itemsCsv).toContain("'@SUMME(A1:A2)");
    expect(itemsCsv).toContain('"1,250"');

    const manifest = JSON.parse(
      entries.get('manifest.json')?.toString('utf8') ?? '{}',
    ) as TaxAdvisorExportManifest;
    expect(manifest.period).toEqual({ from: '2026-03-01', to: '2026-03-31' });
    expect(manifest.counts).toEqual({ invoices: 1, cancellations: 0, pdfs: 1, xmls: 1 });
    expect(manifest.files).toHaveLength(6);
    for (const file of manifest.files) {
      const contents = entries.get(file.path);
      expect(contents).toBeDefined();
      expect(crypto.createHash('sha256').update(contents!).digest('hex')).toBe(file.sha256);
    }
  });

  it('kann ein kleines Paket ohne Belegdateien erzeugen', async () => {
    await issuedInvoice({ date: '2026-03-15', number: '2026-001', seq: 1, withDocuments: true });
    const archive = await service.create({
      from: '2026-03-15' as never,
      to: '2026-03-15' as never,
      includeDocuments: false,
    });
    const entries = await unzip(archive.bytes);

    expect([...entries.keys()].some((name) => name.startsWith('belege/'))).toBe(false);
    expect(archive.manifest.counts.pdfs).toBe(0);
    expect(archive.manifest.counts.xmls).toBe(0);
  });

  it('führt Stornos als eigene Belege mit negativen Beträgen', async () => {
    await issuedInvoice({
      date: '2026-03-16',
      number: '2026-003',
      seq: 3,
      withDocuments: true,
      cancellation: true,
    });

    const archive = await service.create({
      from: '2026-03-01' as never,
      to: '2026-03-31' as never,
      includeDocuments: true,
    });
    const entries = await unzip(archive.bytes);
    const invoicesCsv = entries.get('rechnungen.csv')?.toString('utf8') ?? '';

    expect(archive.manifest.counts.cancellations).toBe(1);
    expect(invoicesCsv).toContain('"Storno"');
    expect(invoicesCsv).toContain('"-100,00";"-19,00";"-119,00"');
  });

  it('bricht bei einem veränderten Beleg ab', async () => {
    await issuedInvoice({ date: '2026-03-15', number: '2026-001', seq: 1, withDocuments: true });
    fs.writeFileSync(path.join(dataDir, 'invoices/2026/2026-001.pdf'), 'beschädigt');

    const summary = await service.preview({
      from: '2026-03-01' as never,
      to: '2026-03-31' as never,
      includeDocuments: true,
    });
    expect(summary.ready).toBe(false);
    expect(summary.problems).toEqual([
      expect.objectContaining({
        invoiceNumber: '2026-001',
        message: expect.stringMatching(/PDF/u),
      }),
    ]);

    await expect(
      service.create({
        from: '2026-03-01' as never,
        to: '2026-03-31' as never,
        includeDocuments: true,
      }),
    ).rejects.toThrow(/Prüfsumme/u);
  });
});

async function unzip(bytes: Buffer): Promise<Map<string, Buffer>> {
  const archive = await new Promise<yauzl.ZipFile>((resolve, reject) => {
    yauzl.fromBuffer(bytes, { lazyEntries: true }, (error, opened) => {
      if (error !== null || opened === undefined) reject(error ?? new Error('ZIP fehlt'));
      else resolve(opened);
    });
  });
  const entries = new Map<string, Buffer>();

  await new Promise<void>((resolve, reject) => {
    archive.on('entry', (entry: yauzl.Entry) => {
      archive.openReadStream(entry, (error, stream) => {
        if (error !== null || stream === undefined) {
          reject(error ?? new Error(entry.fileName));
          return;
        }
        const chunks: Buffer[] = [];
        stream.on('data', (chunk: Buffer) => chunks.push(chunk));
        stream.on('end', () => {
          entries.set(entry.fileName, Buffer.concat(chunks));
          archive.readEntry();
        });
        stream.on('error', reject);
      });
    });
    archive.on('end', resolve);
    archive.on('error', reject);
    archive.readEntry();
  });

  return entries;
}
