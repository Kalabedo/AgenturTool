import fs from 'node:fs';
import crypto from 'node:crypto';
import os from 'node:os';
import path from 'node:path';
import { afterAll, beforeAll, beforeEach, describe, expect, it } from 'vitest';
import type { PrismaClient } from '@prisma/client';
import {
  DISCOUNT_TYPE,
  INVOICE_EVENT_TYPE,
  INVOICE_STATUS,
  NUMBER_PATTERN_SETTING_KEY,
  TAX_PROFILE_KIND,
  CURRENT_SNAPSHOT_VERSION,
} from '@agentur-tool/shared';
import { ApiError } from '../src/common/api-error';
import { StorageConfig } from '../src/common/config.service';
import { CompanyService } from '../src/company/company.service';
import { FilesService } from '../src/files/files.service';
import { TaxProfilesService } from '../src/tax-profiles/tax-profiles.service';
import { TemplateSettingsService } from '../src/template-settings/template-settings.service';
import { ChromiumConfig, findChromiumExecutable } from '../src/pdf/chromium';
import { InvoiceDocumentsService } from '../src/pdf/invoice-documents.service';
import { InvoicePdfService } from '../src/pdf/invoice-pdf.service';
import { PdfService } from '../src/pdf/pdf.service';
import { InvoiceFinalizeService } from '../src/invoices/invoice-finalize.service';
import { InvoiceNumbersService } from '../src/invoices/invoice-numbers.service';
import { InvoicesService } from '../src/invoices/invoices.service';
import { createTestDatabase, resetInvoices, type TestDatabase } from './database.helper';
import { isPdf } from './pdf.helper';

/**
 * Das Finalisieren als Integrationstest (Abschnitt 20: „Finalisierung als
 * Integrationstest").
 *
 * Ohne Chromium gibt es kein PDF und damit kein Finalisieren — die Datei
 * wird dann übersprungen statt rot. Wer sie laufen lassen will, setzt
 * PUPPETEER_EXECUTABLE_PATH.
 */
const chromium = findChromiumExecutable(process.env.PUPPETEER_EXECUTABLE_PATH);

let db: TestDatabase;
let prisma: PrismaClient;
let pdfService: PdfService;
let documents: InvoiceDocumentsService;
let finalizer: InvoiceFinalizeService;
let numbers: InvoiceNumbersService;
let invoices: InvoicesService;
let dataDir: string;

beforeAll(async () => {
  db = await createTestDatabase();
  prisma = db.prisma;
  dataDir = fs.mkdtempSync(path.join(os.tmpdir(), 'agentur-tool-final-'));

  const storage = new StorageConfig({ get: () => dataDir } as never);
  const files = new FilesService(prisma, storage);
  const company = new CompanyService(prisma, files);
  const templateSettings = new TemplateSettingsService(prisma);
  const taxProfiles = new TaxProfilesService(prisma);

  pdfService = new PdfService(
    new ChromiumConfig({ get: (key: string) => process.env[key] } as never),
  );
  documents = new InvoiceDocumentsService(prisma, storage);
  numbers = new InvoiceNumbersService(prisma);

  const invoicePdf = new InvoicePdfService(
    prisma,
    company,
    templateSettings,
    taxProfiles,
    files,
    documents,
    pdfService,
  );

  finalizer = new InvoiceFinalizeService(
    prisma,
    company,
    taxProfiles,
    templateSettings,
    numbers,
    documents,
    invoicePdf,
  );

  invoices = new InvoicesService(prisma, company, numbers, documents);
});

afterAll(async () => {
  await pdfService.onModuleDestroy();
  await db.cleanup();
  fs.rmSync(dataDir, { recursive: true, force: true });
});

beforeEach(async () => {
  await resetInvoices(prisma);
  await prisma.numberSequence.deleteMany();
  await prisma.appSetting.deleteMany();
  await prisma.taxProfile.deleteMany();
  await prisma.company.deleteMany();
  fs.rmSync(path.join(dataDir, 'invoices'), { recursive: true, force: true });

  await prisma.company.create({
    data: {
      id: 1,
      companyName: 'XYZ - Agentur',
      street: 'Wolfgangsklinge 14',
      postalCode: '73479',
      city: 'Ellwangen',
      country: 'DE',
      vatId: 'DE455137261',
      iban: 'DE12202208000052019114',
    },
  });
});

