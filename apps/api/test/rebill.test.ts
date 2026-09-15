import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { afterAll, beforeAll, beforeEach, describe, expect, it } from 'vitest';
import type { PrismaClient } from '@prisma/client';
import {
  CURRENT_SNAPSHOT_VERSION,
  DISCOUNT_TYPE,
  DOCUMENT_TYPE,
  REBILL_CUSTOMER_STATE,
  TAX_PROFILE_KIND,
  addDays,
  todayIso,
} from '@privatura/shared';
import { StorageConfig } from '../src/common/config.service';
import { CompanyService } from '../src/company/company.service';
import { FilesService } from '../src/files/files.service';
import { InvoiceDocumentsService } from '../src/pdf/invoice-documents.service';
import { InvoiceNumbersService } from '../src/invoices/invoice-numbers.service';
import { InvoicesService } from '../src/invoices/invoices.service';
import {
  createTestDatabase,
  resetInvoices,
  withSingleConnection,
  type TestDatabase,
} from './database.helper';

/**
 * „Neue Rechnung auf Basis dieser Rechnung."
 *
 * Geprüft wird die Entscheidung, die der Vorgang trifft, nicht das Kopieren
 * von Feldern: Welche Empfängerdaten kommen auf den neuen Entwurf, welches
 * Steuerprofil, und sagt die Vorschau vorher dasselbe. Der letzte Punkt ist
 * der eigentliche: Ein Dialog, der etwas anderes ankündigt, als anschließend
 * entsteht, wäre schlimmer als gar keiner.
 */
let db: TestDatabase;
let prisma: PrismaClient;
let invoices: InvoicesService;
let dataDir: string;

beforeAll(async () => {
  db = await createTestDatabase();
  prisma = db.prisma;
  dataDir = fs.mkdtempSync(path.join(os.tmpdir(), 'privatura-rebill-'));

  const storage = new StorageConfig({ get: () => dataDir } as never);
  const files = new FilesService(prisma, storage);
  const company = new CompanyService(prisma, files);

  invoices = new InvoicesService(
    prisma,
    company,
    new InvoiceNumbersService(prisma),
    new InvoiceDocumentsService(prisma, storage),
  );
});

afterAll(async () => {
  await db.cleanup();
  fs.rmSync(dataDir, { recursive: true, force: true });
});

beforeEach(async () => {
  await resetInvoices(prisma);
  await prisma.customer.deleteMany();
  await prisma.taxProfile.deleteMany();
  await prisma.company.deleteMany();

  await prisma.company.create({
    data: { id: 1, companyName: 'XYZ - Agentur', country: 'DE', defaultPaymentTermDays: 14 },
  });
});

/** Die Empfängerdaten, wie sie auf der alten Rechnung stehen. */
const OLD_BUYER = {
  snapshotVersion: CURRENT_SNAPSHOT_VERSION,
  companyName: 'SoluXion Ltd',
  contactName: null,
  addressLine: null,
  address: { street: 'Hauptstr. 1', postalCode: '7560', city: 'Larnaca', country: 'Zypern' },
  email: null,
  vatId: null,
  customerNumber: null,
  buyerReference: null,
  electronicAddress: null,
  electronicAddressScheme: null,
};

async function taxProfile(name: string, kind = TAX_PROFILE_KIND.STANDARD): Promise<number> {
  const profile = await prisma.taxProfile.create({
    data: {
      name,
      kind,
      defaultRateBasisPoints: kind === TAX_PROFILE_KIND.STANDARD ? 1900 : 0,
      noteText: kind === TAX_PROFILE_KIND.STANDARD ? null : 'Steuerschuldnerschaft des Empfängers.',
    },
  });
  return profile.id;
}

/** Ein Kunde, dessen Stammdaten sich seit der alten Rechnung geändert haben. */
async function movedCustomer(overrides: Record<string, unknown> = {}): Promise<number> {
  const customer = await prisma.customer.create({
    data: {
      companyName: 'SoluXion Ltd',
      street: 'Nikodimou 5',
      postalCode: '1010',
      city: 'Nikosia',
      country: 'Zypern',
      ...overrides,
    },
  });
  return customer.id;
}

