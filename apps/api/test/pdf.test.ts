import { afterAll, beforeAll, beforeEach, describe, expect, it } from 'vitest';
import type { PrismaClient } from '@prisma/client';
import {
  CURRENT_SNAPSHOT_VERSION,
  DISCOUNT_TYPE,
  TAX_PROFILE_KIND,
  type SellerSnapshot,
  type TaxSnapshot,
  type TemplateSnapshot,
  type TotalsSnapshot,
} from '@agentur-tool/shared';
import { StorageConfig } from '../src/common/config.service';
import { CompanyService } from '../src/company/company.service';
import { FilesService } from '../src/files/files.service';
import { TaxProfilesService } from '../src/tax-profiles/tax-profiles.service';
import { TemplateSettingsService } from '../src/template-settings/template-settings.service';
import { ChromiumConfig, findChromiumExecutable } from '../src/pdf/chromium';
import { InvoicePdfService } from '../src/pdf/invoice-pdf.service';
import { PdfService } from '../src/pdf/pdf.service';
import {
  createTestDatabase,
  markIssued,
  resetInvoices,
  type TestDatabase,
} from './database.helper';
import { PNG_1PX } from './fixtures/images';
import { MM, embedsFont, isPdf, pdfContentAreas, pdfPageCount, pdfPageSizes } from './pdf.helper';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';

let db: TestDatabase;
let prisma: PrismaClient;
let files: FilesService;
let pdfService: PdfService;
let documents: InvoicePdfService;
let dataDir: string;

/**
 * Ohne Chromium laufen die Rendertests nicht — der Rest schon.
 *
 * Übersprungen statt rot: Der Browser ist eine Voraussetzung der Umgebung,
 * keine Aussage über den Code. Wer sie prüfen will, setzt
 * PUPPETEER_EXECUTABLE_PATH oder installiert Chromium an einem der üblichen
 * Orte.
 */
const chromium = findChromiumExecutable(process.env.PUPPETEER_EXECUTABLE_PATH);

beforeAll(async () => {
  db = await createTestDatabase();
  prisma = db.prisma;
  dataDir = fs.mkdtempSync(path.join(os.tmpdir(), 'agentur-tool-pdf-'));

  const storage = new StorageConfig({ get: () => dataDir } as never);
  files = new FilesService(prisma, storage);

  // Die Konfiguration kommt aus der Umgebung, damit derselbe Test im
  // Container mit --no-sandbox und lokal mit Sandbox läuft.
  pdfService = new PdfService(
    new ChromiumConfig({ get: (key: string) => process.env[key] } as never),
  );

  documents = new InvoicePdfService(
    prisma,
    new CompanyService(prisma, files),
    new TemplateSettingsService(prisma),
    new TaxProfilesService(prisma),
    files,
    pdfService,
  );
});

afterAll(async () => {
  await pdfService.onModuleDestroy();
  await db.cleanup();
  fs.rmSync(dataDir, { recursive: true, force: true });
});

beforeEach(async () => {
  await resetInvoices(prisma);
  await prisma.company.deleteMany();
  await prisma.templateSettings.deleteMany();
  await prisma.taxProfile.deleteMany();
  await prisma.asset.deleteMany();

  await prisma.company.create({
    data: {
      id: 1,
      companyName: 'XYZ - Agentur',
      street: 'Wolfgangsklinge 14',
      postalCode: '73479',
      city: 'Ellwangen',
      country: 'DE',
      iban: 'DE12202208000052019114',
    },
  });
});

/** Eine Rechnung mit `count` gleichen Positionen. */
async function createInvoice(count: number, overrides: Record<string, unknown> = {}) {
  return prisma.invoice.create({
    data: {
      invoiceDate: '2026-03-01',
      serviceDate: '2026-02-28',
      dueDate: '2026-03-15',
      buyerData: JSON.stringify({
        snapshotVersion: CURRENT_SNAPSHOT_VERSION,
        companyName: 'SoluXion Ltd',
        contactName: null,
        addressLine: null,
        address: { street: 'Hauptstr. 1', postalCode: '7560', city: 'Larnaca', country: 'Zypern' },
        email: null,
        vatId: null,
        customerNumber: null,
      }),
      items: {
        create: Array.from({ length: count }, (_, index) => ({
          position: index + 1,
          description: `Position ${index + 1} — Leistung mit einer Beschreibung über eine Zeile`,
          quantity: 1000,
          unit: 'Std.',
          unitPriceCents: 12_000,
          discountType: DISCOUNT_TYPE.PERCENT,
          discountValue: 0,
          taxRateBasisPoints: 1900,
          lineNetCents: 12_000,
        })),
      },
      ...overrides,
    },
  });
}