async function standardTaxProfile(): Promise<number> {
  const profile = await prisma.taxProfile.create({
    data: {
      name: `Deutschland 19 % ${crypto.randomUUID().slice(0, 8)}`,
      kind: TAX_PROFILE_KIND.STANDARD,
      defaultRateBasisPoints: 1900,
    },
  });
  return profile.id;
}

const BUYER = {
  snapshotVersion: CURRENT_SNAPSHOT_VERSION,
  companyName: 'SoluXion Ltd',
  contactName: null,
  addressLine: null,
  address: { street: 'Hauptstr. 1', postalCode: '7560', city: 'Larnaca', country: 'Zypern' },
  email: null,
  vatId: 'CY60143029O',
  customerNumber: null,
};

/** Ein vollständiger, ausstellbarer Entwurf. */
async function createDraft(overrides: Record<string, unknown> = {}): Promise<number> {
  const taxProfileId = await standardTaxProfile();
  const invoice = await prisma.invoice.create({
    data: {
      taxProfileId,
      invoiceDate: '2026-03-01',
      serviceDate: '2026-02-28',
      dueDate: '2026-03-15',
      buyerData: JSON.stringify(BUYER),
      items: {
        create: [
          {
            position: 1,
            description: 'Konzeption und Umsetzung',
            quantity: 7500,
            unit: 'Std.',
            unitPriceCents: 12_000,
            discountType: DISCOUNT_TYPE.PERCENT,
            discountValue: 0,
            taxRateBasisPoints: 1900,
            lineNetCents: 90_000,
          },
        ],
      },
      ...overrides,
    },
  });
  return invoice.id;
}

describe.skipIf(chromium === null)('Finalisieren', () => {
  it('vergibt Nummer, friert die Daten ein und legt das PDF ab', async () => {
    const id = await createDraft();
    await finalizer.finalize(id);

    const invoice = await prisma.invoice.findUniqueOrThrow({
      where: { id },
      include: { documents: true, events: true },
    });

    expect(invoice.number).toBe('2026-001');
    expect(invoice.numberYear).toBe(2026);
    expect(invoice.numberSeq).toBe(1);
    expect(invoice.status).toBe(INVOICE_STATUS.ISSUED);
    expect(invoice.issuedAt).not.toBeNull();
    expect(invoice.sellerSnapshot).toContain('XYZ - Agentur');
    expect(invoice.totalsSnapshot).toContain('"grossCents"');

    const [document] = invoice.documents;
    expect(document?.path).toBe('invoices/2026/2026-001.pdf');

    // Die Datei liegt da, wo die Datenbank sie vermutet, und ihr Hash
    // stimmt — das ist die Grundlage der Backup-Prüfung.
    const bytes = fs.readFileSync(path.join(dataDir, document?.path ?? ''));
    expect(isPdf(bytes)).toBe(true);
    expect(crypto.createHash('sha256').update(bytes).digest('hex')).toBe(document?.sha256);
    expect(document?.sizeBytes).toBe(bytes.length);

    expect(invoice.events.map((event) => event.type)).toContain(INVOICE_EVENT_TYPE.FINALIZED);
  }, 60_000);

  it('zählt lückenlos weiter und trennt die Jahre', async () => {
    const first = await createDraft();
    const second = await createDraft();
    const lastYear = await createDraft({ invoiceDate: '2025-12-31', dueDate: '2026-01-14' });

    await finalizer.finalize(first);
    await finalizer.finalize(second);
    await finalizer.finalize(lastYear);

    const numbersAssigned = await prisma.invoice.findMany({
      where: { id: { in: [first, second, lastYear] } },
      select: { id: true, number: true },
      orderBy: { id: 'asc' },
    });

    // Das Jahr kommt aus dem Rechnungsdatum, nicht aus heute: Die dritte
    // Rechnung ist die erste des Jahres 2025.
    expect(numbersAssigned.map((invoice) => invoice.number)).toEqual([
      '2026-001',
      '2026-002',
      '2025-001',
    ]);
  }, 90_000);

  it('folgt einem konfigurierten Nummernmuster', async () => {
    await prisma.appSetting.create({
      data: { key: NUMBER_PATTERN_SETTING_KEY, value: 'RE-{YYYY}-{SEQ:4}' },
    });

    const id = await createDraft();
    await finalizer.finalize(id);

    const invoice = await prisma.invoice.findUniqueOrThrow({ where: { id } });
    expect(invoice.number).toBe('RE-2026-0001');
    expect(fs.existsSync(path.join(dataDir, 'invoices/2026/RE-2026-0001.pdf'))).toBe(true);
  }, 60_000);

  it('friert die Stammdaten ein: eine spätere Änderung ändert die Rechnung nicht', async () => {
    // Der wichtigste Einzeltest aus Abschnitt 22.
    const id = await createDraft();
    await finalizer.finalize(id);

    await prisma.company.update({ where: { id: 1 }, data: { iban: 'DE00000000000000000000' } });

    const response = await invoices.findById(id);
    const before = await prisma.invoice.findUniqueOrThrow({ where: { id } });

    expect(before.sellerSnapshot).toContain('DE12202208000052019114');
    expect(before.sellerSnapshot).not.toContain('DE00000000000000000000');
    expect(response.status).toBe(INVOICE_STATUS.ISSUED);
  }, 60_000);

  it('verbraucht keine Nummer, wenn die Rechnung unvollständig ist', async () => {
    const id = await createDraft();
    await prisma.invoice.update({
      where: { id },
      data: { buyerData: JSON.stringify({ ...BUYER, companyName: '' }) },
    });

    await expect(finalizer.finalize(id)).rejects.toThrow(ApiError);
    await expect(finalizer.finalize(id)).rejects.toMatchObject({
      code: 'FINALIZE_VALIDATION_FAILED',
    });

    // Kein Zähler angelegt, kein Dokument, kein Statuswechsel.
    expect(await numbers.nextValueFor(2026)).toBeNull();
    expect(await prisma.invoiceDocument.count()).toBe(0);
    expect((await prisma.invoice.findUniqueOrThrow({ where: { id } })).status).toBe(
      INVOICE_STATUS.DRAFT,
    );
  }, 60_000);

  it('lässt eine ausgestellte Rechnung nicht erneut ausstellen', async () => {
    const id = await createDraft();
    await finalizer.finalize(id);

    await expect(finalizer.finalize(id)).rejects.toMatchObject({
      code: 'INVOICE_NOT_EDITABLE',
    });
  }, 60_000);

  it('liefert beim Download die gespeicherte Datei, nicht eine Neuerzeugung', async () => {
    const id = await createDraft();
    await finalizer.finalize(id);

    const document = await prisma.invoiceDocument.findFirstOrThrow({ where: { invoiceId: id } });
    // Ein erkennbar anderer Inhalt an der Stelle der abgelegten Datei: Was
    // der Download liefert, muss von der Platte kommen.
    fs.writeFileSync(path.join(dataDir, document.path), Buffer.from('%PDF-1.4 markiert'));

    const delivered = await invoicePdfFor(id);
    expect(delivered.toString('latin1')).toBe('%PDF-1.4 markiert');
  }, 60_000);
});

