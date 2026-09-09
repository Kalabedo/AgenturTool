import fs from 'node:fs';
import crypto from 'node:crypto';
import os from 'node:os';
import path from 'node:path';
import { afterAll, beforeAll, beforeEach, describe, expect, it } from 'vitest';
import type { PrismaClient } from '@prisma/client';
import {
  CURRENT_SNAPSHOT_VERSION,
  DISCOUNT_TYPE,
  DOCUMENT_TYPE,
  INVOICE_EVENT_TYPE,
  INVOICE_STATUS,
  TAX_PROFILE_KIND,
  invoicePaymentInputSchema,
  invoiceSentInputSchema,
} from '@agentur-tool/shared';
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

/**
 * Der Lebenszyklus nach dem Ausstellen: bezahlt, versendet, storniert,
 * dupliziert (Schritt 10).
 *
 * Die Storno-Tests brauchen Chromium, weil ein Storno ein eigenes Dokument
 * mit eigenem PDF ist. Ohne Browser werden sie übersprungen.
 */
const chromium = findChromiumExecutable(process.env.PUPPETEER_EXECUTABLE_PATH);

let db: TestDatabase;
let prisma: PrismaClient;
let pdfService: PdfService;
let finalizer: InvoiceFinalizeService;
let invoices: InvoicesService;
let dataDir: string;

beforeAll(async () => {
  db = await createTestDatabase();
  prisma = db.prisma;
  dataDir = fs.mkdtempSync(path.join(os.tmpdir(), 'agentur-tool-life-'));

  const storage = new StorageConfig({ get: () => dataDir } as never);
  const files = new FilesService(prisma, storage);
  const company = new CompanyService(prisma, files);
  const templateSettings = new TemplateSettingsService(prisma);
  const taxProfiles = new TaxProfilesService(prisma);
  const documents = new InvoiceDocumentsService(prisma, storage);
  const numbers = new InvoiceNumbersService(prisma);

  pdfService = new PdfService(
    new ChromiumConfig({ get: (key: string) => process.env[key] } as never),
  );

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
  await prisma.taxProfile.deleteMany();
  await prisma.customer.deleteMany();
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
      defaultPaymentTermDays: 14,
    },
  });
});

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

async function createDraft(): Promise<number> {
  const profile = await prisma.taxProfile.create({
    data: {
      name: `Deutschland 19 % ${crypto.randomUUID().slice(0, 8)}`,
      kind: TAX_PROFILE_KIND.STANDARD,
      defaultRateBasisPoints: 1900,
    },
  });

  const invoice = await prisma.invoice.create({
    data: {
      taxProfileId: profile.id,
      invoiceDate: '2026-03-01',
      serviceDate: '2026-02-28',
      dueDate: '2026-03-15',
      buyerData: JSON.stringify(BUYER),
      notes: 'Vielen Dank für den Auftrag.',
      internalNotes: 'Nur für mich.',
      items: {
        create: [
          {
            position: 1,
            description: 'Konzeption',
            quantity: 7500,
            unit: 'Std.',
            unitPriceCents: 12_345,
            discountType: DISCOUNT_TYPE.PERCENT,
            discountValue: 1000,
            taxRateBasisPoints: 1900,
            lineNetCents: 83_329,
          },
        ],
      },
    },
  });
  return invoice.id;
}

function payment(paidAt: string | null) {
  return invoicePaymentInputSchema.parse({ paidAt });
}

