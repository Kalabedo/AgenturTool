import fs from 'node:fs';
import crypto from 'node:crypto';
import os from 'node:os';
import path from 'node:path';
import { afterAll, beforeAll, beforeEach, describe, expect, it } from 'vitest';
import type { PrismaClient } from '@prisma/client';
import {
  CURRENT_SNAPSHOT_VERSION,
  DISCOUNT_TYPE,
  DOCUMENT_KIND,
  TAX_PROFILE_KIND,
} from '@agentur-tool/shared';
import { StorageConfig } from '../src/common/config.service';
import { CompanyService } from '../src/company/company.service';
import { FilesService } from '../src/files/files.service';
import { TaxProfilesService } from '../src/tax-profiles/tax-profiles.service';
import { TemplateSettingsService } from '../src/template-settings/template-settings.service';
import { InvoiceDocumentsService } from '../src/pdf/invoice-documents.service';
import { InvoicePdfService } from '../src/pdf/invoice-pdf.service';
import { InvoiceFinalizeService } from '../src/invoices/invoice-finalize.service';
import { InvoiceNumbersService } from '../src/invoices/invoice-numbers.service';
import { EinvoiceService } from '../src/einvoice/einvoice.service';
import { createTestDatabase, resetInvoices, type TestDatabase } from './database.helper';
import { StubPdfRenderer } from './stub-renderer';

/**
 * Die E-Rechnung als Integrationstest.
 *
 * Geprüft wird, was `packages/einvoice` nicht prüfen kann: dass die Datei
 * beim Finalisieren **entsteht**, **abgelegt** wird und beim Herunterladen
 * genau so wieder herauskommt. Wie das XML innen aussieht, prüfen die
 * Golden-Dateien des Pakets — und der KoSIT-Validator in der CI.
 */
let db: TestDatabase;
let prisma: PrismaClient;
let documents: InvoiceDocumentsService;
let finalizer: InvoiceFinalizeService;
let einvoice: EinvoiceService;
let dataDir: string;

beforeAll(async () => {
  db = await createTestDatabase();
  prisma = db.prisma;
  dataDir = fs.mkdtempSync(path.join(os.tmpdir(), 'agentur-tool-einvoice-'));

  const storage = new StorageConfig({ get: () => dataDir } as never);
  const files = new FilesService(prisma, storage);
  const company = new CompanyService(prisma, files);
  const templateSettings = new TemplateSettingsService(prisma);
  const taxProfiles = new TaxProfilesService(prisma);

  documents = new InvoiceDocumentsService(prisma, storage);
  const numbers = new InvoiceNumbersService(prisma);

  const invoicePdf = new InvoicePdfService(
    prisma,
    company,
    templateSettings,
    taxProfiles,
    files,
    documents,
    new StubPdfRenderer(),
  );

  finalizer = new InvoiceFinalizeService(
    prisma,
    company,
    taxProfiles,
    templateSettings,
    numbers,
    documents,
    invoicePdf,
    new EinvoiceService(prisma, documents),
  );

  einvoice = new EinvoiceService(prisma, documents);
});

afterAll(async () => {
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
      phone: '+49 7961 1234567',
      email: 'hello@xyz-agentur.de',
      electronicAddress: 'rechnung@xyz-agentur.de',
      electronicAddressScheme: 'EM',
    },
  });
});

const BUYER = {
  snapshotVersion: CURRENT_SNAPSHOT_VERSION,
  companyName: 'SoluXion Ltd',
  contactName: null,
  addressLine: null,
  address: { street: 'Hauptstr. 1', postalCode: '7560', city: 'Larnaca', country: 'Zypern' },
  email: 'rechnung@soluxion.example',
  vatId: 'CY60143029O',
  customerNumber: null,
  buyerReference: 'BR-2026-0001',
  electronicAddress: 'rechnung@soluxion.example',
  electronicAddressScheme: 'EM',
};

async function createDraft(buyer: Record<string, unknown> = BUYER): Promise<number> {
  const profile = await prisma.taxProfile.create({
    data: {
      name: `Deutschland 19 % ${crypto.randomUUID().slice(0, 8)}`,
      kind: TAX_PROFILE_KIND.STANDARD,
      defaultRateBasisPoints: 1900,
      taxCategoryCode: 'S',
    },
  });

  const invoice = await prisma.invoice.create({
    data: {
      taxProfileId: profile.id,
      invoiceDate: '2026-03-01',
      serviceDate: '2026-02-28',
      dueDate: '2026-03-15',
      buyerData: JSON.stringify(buyer),
      items: {
        create: [
          {
            position: 1,
            description: 'Beratung',
            quantity: 7500,
            unit: 'Std.',
            unitCode: 'HUR',
            unitPriceCents: 12000,
            discountType: DISCOUNT_TYPE.PERCENT,
            discountValue: 0,
            taxRateBasisPoints: 1900,
            lineDiscountCents: 0,
            lineNetCents: 90000,
          },
        ],
      },
    },
  });

  return invoice.id;
}