const FROZEN_SELLER: SellerSnapshot = {
  snapshotVersion: CURRENT_SNAPSHOT_VERSION,
  companyName: 'Alter Firmenname GmbH',
  address: { street: 'Alte Straße 1', postalCode: '10115', city: 'Berlin', country: 'DE' },
  email: null,
  website: null,
  phone: null,
  vatId: null,
  taxNumber: null,
  bankAccountHolder: null,
  iban: null,
  bic: null,
  bankName: null,
  logoAssetId: null,
};

const FROZEN_TAX: TaxSnapshot = {
  snapshotVersion: CURRENT_SNAPSHOT_VERSION,
  profileName: 'Deutschland 19 %',
  kind: TAX_PROFILE_KIND.STANDARD,
  defaultRateBasisPoints: 1900,
  noteText: null,
  showTaxColumn: true,
};

const FROZEN_TEMPLATE: TemplateSnapshot = {
  snapshotVersion: CURRENT_SNAPSHOT_VERSION,
  templateKey: 'classic',
  accentColor: '#1e293b',
  fontFamily: 'Open Sans',
  logoWidthMm: 40,
  footerText: null,
  paymentNote: null,
  closingNote: null,
};

/** Absichtlich andere Beträge, als die Positionen ergeben würden. */
const FROZEN_TOTALS: TotalsSnapshot = {
  snapshotVersion: CURRENT_SNAPSHOT_VERSION,
  netCents: 111_100,
  totalDiscountCents: 0,
  taxGroups: [{ rateBasisPoints: 1900, netCents: 111_100, taxCents: 21_109 }],
  taxCents: 21_109,
  grossCents: 132_209,
};

async function freeze(invoiceId: number): Promise<void> {
  await prisma.invoice.update({
    where: { id: invoiceId },
    data: {
      sellerSnapshot: JSON.stringify(FROZEN_SELLER),
      taxSnapshot: JSON.stringify(FROZEN_TAX),
      templateSnapshot: JSON.stringify(FROZEN_TEMPLATE),
      totalsSnapshot: JSON.stringify(FROZEN_TOTALS),
    },
  });
  await markIssued(prisma, invoiceId);
}

describe('Dokumentaufbau', () => {
  it('zeigt im Entwurf die heutigen Firmendaten', async () => {
    const invoice = await createInvoice(2);

    expect(await documents.buildHtml(invoice.id)).toContain('XYZ - Agentur');

    await prisma.company.update({ where: { id: 1 }, data: { companyName: 'Neuer Name GmbH' } });

    expect(await documents.buildHtml(invoice.id)).toContain('Neuer Name GmbH');
  });

  it('zeigt bei einer ausgestellten Rechnung die eingefrorenen Stammdaten', async () => {
    // Der wichtigste Test dieses Schritts: Nach dem Ausstellen darf keine
    // Änderung an den Stammdaten mehr in das Dokument durchschlagen (D8).
    const invoice = await createInvoice(2);
    await freeze(invoice.id);

    await prisma.company.update({
      where: { id: 1 },
      data: { companyName: 'Ganz neuer Name GmbH' },
    });

    const html = await documents.buildHtml(invoice.id);
    expect(html).toContain('Alter Firmenname GmbH');
    expect(html).not.toContain('Ganz neuer Name GmbH');
  });

  it('druckt bei einer ausgestellten Rechnung die eingefrorenen Summen', async () => {
    // Die Positionen ergäben 240,00 € — gedruckt wird, was im Snapshot
    // steht. Änderte sich der Rechenweg je, druckte diese Rechnung sonst
    // andere Beträge als das Exemplar beim Kunden.
    const invoice = await createInvoice(2);
    await freeze(invoice.id);

    const html = await documents.buildHtml(invoice.id);
    expect(html).toContain('1.322,09');
    expect(html).not.toContain('240,00');
  });

  it('bettet das Logo als Data-URI ein statt als Adresse', async () => {
    // Chromium bekommt das Dokument ohne Basis-URL: „/api/assets/1" wäre
    // dort ein Bild, das lautlos fehlt.
    const asset = await files.storeImage(PNG_1PX, 'logo.png');
    await prisma.company.update({ where: { id: 1 }, data: { logoAssetId: asset.id } });

    const invoice = await createInvoice(1);
    const html = await documents.buildHtml(invoice.id);

    expect(html).toContain('src="data:image/png;base64,');
    expect(html).not.toContain('/api/assets/');
  });

  it('druckt ohne Logo weiter, wenn die Datei fehlt', async () => {
    const asset = await files.storeImage(PNG_1PX, 'logo.png');
    await prisma.company.update({ where: { id: 1 }, data: { logoAssetId: asset.id } });
    fs.rmSync(path.join(dataDir, asset.path));

    const invoice = await createInvoice(1);

    // Eine Rechnung ohne Logo ist unschön; eine, die sich nicht drucken
    // lässt, ist ein Ausfall.
    await expect(documents.buildHtml(invoice.id)).resolves.toContain('XYZ - Agentur');
  });

  it('bricht bei einem beschädigten Snapshot ab', async () => {
    const invoice = await createInvoice(1);
    await prisma.invoice.update({
      where: { id: invoice.id },
      data: { sellerSnapshot: '{"companyName":42}' },
    });

    await expect(documents.buildHtml(invoice.id)).rejects.toThrow(/beschädigt/u);
  });
});

