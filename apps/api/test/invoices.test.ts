import { afterAll, beforeAll, beforeEach, describe, expect, it } from 'vitest';
import type { PrismaClient } from '@prisma/client';
import {
  DISCOUNT_TYPE,
  INVOICE_STATUS,
  addDays,
  invoiceDraftInputSchema,
  todayIso,
} from '@agentur-tool/shared';
import { InvoicesService } from '../src/invoices/invoices.service';
import { CompanyService } from '../src/company/company.service';
import { FilesService } from '../src/files/files.service';
import { StorageConfig } from '../src/common/config.service';
import { InvoiceDocumentsService } from '../src/pdf/invoice-documents.service';
import { InvoiceNumbersService } from '../src/invoices/invoice-numbers.service';
import { ApiError } from '../src/common/api-error';
import {
  createTestDatabase,
  markIssued,
  resetInvoices,
  type TestDatabase,
} from './database.helper';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';

let db: TestDatabase;
let prisma: PrismaClient;
let invoices: InvoicesService;
let dataDir: string;

beforeAll(async () => {
  db = await createTestDatabase();
  prisma = db.prisma;
  dataDir = fs.mkdtempSync(path.join(os.tmpdir(), 'agentur-tool-inv-'));
  const storage = new StorageConfig({ get: () => dataDir } as never);
  const company = new CompanyService(prisma, new FilesService(prisma, storage));
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
  await prisma.company.create({ data: { id: 1, country: 'DE', defaultPaymentTermDays: 14 } });
});

function payload(overrides: Record<string, unknown> = {}) {
  return invoiceDraftInputSchema.parse({
    customerId: '',
    taxProfileId: '',
    buyerData: {
      companyName: 'Kunde GmbH',
      contactName: '',
      addressLine: '',
      street: 'Kundenstr. 5',
      postalCode: '20095',
      city: 'Hamburg',
      country: 'DE',
      email: '',
      vatId: '',
      customerNumber: '',
    },
    invoiceDate: '2026-03-01',
    serviceDate: '2026-02-28',
    serviceDateTo: '',
    dueDate: '2026-03-15',
    notes: '',
    footerNote: '',
    internalNotes: '',
    items: [
      {
        description: 'Konzeption',
        quantity: '7,5',
        unit: 'Std.',
        unitPriceCents: '120,00',
        discountType: DISCOUNT_TYPE.PERCENT,
        discountValue: '',
        taxRateBasisPoints: '19',
      },
    ],
    ...overrides,
  });
}

describe('Entwurf anlegen', () => {
  it('legt einen leeren Entwurf ohne Nummer an', async () => {
    const draft = await invoices.createDraft(null);

    expect(draft.status).toBe(INVOICE_STATUS.DRAFT);
    expect(draft.number).toBeNull();
    expect(draft.items).toEqual([]);
    expect(draft.totals.grossCents).toBe(0);
  });

  it('belegt das Fälligkeitsdatum aus dem Zahlungsziel des Unternehmens vor', async () => {
    const draft = await invoices.createDraft(null);
    const today = todayIso();

    expect(draft.invoiceDate).toBe(today);
    expect(draft.dueDate).toBe(addDays(today, 14));
  });

  it('bevorzugt das Zahlungsziel des Kunden', async () => {
    const customer = await prisma.customer.create({
      data: { companyName: 'Nordwind', defaultPaymentTermDays: 30 },
    });
    const draft = await invoices.createDraft(customer.id);

    expect(draft.dueDate).toBe(addDays(todayIso(), 30));
  });

  it('übernimmt die Kundendaten als Kopie', async () => {
    const customer = await prisma.customer.create({
      data: {
        companyName: 'Nordwind Logistik',
        contactName: 'Alex Beispiel',
        street: 'Hafenstraße 12',
        postalCode: '20095',
        city: 'Hamburg',
        country: 'DE',
        customerNumber: 'K-100',
      },
    });

    const draft = await invoices.createDraft(customer.id);

    expect(draft.customerId).toBe(customer.id);
    expect(draft.buyerData.companyName).toBe('Nordwind Logistik');
    expect(draft.buyerData.address.street).toBe('Hafenstraße 12');
    expect(draft.buyerData.customerNumber).toBe('K-100');
  });

  it('übernimmt das Standard-Steuerprofil des Kunden', async () => {
    const profile = await prisma.taxProfile.create({
      data: { name: 'Reverse Charge', kind: 'REVERSE_CHARGE', noteText: 'Hinweis' },
    });
    const customer = await prisma.customer.create({
      data: { companyName: 'EU-Kunde', defaultTaxProfileId: profile.id },
    });

    expect((await invoices.createDraft(customer.id)).taxProfileId).toBe(profile.id);
  });

  it('greift sonst auf das allgemeine Standardprofil zurück', async () => {
    const standard = await prisma.taxProfile.create({
      data: {
        name: 'Deutschland 19 %',
        kind: 'STANDARD',
        defaultRateBasisPoints: 1900,
        isDefault: true,
      },
    });

    expect((await invoices.createDraft(null)).taxProfileId).toBe(standard.id);
  });

  it('lehnt einen unbekannten Kunden ab', async () => {
    await expect(invoices.createDraft(999_999)).rejects.toBeInstanceOf(ApiError);
  });

  it('protokolliert das Anlegen', async () => {
    const draft = await invoices.createDraft(null);
    const events = await prisma.invoiceEvent.findMany({ where: { invoiceId: draft.id } });
    expect(events.map((e) => e.type)).toEqual(['CREATED']);
  });
});