describe('Zahlung und Versand', () => {
  it('setzt mit dem Zahldatum den Status und nimmt ihn wieder zurück', async () => {
    const id = await createDraft();
    await prisma.invoice.update({
      where: { id },
      data: { status: INVOICE_STATUS.ISSUED, number: '2026-001', numberYear: 2026, numberSeq: 1 },
    });

    const paid = await invoices.setPayment(id, payment('2026-03-10'));
    expect(paid.status).toBe(INVOICE_STATUS.PAID);
    expect(paid.paidAt).toBe('2026-03-10');

    const open = await invoices.setPayment(id, payment(null));
    expect(open.status).toBe(INVOICE_STATUS.ISSUED);
    expect(open.paidAt).toBeNull();

    const events = await prisma.invoiceEvent.findMany({ where: { invoiceId: id } });
    expect(events.map((event) => event.type)).toEqual(
      expect.arrayContaining([INVOICE_EVENT_TYPE.PAYMENT_SET, INVOICE_EVENT_TYPE.PAYMENT_CLEARED]),
    );
  });

  it('lehnt eine Zahlung auf einen Entwurf ab', async () => {
    const id = await createDraft();
    await expect(invoices.setPayment(id, payment('2026-03-10'))).rejects.toMatchObject({
      code: 'VALIDATION_FAILED',
    });
  });

  it('merkt sich den Versand als Zeitstempel, unabhängig vom Bezahlstatus', async () => {
    const id = await createDraft();
    await prisma.invoice.update({
      where: { id },
      data: { status: INVOICE_STATUS.ISSUED, number: '2026-001', numberYear: 2026, numberSeq: 1 },
    });

    const sent = await invoices.setSent(id, invoiceSentInputSchema.parse({}));
    expect(sent.sentAt).not.toBeNull();

    // Versendet und bezahlt sind orthogonal: Das eine hebt das andere nicht auf.
    const paid = await invoices.setPayment(id, payment('2026-03-10'));
    expect(paid.sentAt).not.toBeNull();
    expect(paid.status).toBe(INVOICE_STATUS.PAID);

    const withdrawn = await invoices.setSent(id, invoiceSentInputSchema.parse({ sentAt: null }));
    expect(withdrawn.sentAt).toBeNull();
  });

  it('lehnt den Versandvermerk auf einem Entwurf ab', async () => {
    const id = await createDraft();
    await expect(invoices.setSent(id, invoiceSentInputSchema.parse({}))).rejects.toMatchObject({
      code: 'VALIDATION_FAILED',
    });
  });
});

describe('Duplizieren', () => {
  it('kopiert Inhalte, aber weder Nummer noch Vermerke', async () => {
    const id = await createDraft();
    await prisma.invoice.update({
      where: { id },
      data: {
        status: INVOICE_STATUS.ISSUED,
        number: '2026-001',
        numberYear: 2026,
        numberSeq: 1,
        paidAt: '2026-03-10',
        sentAt: new Date(),
      },
    });

    const copy = await invoices.duplicate(id);

    expect(copy.status).toBe(INVOICE_STATUS.DRAFT);
    expect(copy.number).toBeNull();
    expect(copy.paidAt).toBeNull();
    expect(copy.sentAt).toBeNull();
    expect(copy.buyerData.companyName).toBe('SoluXion Ltd');
    expect(copy.notes).toBe('Vielen Dank für den Auftrag.');
    expect(copy.items).toHaveLength(1);
    expect(copy.items[0]?.unitPriceCents).toBe(12_345);

    // Die interne Notiz gehört zum abgeschlossenen Vorgang.
    expect(copy.internalNotes).toBeNull();

    // Ein Duplikat ist eine Rechnung von heute, nicht von damals.
    expect(copy.invoiceDate).not.toBe('2026-03-01');

    const event = await prisma.invoiceEvent.findFirstOrThrow({ where: { invoiceId: copy.id } });
    expect(event.metadata).toContain('2026-001');
  });
});