describe.skipIf(chromium === null)('PDF-Erzeugung', () => {
  it('liefert ein einseitiges A4-Dokument', async () => {
    const invoice = await createInvoice(3);
    const { bytes, filename } = await documents.renderInvoice(invoice.id);

    expect(isPdf(bytes)).toBe(true);
    expect(filename).toBe(`Rechnung-Entwurf-${invoice.id}.pdf`);
    expect(pdfPageCount(bytes)).toBe(1);

    const [size] = pdfPageSizes(bytes);
    expect(size?.widthPt).toBeCloseTo(210 * MM, 0);
    expect(size?.heightPt).toBeCloseTo(297 * MM, 0);
  }, 60_000);

  it('bricht eine lange Rechnung mit gleichen Rändern um', async () => {
    // Der Beleg für D31: Die Ränder kommen aus @page und gelten deshalb auf
    // jeder Seite. Mit Padding auf der Seite stimmte nur die erste.
    const invoice = await createInvoice(34);
    const { bytes } = await documents.renderInvoice(invoice.id);

    expect(pdfPageCount(bytes)).toBe(2);

    const areas = pdfContentAreas(bytes);
    expect(areas).toHaveLength(2);
    for (const area of areas) {
      expect(area.leftPt).toBeCloseTo(12 * MM, 0);
      expect(area.widthPt).toBeCloseTo((210 - 2 * 12) * MM, 0);
      // Oben 12 mm, unten 16 mm für die Fußzeile mit der Seitenzahl.
      expect(area.heightPt).toBeCloseTo((297 - 12 - 16) * MM, 0);
    }
  }, 60_000);

  it('bettet die mitgelieferte Schrift ein', async () => {
    // D29: Ohne eingebettete Schrift bräche der Satz auf einer Maschine
    // ohne Open Sans anders um als in der Vorschau.
    const invoice = await createInvoice(2);
    const { bytes } = await documents.renderInvoice(invoice.id);

    expect(embedsFont(bytes, 'OpenSans')).toBe(true);
  }, 60_000);

  it('erzeugt ein PDF aus ungespeicherten Formulardaten', async () => {
    const { bytes, filename } = await documents.renderPreview({
      customerId: null,
      taxProfileId: null,
      buyerData: {
        snapshotVersion: CURRENT_SNAPSHOT_VERSION,
        companyName: 'Noch nicht gespeichert GmbH',
        contactName: null,
        addressLine: null,
        address: { street: 'Teststr. 2', postalCode: '73479', city: 'Ellwangen', country: 'DE' },
        email: null,
        vatId: null,
        customerNumber: null,
      },
      invoiceDate: '2026-03-01',
      serviceDate: '2026-03-01',
      serviceDateTo: null,
      dueDate: '2026-03-15',
      notes: null,
      footerNote: null,
      internalNotes: null,
      items: [
        {
          description: 'Beratung',
          quantity: 1000,
          unit: 'Std.',
          unitPriceCents: 12_000,
          discountType: DISCOUNT_TYPE.PERCENT,
          discountValue: 0,
          taxRateBasisPoints: 1900,
        },
      ],
    });

    expect(isPdf(bytes)).toBe(true);
    expect(filename).toBe('Rechnungsentwurf.pdf');
  }, 60_000);

  it('erzeugt mehrere gleichzeitig angeforderte PDFs nacheinander', async () => {
    const invoice = await createInvoice(2);

    const results = await Promise.all([
      documents.renderInvoice(invoice.id),
      documents.renderInvoice(invoice.id),
      documents.renderInvoice(invoice.id),
    ]);

    for (const result of results) {
      expect(isPdf(result.bytes)).toBe(true);
    }
  }, 60_000);
});