/** Kleiner Helfer, damit der Test die Auslieferung über denselben Weg geht wie der Controller. */
async function invoicePdfFor(id: number): Promise<Buffer> {
  const storage = new StorageConfig({ get: () => dataDir } as never);
  const files = new FilesService(prisma, storage);
  const service = new InvoicePdfService(
    prisma,
    new CompanyService(prisma, files),
    new TemplateSettingsService(prisma),
    new TaxProfilesService(prisma),
    files,
    documents,
    pdfService,
  );
  return (await service.deliver(id)).bytes;
}

describe.skipIf(chromium === null)('Finalisierung zurücknehmen', () => {
  it('gibt die Nummer zurück und vergibt sie erneut', async () => {
    // Test 7 aus Abschnitt 22: Undo direkt nach dem Finalisieren, danach neu
    // finalisieren — dieselbe Nummer muss wieder herauskommen.
    const id = await createDraft();
    await finalizer.finalize(id);

    const document = await prisma.invoiceDocument.findFirstOrThrow({ where: { invoiceId: id } });
    await finalizer.unfinalize(id);

    const draft = await prisma.invoice.findUniqueOrThrow({
      where: { id },
      include: { events: true },
    });
    expect(draft.status).toBe(INVOICE_STATUS.DRAFT);
    expect(draft.number).toBeNull();
    expect(draft.issuedAt).toBeNull();
    expect(draft.sellerSnapshot).toBeNull();
    expect(draft.totalsSnapshot).toBeNull();

    expect(await prisma.invoiceDocument.count({ where: { invoiceId: id } })).toBe(0);
    expect(fs.existsSync(path.join(dataDir, document.path))).toBe(false);
    expect(draft.events.map((event) => event.type)).toContain(INVOICE_EVENT_TYPE.UNFINALIZED);

    await finalizer.finalize(id);
    expect((await prisma.invoice.findUniqueOrThrow({ where: { id } })).number).toBe('2026-001');
  }, 90_000);

  it('hält im Ereignisprotokoll fest, welche Nummer freigegeben wurde', async () => {
    const id = await createDraft();
    await finalizer.finalize(id);
    await finalizer.unfinalize(id);

    const event = await prisma.invoiceEvent.findFirstOrThrow({
      where: { invoiceId: id, type: INVOICE_EVENT_TYPE.UNFINALIZED },
    });
    expect(event.metadata).toContain('2026-001');
  }, 60_000);

  it('lehnt ab, wenn eine neuere Rechnung existiert', async () => {
    const first = await createDraft();
    const second = await createDraft();
    await finalizer.finalize(first);
    await finalizer.finalize(second);

    await expect(finalizer.unfinalize(first)).rejects.toMatchObject({
      code: 'UNFINALIZE_NOT_ALLOWED',
    });

    // Die zuletzt vergebene geht dagegen zurück.
    await expect(finalizer.unfinalize(second)).resolves.toBeUndefined();
  }, 90_000);

  it('lehnt ab, wenn die Rechnung als versendet vermerkt ist', async () => {
    const id = await createDraft();
    await finalizer.finalize(id);
    await prisma.invoice.update({ where: { id }, data: { sentAt: new Date() } });

    await expect(finalizer.unfinalize(id)).rejects.toMatchObject({
      code: 'UNFINALIZE_NOT_ALLOWED',
    });
  }, 60_000);

  it('lehnt ab, wenn die Rechnung als bezahlt vermerkt ist', async () => {
    const id = await createDraft();
    await finalizer.finalize(id);
    await prisma.invoice.update({
      where: { id },
      data: { status: INVOICE_STATUS.PAID, paidAt: '2026-03-10' },
    });

    await expect(finalizer.unfinalize(id)).rejects.toMatchObject({
      code: 'UNFINALIZE_NOT_ALLOWED',
    });
  }, 60_000);

  it('zeigt in der Antwort, ob und warum nicht zurückgenommen werden kann', async () => {
    const first = await createDraft();
    await finalizer.finalize(first);

    const allowed = await invoices.findById(first);
    expect(allowed.canUnfinalize).toBe(true);
    expect(allowed.unfinalizeBlocker).toBeNull();
    expect(allowed.hasDocument).toBe(true);
    expect(allowed.documentMissing).toBe(false);

    const second = await createDraft();
    await finalizer.finalize(second);

    const blocked = await invoices.findById(first);
    expect(blocked.canUnfinalize).toBe(false);
    expect(blocked.unfinalizeBlocker).toMatch(/neuere Rechnung/u);
  }, 90_000);
});

