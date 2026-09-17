import fs from 'node:fs';
import crypto from 'node:crypto';
import os from 'node:os';
import path from 'node:path';
import { afterAll, beforeAll, beforeEach, describe, expect, it } from 'vitest';
import type { PrismaClient } from '@prisma/client';
import {
  CURRENT_SNAPSHOT_VERSION,
  DISCOUNT_TYPE,
  TAX_PROFILE_KIND,
  totalsSnapshotSchema,
} from '@privatura/shared';
import { StorageConfig } from '../src/common/config.service';
import { CompanyService } from '../src/company/company.service';
import { FilesService } from '../src/files/files.service';
import { TaxProfilesService } from '../src/tax-profiles/tax-profiles.service';
import { TemplateSettingsService } from '../src/template-settings/template-settings.service';
import { InvoiceDocumentsService } from '../src/pdf/invoice-documents.service';
import { InvoicePdfService } from '../src/pdf/invoice-pdf.service';
import { EinvoiceService } from '../src/einvoice/einvoice.service';
import { InvoiceFinalizeService } from '../src/invoices/invoice-finalize.service';
import { InvoiceNumbersService } from '../src/invoices/invoice-numbers.service';
import { createTestDatabase, resetInvoices, type TestDatabase } from './database.helper';
import { StubPdfRenderer } from './stub-renderer';

/**
 * Die abgeleiteten Auswertungsspalten (Abschnitt 30).
 *
 * Netto, Steuer, Brutto, Steuerart, Land und USt-IdNr. stehen nach dem
 * Finalisieren ein zweites Mal als echte Spalten in der Zeile, damit SQLite
 * darüber summieren und filtern kann. Geprüft wird hier die eine Eigenschaft,
 * auf der alles Weitere beruht: **Spalte und Snapshot sagen dasselbe.**
 *
 * Liefe das auseinander, wäre der Schaden still — die Rechnung sähe richtig
 * aus, und falsch wären nur die Umsatzanzeige, die Kleinunternehmer-Grenze
 * und die Meldung ans Finanzamt.
 */
let db: TestDatabase;
let prisma: PrismaClient;
let finalizer: InvoiceFinalizeService;
let dataDir: string;

beforeAll(async () => {
  db = await createTestDatabase();
  prisma = db.prisma;
  dataDir = fs.mkdtempSync(path.join(os.tmpdir(), 'privatura-totals-'));

  const storage = new StorageConfig({ get: () => dataDir } as never);
  const files = new FilesService(prisma, storage);
  const company = new CompanyService(prisma, files);
  const templateSettings = new TemplateSettingsService(prisma);
  const taxProfiles = new TaxProfilesService(prisma);
  const documents = new InvoiceDocumentsService(prisma, storage);
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
    },
  });
});

const BUYER = {
  snapshotVersion: CURRENT_SNAPSHOT_VERSION,
  companyName: 'SoluXion Ltd',
  contactName: null,
  addressLine: null,
  address: { street: 'Hauptstr. 1', postalCode: '7560', city: 'Larnaca', country: 'CY' },
  email: null,
  vatId: 'CY60143029O',
  customerNumber: null,
  buyerReference: 'BR-2026-0001',
  electronicAddress: 'rechnung@soluxion.example',
  electronicAddressScheme: 'EM',
};

async function taxProfile(kind: string, rateBasisPoints: number): Promise<number> {
  const profile = await prisma.taxProfile.create({
    data: {
      name: `Profil ${crypto.randomUUID().slice(0, 8)}`,
      kind,
      defaultRateBasisPoints: rateBasisPoints,
      // Ein Profil ohne Steuerausweis verlangt beim Finalisieren einen
      // Hinweistext — er steht später auf dem Dokument.
      noteText:
        kind === TAX_PROFILE_KIND.STANDARD
          ? null
          : 'Steuerschuldnerschaft des Leistungsempfängers (Reverse Charge).',
      showTaxColumn: kind === TAX_PROFILE_KIND.STANDARD,
    },
  });
  return profile.id;
}

async function createDraft(
  kind: string = TAX_PROFILE_KIND.STANDARD,
  rateBasisPoints = 1900,
): Promise<number> {
  const taxProfileId = await taxProfile(kind, rateBasisPoints);
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
            taxRateBasisPoints: rateBasisPoints,
            lineNetCents: 90_000,
          },
        ],
      },
    },
  });
  return invoice.id;
}