describe.skipIf(chromium === null)('Stornieren', () => {
  async function issued(): Promise<number> {
    const id = await createDraft();
    await finalizer.finalize(id);
    return id;
  }

  it('erzeugt ein eigenes Dokument mit umgekehrten Mengen', async () => {
    const id = await issued();
    const cancellationId = await finalizer.cancel(id);

    const cancellation = await invoices.findById(cancellationId);
    const original = await invoices.findById(id);

    expect(cancellation.documentType).toBe(DOCUMENT_TYPE.CANCELLATION);
    expect(cancellation.status).toBe(INVOICE_STATUS.ISSUED);
    // Aus derselben Sequenz wie Rechnungen (D10) — lückenlos fortlaufend.
    expect(cancellation.number).toBe('2026-002');
    expect(cancellation.cancelsInvoiceId).toBe(id);
    expect(cancellation.items[0]?.quantity).toBe(-7500);
    expect(cancellation.notes).toContain('Storno zur Rechnung 2026-001');

    expect(original.status).toBe(INVOICE_STATUS.CANCELLED);
    expect(original.cancelledAt).not.toBeNull();
    expect(original.cancelledByInvoiceId).toBe(cancellationId);
  }, 90_000);

  it('gleicht sich mit der Originalrechnung exakt zu null aus', async () => {
    const id = await issued();
    const cancellationId = await finalizer.cancel(id);

    const original = await invoices.findById(id);
    const cancellation = await invoices.findById(cancellationId);

    expect(original.totals.grossCents + cancellation.totals.grossCents).toBe(0);
    expect(original.totals.netCents + cancellation.totals.netCents).toBe(0);
    expect(original.totals.taxCents + cancellation.totals.taxCents).toBe(0);
  }, 90_000);

  it('legt für das Storno ein eigenes PDF ab', async () => {
    const id = await issued();
    const cancellationId = await finalizer.cancel(id);

    const document = await prisma.invoiceDocument.findFirstOrThrow({
      where: { invoiceId: cancellationId },
    });
    expect(document.path).toBe('invoices/2026/2026-002.pdf');
    expect(fs.existsSync(path.join(dataDir, document.path))).toBe(true);

    // Die Originaldatei bleibt unangetastet — sie ist das Exemplar beim Kunden.
    expect(fs.existsSync(path.join(dataDir, 'invoices/2026/2026-001.pdf'))).toBe(true);
  }, 90_000);

  it('benutzt die eingefrorenen Daten der Originalrechnung, nicht die heutigen', async () => {
    const id = await issued();
    await prisma.company.update({ where: { id: 1 }, data: { companyName: 'Neuer Name GmbH' } });

    const cancellationId = await finalizer.cancel(id);
    const cancellation = await prisma.invoice.findUniqueOrThrow({ where: { id: cancellationId } });

    // Ein Storno hebt ein bestimmtes Dokument auf und trägt deshalb dessen
    // Absenderdaten.
    expect(cancellation.sellerSnapshot).toContain('XYZ - Agentur');
    expect(cancellation.sellerSnapshot).not.toContain('Neuer Name GmbH');
  }, 90_000);

  it('lehnt ein zweites Storno und das Storno eines Stornos ab', async () => {
    const id = await issued();
    const cancellationId = await finalizer.cancel(id);

    await expect(finalizer.cancel(id)).rejects.toMatchObject({ code: 'INVOICE_NOT_EDITABLE' });
    await expect(finalizer.cancel(cancellationId)).rejects.toMatchObject({
      code: 'INVOICE_NOT_EDITABLE',
    });
  }, 90_000);

  it('lehnt das Storno eines Entwurfs ab', async () => {
    const id = await createDraft();
    await expect(finalizer.cancel(id)).rejects.toMatchObject({ code: 'INVOICE_NOT_EDITABLE' });
  });

  it('verhindert das Zurücknehmen der Finalisierung nach einem Storno', async () => {
    // Bedingung 4 aus Abschnitt 8 — geprüft am echten Storno.
    const id = await issued();
    await finalizer.cancel(id);

    await expect(finalizer.unfinalize(id)).rejects.toMatchObject({
      code: 'UNFINALIZE_NOT_ALLOWED',
    });
  }, 90_000);

  it('lässt sich nicht duplizieren, die Originalrechnung dagegen schon', async () => {
    const id = await issued();
    const cancellationId = await finalizer.cancel(id);

    await expect(invoices.duplicate(cancellationId)).rejects.toMatchObject({
      code: 'VALIDATION_FAILED',
    });

    // Der Weg zur Korrektur: Original duplizieren, korrigieren, neu ausstellen.
    const corrected = await invoices.duplicate(id);
    expect(corrected.status).toBe(INVOICE_STATUS.DRAFT);
    expect(corrected.items[0]?.quantity).toBe(7500);
  }, 90_000);
});