describe('Entwurf ändern', () => {
  it('speichert Positionen und rechnet die Beträge selbst aus', async () => {
    const draft = await invoices.createDraft(null);
    const updated = await invoices.updateDraft(draft.id, payload());

    expect(updated.items).toHaveLength(1);
    expect(updated.items[0]?.lineNetCents).toBe(90000);
    expect(updated.totals.netCents).toBe(90000);
    expect(updated.totals.taxCents).toBe(17100);
    expect(updated.totals.grossCents).toBe(107100);
  });

  it('vertraut den mitgeschickten Zeilenbeträgen nicht', async () => {
    // Das Formular rechnet nur für die Anzeige mit. Selbst wenn ein Aufruf
    // eigene Zeilensummen mitschickt, gilt die Berechnung des Servers.
    const draft = await invoices.createDraft(null);
    const updated = await invoices.updateDraft(
      draft.id,
      payload({
        items: [
          {
            description: 'Manipuliert',
            quantity: '1',
            unit: '',
            unitPriceCents: '100,00',
            discountType: DISCOUNT_TYPE.PERCENT,
            discountValue: '',
            taxRateBasisPoints: '19',
            lineNetCents: 1,
            lineDiscountCents: 999,
          },
        ],
      }),
    );

    expect(updated.items[0]?.lineNetCents).toBe(10000);
    expect(updated.items[0]?.lineDiscountCents).toBe(0);
  });

  it('nummeriert die Positionen in der übergebenen Reihenfolge', async () => {
    const draft = await invoices.createDraft(null);
    const updated = await invoices.updateDraft(
      draft.id,
      payload({
        items: ['Erste', 'Zweite', 'Dritte'].map((description) => ({
          description,
          quantity: '1',
          unit: '',
          unitPriceCents: '10,00',
          discountType: DISCOUNT_TYPE.PERCENT,
          discountValue: '',
          taxRateBasisPoints: '19',
        })),
      }),
    );

    expect(updated.items.map((i) => [i.position, i.description])).toEqual([
      [1, 'Erste'],
      [2, 'Zweite'],
      [3, 'Dritte'],
    ]);
  });

  it('ersetzt die Positionen vollständig', async () => {
    const draft = await invoices.createDraft(null);
    await invoices.updateDraft(draft.id, payload());
    const updated = await invoices.updateDraft(draft.id, payload({ items: [] }));

    expect(updated.items).toEqual([]);
    expect(await prisma.invoiceItem.count({ where: { invoiceId: draft.id } })).toBe(0);
  });

  it('trennt gemischte Steuersätze in Gruppen', async () => {
    const draft = await invoices.createDraft(null);
    const updated = await invoices.updateDraft(
      draft.id,
      payload({
        items: [
          {
            description: 'Beratung',
            quantity: '1',
            unit: '',
            unitPriceCents: '100,00',
            discountType: DISCOUNT_TYPE.PERCENT,
            discountValue: '',
            taxRateBasisPoints: '19',
          },
          {
            description: 'Fachbuch',
            quantity: '1',
            unit: '',
            unitPriceCents: '50,00',
            discountType: DISCOUNT_TYPE.PERCENT,
            discountValue: '',
            taxRateBasisPoints: '7',
          },
        ],
      }),
    );

    expect(updated.totals.taxGroups).toEqual([
      { rateBasisPoints: 700, netCents: 5000, taxCents: 350 },
      { rateBasisPoints: 1900, netCents: 10000, taxCents: 1900 },
    ]);
    expect(updated.totals.grossCents).toBe(17250);
  });

  it('lehnt einen unbekannten Kunden am Feld ab', async () => {
    const draft = await invoices.createDraft(null);
    await expect(
      invoices.updateDraft(draft.id, payload({ customerId: 999_999 })),
    ).rejects.toMatchObject({ code: 'VALIDATION_FAILED', details: [{ field: 'customerId' }] });
  });

  it('meldet eine unbekannte Rechnung als nicht gefunden', async () => {
    await expect(invoices.updateDraft(999_999, payload())).rejects.toBeInstanceOf(ApiError);
  });
});