describe.skipIf(chromium === null)('PDF-Ablage', () => {
  it('meldet eine fehlende Datei und erzeugt sie auf Wunsch neu', async () => {
    const id = await createDraft();
    await finalizer.finalize(id);

    const document = await prisma.invoiceDocument.findFirstOrThrow({ where: { invoiceId: id } });
    fs.rmSync(path.join(dataDir, document.path));

    expect((await invoices.findById(id)).documentMissing).toBe(true);
    expect((await documents.reconcile()).missingFiles).toEqual([document.path]);

    await finalizer.regenerateDocument(id);

    expect((await invoices.findById(id)).documentMissing).toBe(false);
    expect(fs.existsSync(path.join(dataDir, document.path))).toBe(true);

    const events = await prisma.invoiceEvent.findMany({ where: { invoiceId: id } });
    expect(events.map((event) => event.type)).toContain(INVOICE_EVENT_TYPE.PDF_REGENERATED);
  }, 90_000);

  it('räumt eine Datei ohne Datensatz nach data/orphans, statt sie zu löschen', async () => {
    const strayPath = path.join(dataDir, 'invoices', '2026', 'fremd.pdf');
    fs.mkdirSync(path.dirname(strayPath), { recursive: true });
    fs.writeFileSync(strayPath, '%PDF-1.4 fremd');

    const result = await documents.reconcile();

    expect(result.orphanedFiles).toEqual(['invoices/2026/fremd.pdf']);
    expect(fs.existsSync(strayPath)).toBe(false);
    expect(fs.readFileSync(path.join(dataDir, 'orphans', '2026-fremd.pdf'), 'utf8')).toBe(
      '%PDF-1.4 fremd',
    );
  });
});