describe('Abgeleitete Auswertungsspalten', () => {
  it('schreibt beim Finalisieren dieselben Werte wie in den Snapshot', async () => {
    const id = await createDraft();
    await finalizer.finalize(id);

    const invoice = await prisma.invoice.findUniqueOrThrow({ where: { id } });
    const totals = totalsSnapshotSchema.parse(JSON.parse(invoice.totalsSnapshot ?? ''));

    expect(invoice.totalNetCents).toBe(totals.netCents);
    expect(invoice.totalTaxCents).toBe(totals.taxCents);
    expect(invoice.totalGrossCents).toBe(totals.grossCents);

    // 7,5 h zu 120,00 € = 900,00 € netto, 19 % = 171,00 €.
    expect(invoice.totalNetCents).toBe(90_000);
    expect(invoice.totalTaxCents).toBe(17_100);
    expect(invoice.totalGrossCents).toBe(107_100);
  }, 60_000);

  it('übernimmt Steuerart, Land und USt-IdNr. aus den Snapshots', async () => {
    const id = await createDraft(TAX_PROFILE_KIND.REVERSE_CHARGE, 0);
    await finalizer.finalize(id);

    const invoice = await prisma.invoice.findUniqueOrThrow({ where: { id } });

    expect(invoice.taxProfileKind).toBe(TAX_PROFILE_KIND.REVERSE_CHARGE);
    // Das Land steht im Adressobjekt des Käufers, eine Ebene tiefer als die
    // USt-IdNr. — die Zusammenfassende Meldung filtert später darüber.
    expect(invoice.buyerCountry).toBe('CY');
    expect(invoice.buyerVatId).toBe('CY60143029O');
  }, 60_000);

  it('lässt Entwürfe leer, denn ein Entwurf hat keinen Umsatz', async () => {
    const id = await createDraft();

    const draft = await prisma.invoice.findUniqueOrThrow({ where: { id } });
    expect(draft.totalNetCents).toBeNull();
    expect(draft.totalGrossCents).toBeNull();
    expect(draft.taxProfileKind).toBeNull();
  });

  it('hebt sich mit dem Storno exakt auf', async () => {
    const id = await createDraft();
    await finalizer.finalize(id);
    const cancellationId = await finalizer.cancel(id);

    const original = await prisma.invoice.findUniqueOrThrow({ where: { id } });
    const cancellation = await prisma.invoice.findUniqueOrThrow({ where: { id: cancellationId } });

    // Dieselbe Zusage wie `roundHalfAwayFromZero`: Original + Storno = 0,
    // auf den Cent. Ein Rundungsfehler hier stünde in jeder Jahressumme.
    expect((original.totalNetCents ?? 0) + (cancellation.totalNetCents ?? 0)).toBe(0);
    expect((original.totalTaxCents ?? 0) + (cancellation.totalTaxCents ?? 0)).toBe(0);
    expect((original.totalGrossCents ?? 0) + (cancellation.totalGrossCents ?? 0)).toBe(0);

    expect(cancellation.totalNetCents).toBeLessThan(0);
  }, 60_000);

  it('leert die Spalten beim Zurücknehmen der Finalisierung', async () => {
    const id = await createDraft();
    await finalizer.finalize(id);
    await finalizer.unfinalize(id);

    const invoice = await prisma.invoice.findUniqueOrThrow({ where: { id } });

    // Blieben sie stehen, trüge ein Entwurf weiter Umsatz in jede Auswertung.
    expect(invoice.totalNetCents).toBeNull();
    expect(invoice.totalTaxCents).toBeNull();
    expect(invoice.totalGrossCents).toBeNull();
    expect(invoice.taxProfileKind).toBeNull();
    expect(invoice.buyerCountry).toBeNull();
    expect(invoice.buyerVatId).toBeNull();
  }, 60_000);

  it('weist einen direkten UPDATE auf die Summen ab', async () => {
    const id = await createDraft();
    await finalizer.finalize(id);

    // Der Trigger der Init-Migration zählt seine Spalten einzeln auf. Die
    // neuen mussten dort nachgetragen werden, sonst liefe ein UPDATE genau
    // an der Zahl vorbei, auf der die Meldung ans Finanzamt beruht.
    await expect(
      prisma.$executeRawUnsafe(`UPDATE "Invoice" SET "totalNetCents" = 1 WHERE "id" = ${id}`),
    ).rejects.toThrow(/INVOICE_IMMUTABLE/u);

    const invoice = await prisma.invoice.findUniqueOrThrow({ where: { id } });
    expect(invoice.totalNetCents).toBe(90_000);
  }, 60_000);
});