describe('E-Rechnung beim Finalisieren', () => {
  it('legt XML und PDF nebeneinander ab', async () => {
    const id = await createDraft();
    await finalizer.finalize(id);

    const stored = await prisma.invoiceDocument.findMany({ where: { invoiceId: id } });
    expect(stored).toHaveLength(2);

    const pdf = stored.find((document) => document.kind === DOCUMENT_KIND.PDF);
    const xml = stored.find((document) => document.kind === DOCUMENT_KIND.XML);
    expect(pdf?.path).toMatch(/^invoices\/2026\/.*\.pdf$/u);
    expect(xml?.path).toMatch(/^invoices\/2026\/.*\.xml$/u);

    // Beide Dateien liegen wirklich da, und der Hash passt zum Inhalt.
    expect(documents.exists(xml!.path)).toBe(true);
    const bytes = await documents.read(xml!.path);
    expect(crypto.createHash('sha256').update(bytes).digest('hex')).toBe(xml!.sha256);
    expect(bytes.length).toBe(xml!.sizeBytes);
  });

  it('liefert beim Download die abgelegte Datei', async () => {
    const id = await createDraft();
    await finalizer.finalize(id);

    const stored = await prisma.invoiceDocument.findFirst({
      where: { invoiceId: id, kind: DOCUMENT_KIND.XML },
    });
    const onDisk = await documents.read(stored!.path);

    const delivered = await einvoice.deliver(id);
    expect(delivered.bytes.equals(onDisk)).toBe(true);
    expect(delivered.filename).toMatch(/\.xml$/u);
  });

  it('trägt die eingefrorenen Beträge und die Nummer', async () => {
    const id = await createDraft();
    await finalizer.finalize(id);

    const invoice = await prisma.invoice.findUniqueOrThrow({ where: { id } });
    const xml = (await einvoice.deliver(id)).bytes.toString('utf8');

    expect(xml).toContain(`<ram:ID>${invoice.number}</ram:ID>`);
    // 7,5 × 120,00 € = 900,00 €, davon 19 % = 171,00 €.
    expect(xml).toContain('<ram:TaxBasisTotalAmount>900.00</ram:TaxBasisTotalAmount>');
    expect(xml).toContain('<ram:TaxTotalAmount currencyID="EUR">171.00</ram:TaxTotalAmount>');
    expect(xml).toContain('<ram:GrandTotalAmount>1071.00</ram:GrandTotalAmount>');
  });

  it('stellt auch ohne E-Rechnungs-Angaben aus', async () => {
    // Der Kern der Entscheidung: Eine Rechnung ohne Käuferreferenz ist
    // nach § 14 UStG gültig. Sie darf sich ausstellen lassen — nur eben
    // nicht als XRechnung ausgeben.
    const id = await createDraft({ ...BUYER, buyerReference: null, electronicAddress: null });
    await finalizer.finalize(id);

    const invoice = await prisma.invoice.findUniqueOrThrow({ where: { id } });
    expect(invoice.number).not.toBeNull();

    const stored = await prisma.invoiceDocument.findMany({ where: { invoiceId: id } });
    expect(stored).toHaveLength(1);
    expect(stored[0]?.kind).toBe(DOCUMENT_KIND.PDF);
  });

  it('sagt, was der E-Rechnung fehlt', async () => {
    const id = await createDraft({ ...BUYER, buyerReference: null });
    await finalizer.finalize(id);

    const problems = await einvoice.problems(id);
    expect(problems.map((problem) => problem.field)).toContain('buyerReference');

    // Und der Download läuft nicht ins Leere, sondern sagt dasselbe.
    await expect(einvoice.deliver(id)).rejects.toThrow(/fehlen Angaben/u);
  });

  it('erzeugt die Datei aus dem Snapshot neu, wenn sie verloren ging', async () => {
    const id = await createDraft();
    await finalizer.finalize(id);

    const stored = await prisma.invoiceDocument.findFirstOrThrow({
      where: { invoiceId: id, kind: DOCUMENT_KIND.XML },
    });
    const original = await documents.read(stored.path);

    // Der Fall aus Abschnitt 13: Datensatz da, Datei weg.
    await documents.remove(stored.path);
    expect(documents.exists(stored.path)).toBe(false);

    const delivered = await einvoice.deliver(id);
    // Dieselbe Datei — alles, was hineingeht, ist eingefroren.
    expect(delivered.bytes.equals(original)).toBe(true);
  });

  it('macht aus dem Storno eine Gutschrift mit Verweis', async () => {
    const id = await createDraft();
    await finalizer.finalize(id);
    const original = await prisma.invoice.findUniqueOrThrow({ where: { id } });

    const cancellationId = await finalizer.cancel(id);
    const xml = (await einvoice.deliver(cancellationId)).bytes.toString('utf8');

    expect(xml).toContain('<ram:TypeCode>381</ram:TypeCode>');
    expect(xml).toContain(`<ram:IssuerAssignedID>${original.number}</ram:IssuerAssignedID>`);
  });

  it('weist einen Entwurf ab', async () => {
    const id = await createDraft();
    await expect(einvoice.deliver(id)).rejects.toThrow(/Entwurf/u);
  });
});