describe('Sperre finalisierter Rechnungen', () => {
  it('verweigert das Ändern mit 409', async () => {
    const draft = await invoices.createDraft(null);
    await invoices.updateDraft(draft.id, payload());
    await markIssued(prisma, draft.id, { number: '2026-001', seq: 1 });

    await expect(invoices.updateDraft(draft.id, payload())).rejects.toMatchObject({
      code: 'INVOICE_NOT_EDITABLE',
    });
  });

  it('verweigert das Löschen', async () => {
    const draft = await invoices.createDraft(null);
    await markIssued(prisma, draft.id, { number: '2026-002', seq: 2 });

    await expect(invoices.deleteDraft(draft.id)).rejects.toMatchObject({
      code: 'INVOICE_NOT_EDITABLE',
    });
    expect(await prisma.invoice.count({ where: { id: draft.id } })).toBe(1);
  });

  it('verweigert das Neuübernehmen der Kundendaten', async () => {
    const customer = await prisma.customer.create({ data: { companyName: 'Nordwind' } });
    const draft = await invoices.createDraft(customer.id);
    await markIssued(prisma, draft.id, { number: '2026-003', seq: 3 });

    await expect(invoices.refreshCustomerData(draft.id)).rejects.toMatchObject({
      code: 'INVOICE_NOT_EDITABLE',
    });
  });
});

describe('Kundendaten neu übernehmen', () => {
  it('holt den aktuellen Stammdatenstand in den Entwurf', async () => {
    const customer = await prisma.customer.create({
      data: {
        companyName: 'Nordwind',
        street: 'Alte Straße 1',
        city: 'Hamburg',
        postalCode: '20095',
      },
    });
    const draft = await invoices.createDraft(customer.id);

    await prisma.customer.update({
      where: { id: customer.id },
      data: { street: 'Neue Straße 9', city: 'Bremen' },
    });

    // Die Kopie im Entwurf bleibt zunächst stehen — das ist der Sinn von D9.
    expect((await invoices.findById(draft.id)).buyerData.address.street).toBe('Alte Straße 1');

    const refreshed = await invoices.refreshCustomerData(draft.id);
    expect(refreshed.buyerData.address.street).toBe('Neue Straße 9');
    expect(refreshed.buyerData.address.city).toBe('Bremen');
  });

  it('lässt einmalige Abweichungen im Entwurf zu', async () => {
    // Der eigentliche Grund für die Kopie: abweichende Rechnungsanschrift
    // oder ein „z. Hd.", ohne die Stammdaten zu ändern.
    const customer = await prisma.customer.create({ data: { companyName: 'Nordwind' } });
    const draft = await invoices.createDraft(customer.id);

    const updated = await invoices.updateDraft(
      draft.id,
      payload({
        customerId: customer.id,
        buyerData: {
          companyName: 'Nordwind Logistik GmbH',
          contactName: '',
          addressLine: 'z. Hd. Buchhaltung',
          street: 'Abweichende Straße 3',
          postalCode: '10115',
          city: 'Berlin',
          country: 'DE',
          email: '',
          vatId: '',
          customerNumber: '',
        },
      }),
    );

    expect(updated.buyerData.addressLine).toBe('z. Hd. Buchhaltung');
    // Die Stammdaten bleiben unberührt.
    expect(
      (await prisma.customer.findUniqueOrThrow({ where: { id: customer.id } })).companyName,
    ).toBe('Nordwind');
  });

  it('meldet, wenn kein Kunde zugeordnet ist', async () => {
    const draft = await invoices.createDraft(null);
    await expect(invoices.refreshCustomerData(draft.id)).rejects.toBeInstanceOf(ApiError);
  });
});