async function sourceInvoice(overrides: Record<string, unknown> = {}): Promise<number> {
  const invoice = await prisma.invoice.create({
    data: {
      invoiceDate: '2026-03-01',
      serviceDate: '2026-02-28',
      dueDate: '2026-03-15',
      buyerData: JSON.stringify(OLD_BUYER),
      notes: 'Vielen Dank für den Auftrag.',
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

describe('Neue Rechnung auf Basis einer alten', () => {
  it('übernimmt Positionen und Texte und setzt die Daten auf heute', async () => {
    const id = await sourceInvoice();
    const created = await invoices.duplicate(id, { refreshCustomerDefaults: true });

    expect(created.items).toHaveLength(1);
    expect(created.items[0]?.description).toBe('Konzeption und Umsetzung');
    expect(created.notes).toBe('Vielen Dank für den Auftrag.');

    expect(created.invoiceDate).toBe(todayIso());
    expect(created.serviceDate).toBe(todayIso());
    // Ohne Kundenvorgabe gilt das Zahlungsziel des Unternehmens.
    expect(created.dueDate).toBe(addDays(todayIso(), 14));

    // Die Quelle bleibt unangetastet.
    const source = await prisma.invoice.findUniqueOrThrow({ where: { id } });
    expect(source.invoiceDate).toBe('2026-03-01');
  });

  it('legt ohne Nummer und ohne Zahlungsvermerke an', async () => {
    const id = await sourceInvoice({ internalNotes: 'Kunde zahlt immer spät' });
    const created = await invoices.duplicate(id, { refreshCustomerDefaults: true });

    expect(created.number).toBeNull();
    expect(created.status).toBe('DRAFT');
    expect(created.paidAt).toBeNull();
    expect(created.sentAt).toBeNull();
    // Die interne Notiz gehört zum abgeschlossenen Vorgang, nicht zum neuen.
    expect(created.internalNotes).toBeNull();
  });

  it('holt die aktuellen Kundendaten, wenn das Häkchen gesetzt ist', async () => {
    const customerId = await movedCustomer();
    const id = await sourceInvoice({ customerId });

    const created = await invoices.duplicate(id, { refreshCustomerDefaults: true });

    expect(created.buyerData.address.street).toBe('Nikodimou 5');
    expect(created.buyerData.address.city).toBe('Nikosia');
  });

  it('behält die Angaben von damals, wenn das Häkchen abgewählt ist', async () => {
    // Der Fall „Korrektur nach Storno": Die bewusst abweichende Anschrift auf
    // dem alten Dokument soll auf dem neuen wieder stehen.
    const customerId = await movedCustomer();
    const id = await sourceInvoice({ customerId });

    const created = await invoices.duplicate(id, { refreshCustomerDefaults: false });

    expect(created.buyerData.address.street).toBe('Hauptstr. 1');
    expect(created.buyerData.address.city).toBe('Larnaca');
  });

  it('übernimmt das Steuerprofil, das der Kunde inzwischen vorgibt', async () => {
    const alt = await taxProfile('Deutschland 19 %');
    const neu = await taxProfile('EU B2B Reverse Charge', TAX_PROFILE_KIND.REVERSE_CHARGE);
    const customerId = await movedCustomer({ defaultTaxProfileId: neu });
    const id = await sourceInvoice({ customerId, taxProfileId: alt });

    const created = await invoices.duplicate(id, { refreshCustomerDefaults: true });
    expect(created.taxProfileId).toBe(neu);
  });

  it('bleibt beim alten Steuerprofil, wenn der Kunde keines vorgibt', async () => {
    // Kein stiller Rückfall auf das Standardprofil: Aus einer
    // Reverse-Charge-Rechnung würde sonst eine mit 19 % ausgewiesener Steuer.
    await prisma.taxProfile.create({
      data: {
        name: 'Deutschland 19 %',
        kind: TAX_PROFILE_KIND.STANDARD,
        defaultRateBasisPoints: 1900,
        isDefault: true,
      },
    });
    const reverseCharge = await taxProfile('EU B2B', TAX_PROFILE_KIND.REVERSE_CHARGE);
    const customerId = await movedCustomer({ defaultTaxProfileId: null });
    const id = await sourceInvoice({ customerId, taxProfileId: reverseCharge });

    const created = await invoices.duplicate(id, { refreshCustomerDefaults: true });
    expect(created.taxProfileId).toBe(reverseCharge);
  });

  it('bleibt beim alten Steuerprofil, wenn die Kundenvorgabe archiviert ist', async () => {
    const alt = await taxProfile('Deutschland 19 %');
    const archiviert = await taxProfile('Alt-Profil');
    await prisma.taxProfile.update({
      where: { id: archiviert },
      data: { archivedAt: new Date() },
    });
    const customerId = await movedCustomer({ defaultTaxProfileId: archiviert });
    const id = await sourceInvoice({ customerId, taxProfileId: alt });

    const created = await invoices.duplicate(id, { refreshCustomerDefaults: true });
    expect(created.taxProfileId).toBe(alt);
  });

  it('rechnet das Fälligkeitsdatum mit dem Zahlungsziel des Kunden', async () => {
    const customerId = await movedCustomer({ defaultPaymentTermDays: 30 });
    const id = await sourceInvoice({ customerId });

    const created = await invoices.duplicate(id, { refreshCustomerDefaults: true });
    expect(created.dueDate).toBe(addDays(todayIso(), 30));
  });

  it('weist ein Storno als Grundlage ab', async () => {
    const id = await sourceInvoice({ documentType: DOCUMENT_TYPE.CANCELLATION });

    await expect(invoices.duplicate(id, { refreshCustomerDefaults: true })).rejects.toThrow(
      /ursprüngliche Rechnung/,
    );
  });

  it('kommt ohne Kunden aus', async () => {
    const id = await sourceInvoice({ customerId: null });
    const created = await invoices.duplicate(id, { refreshCustomerDefaults: true });

    expect(created.buyerData.companyName).toBe('SoluXion Ltd');
  });
});

describe('Vorschau', () => {
  it('kündigt genau das an, was das Anlegen dann tut', async () => {
    // Der Kern der Sache: Dialog und Ergebnis dürfen nicht auseinanderlaufen.
    const alt = await taxProfile('Deutschland 19 %');
    const neu = await taxProfile('EU B2B Reverse Charge', TAX_PROFILE_KIND.REVERSE_CHARGE);
    const customerId = await movedCustomer({
      defaultTaxProfileId: neu,
      defaultPaymentTermDays: 30,
    });
    const id = await sourceInvoice({ customerId, taxProfileId: alt });

    const preview = await invoices.rebillPreview(id);
    const created = await invoices.duplicate(id, { refreshCustomerDefaults: true });

    expect(created.invoiceDate).toBe(preview.invoiceDate);
    expect(created.serviceDate).toBe(preview.serviceDate);
    expect(created.dueDate).toBe(preview.dueDate);
    expect(created.items).toHaveLength(preview.itemCount);
    expect(created.totals.netCents).toBe(preview.netCents);

    for (const change of preview.buyerChanges) {
      expect(change.from).not.toBe(change.to);
    }
    expect(preview.taxProfileChange).toEqual({
      from: 'Deutschland 19 %',
      to: 'EU B2B Reverse Charge',
    });
  });

  it('nennt die geänderten Adressfelder und sonst nichts', async () => {
    const customerId = await movedCustomer();
    const id = await sourceInvoice({ customerId });

    const preview = await invoices.rebillPreview(id);

    expect(preview.customerState).toBe(REBILL_CUSTOMER_STATE.AVAILABLE);
    expect(preview.customerName).toBe('SoluXion Ltd');
    expect(preview.buyerChanges.map((change) => change.label)).toEqual(['Straße', 'PLZ', 'Ort']);
    expect(preview.taxProfileChange).toBeNull();
  });

  it('meldet eine Rechnung ohne Kunden als solche, statt Änderungen zu behaupten', async () => {
    const id = await sourceInvoice({ customerId: null });
    const preview = await invoices.rebillPreview(id);

    expect(preview.customerState).toBe(REBILL_CUSTOMER_STATE.NONE);
    expect(preview.buyerChanges).toEqual([]);
    expect(preview.customerName).toBeNull();
  });

  it('meldet den gelöschten Kunden als fehlend, statt daran zu scheitern', async () => {
    const customerId = await movedCustomer();
    const id = await sourceInvoice({ customerId });

    // Über die Anwendung ist dieser Zustand nicht herzustellen: Der
    // Fremdschlüssel steht auf SetNull, ein gelöschter Kunde hinterlässt
    // also eine Rechnung ohne Verknüpfung. Ein aus Teilen wiederhergestelltes
    // Backup oder eine von Hand bearbeitete Datenbank kann die Verknüpfung
    // aber stehen lassen — und dann darf die Vorschau nicht abstürzen,
    // sondern muss sagen, was los ist. Deshalb hier mit abgeschalteter
    // Fremdschlüsselprüfung genau dieser Zustand.
    // Auf einer eigenen, einzelnen Verbindung: Ein abgeschaltetes
    // `foreign_keys` gilt nur dort, wo es gesetzt wurde, und der Pool
    // schickte das DELETE sonst womöglich über eine Verbindung, auf der die
    // Prüfung noch greift — dann räumte SetNull die Verknüpfung ab, und der
    // Test prüfte einen anderen Zustand als den gemeinten.
    await withSingleConnection(db.url, async (single) => {
      await single.$executeRawUnsafe('PRAGMA foreign_keys = OFF');
      await single.$executeRawUnsafe('DELETE FROM "Customer" WHERE "id" = ?', customerId);
    });

    const preview = await invoices.rebillPreview(id);

    expect(preview.customerState).toBe(REBILL_CUSTOMER_STATE.MISSING);
    expect(preview.buyerChanges).toEqual([]);
    expect(preview.customerName).toBeNull();
  });

  it('meldet eine Rechnung, deren Kunde gelöscht wurde, als kundenlos', async () => {
    // Der reguläre Weg: SetNull trennt die Verknüpfung, und die
    // Empfängerdaten der Rechnung bleiben die einzige Quelle.
    const customerId = await movedCustomer();
    const id = await sourceInvoice({ customerId });
    await prisma.customer.delete({ where: { id: customerId } });

    const preview = await invoices.rebillPreview(id);

    expect(preview.customerState).toBe(REBILL_CUSTOMER_STATE.NONE);
    expect(preview.buyerChanges).toEqual([]);
  });

  it('weist auf einen archivierten Kunden hin', async () => {
    const customerId = await movedCustomer({ archivedAt: new Date() });
    const id = await sourceInvoice({ customerId });

    const preview = await invoices.rebillPreview(id);
    expect(preview.customerArchived).toBe(true);
  });

  it('sagt, woher das Zahlungsziel kommt', async () => {
    const ohneVorgabe = await movedCustomer();
    const mitVorgabe = await prisma.customer.create({
      data: { companyName: 'Andere GmbH', defaultPaymentTermDays: 30 },
    });

    const a = await invoices.rebillPreview(await sourceInvoice({ customerId: ohneVorgabe }));
    expect(a.paymentTermDays).toBe(14);
    expect(a.paymentTermFromCustomer).toBe(false);

    const b = await invoices.rebillPreview(await sourceInvoice({ customerId: mitVorgabe.id }));
    expect(b.paymentTermDays).toBe(30);
    expect(b.paymentTermFromCustomer).toBe(true);
  });

  it('nennt die Quelle beim Namen', async () => {
    const id = await sourceInvoice();
    const entwurf = await invoices.rebillPreview(id);
    expect(entwurf.sourceName).toBe(`Entwurf #${id}`);
  });
});