describe('Liste', () => {
  beforeEach(async () => {
    const customer = await prisma.customer.create({ data: { companyName: 'Nordwind Logistik' } });
    const first = await invoices.createDraft(customer.id);
    await invoices.updateDraft(
      first.id,
      payload({
        customerId: customer.id,
        invoiceDate: '2026-03-01',
        dueDate: '2026-03-15',
        buyerData: {
          companyName: 'Nordwind Logistik',
          contactName: '',
          addressLine: '',
          street: 'Hafenstraße 12',
          postalCode: '20095',
          city: 'Hamburg',
          country: 'DE',
          email: '',
          vatId: '',
          customerNumber: '',
        },
      }),
    );

    const second = await invoices.createDraft(null);
    await invoices.updateDraft(
      second.id,
      payload({ invoiceDate: '2026-01-10', dueDate: '2026-01-24' }),
    );
    await markIssued(prisma, second.id, { number: '2026-001', seq: 1 });
  });

  it('sortiert nach Rechnungsdatum absteigend', async () => {
    const list = await invoices.list({});
    expect(list.map((i) => i.invoiceDate)).toEqual(['2026-03-01', '2026-01-10']);
  });

  it('filtert nach Status', async () => {
    expect((await invoices.list({ status: INVOICE_STATUS.DRAFT })).length).toBe(1);
    expect((await invoices.list({ status: INVOICE_STATUS.ISSUED })).length).toBe(1);
  });

  it('filtert nach Jahr über das Rechnungsdatum', async () => {
    expect((await invoices.list({ year: 2026 })).length).toBe(2);
    expect((await invoices.list({ year: 2025 })).length).toBe(0);
  });

  it('findet über Nummer und Empfänger', async () => {
    expect((await invoices.list({ q: '2026-001' })).length).toBe(1);
    expect((await invoices.list({ q: 'Nordwind' })).length).toBe(1);
  });

  it('durchsucht die Empfängerdaten als Ganzes', async () => {
    // Die Suche läuft über das gespeicherte JSON, nicht nur über den Namen.
    // Ein Ort oder eine Straße trifft deshalb ebenfalls — für ein Werkzeug
    // dieser Größe eher nützlich als störend. Sollte die Rechnungsübersicht
    // später nach Empfänger sortieren müssen, bekäme die Tabelle eine eigene
    // Spalte dafür.
    expect((await invoices.list({ q: 'Hafenstraße' })).length).toBe(1);
    // Beide Rechnungen gehen nach Hamburg, also trifft der Ort auch beide.
    expect((await invoices.list({ q: 'Hamburg' })).length).toBe(2);
  });
});

describe('Entwurf löschen', () => {
  it('entfernt Entwurf samt Positionen', async () => {
    const draft = await invoices.createDraft(null);
    await invoices.updateDraft(draft.id, payload());

    await invoices.deleteDraft(draft.id);

    expect(await prisma.invoice.count()).toBe(0);
    expect(await prisma.invoiceItem.count()).toBe(0);
  });
});
