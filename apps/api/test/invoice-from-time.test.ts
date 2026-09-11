import crypto from 'node:crypto';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { afterAll, beforeAll, beforeEach, describe, expect, it } from 'vitest';
import type { PrismaClient } from '@prisma/client';
import { BILLING_MODE, DISCOUNT_TYPE, TAX_PROFILE_KIND, UNIT_CODE } from '@agentur-tool/shared';
import { StorageConfig } from '../src/common/config.service';
import { CompanyService } from '../src/company/company.service';
import { FilesService } from '../src/files/files.service';
import { InvoiceDocumentsService } from '../src/pdf/invoice-documents.service';
import { InvoiceNumbersService } from '../src/invoices/invoice-numbers.service';
import { InvoicesService } from '../src/invoices/invoices.service';
import { InvoiceFromTimeService } from '../src/invoices/invoice-from-time.service';
import { createTestDatabase, resetInvoices, type TestDatabase } from './database.helper';

/**
 * Aus Zeiten wird eine Rechnung — als Integrationstest.
 *
 * Der wichtigste Fall steht weiter unten und heißt „gibt die Zeiten wieder
 * frei": Abgerechnete Zeiten ohne zugehörige Rechnung sind verlorenes Geld,
 * und es merkt niemand. Alles andere hier ist Beiwerk dagegen.
 */
let db: TestDatabase;
let prisma: PrismaClient;
let invoices: InvoicesService;
let fromTime: InvoiceFromTimeService;
let dataDir: string;

beforeAll(async () => {
  db = await createTestDatabase();
  prisma = db.prisma;
  dataDir = fs.mkdtempSync(path.join(os.tmpdir(), 'agentur-tool-zeit-'));

  const storage = new StorageConfig({ get: () => dataDir } as never);
  const files = new FilesService(prisma, storage);
  const company = new CompanyService(prisma, files);
  const documents = new InvoiceDocumentsService(prisma, storage);
  const numbers = new InvoiceNumbersService(prisma);

  invoices = new InvoicesService(prisma, company, numbers, documents);
  fromTime = new InvoiceFromTimeService(prisma, company, invoices);
});

afterAll(async () => {
  await db.cleanup();
  fs.rmSync(dataDir, { recursive: true, force: true });
});

beforeEach(async () => {
  await resetInvoices(prisma);
  await prisma.timeEntry.deleteMany();
  await prisma.numberSequence.deleteMany();
  await prisma.customer.deleteMany();
  await prisma.taxProfile.deleteMany();
  await prisma.company.deleteMany();

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
      defaultPaymentTermDays: 14,
    },
  });
});

/** Kunde mit Stundensatz und Regelbesteuerung. */
async function createCustomer(
  overrides: Record<string, unknown> = {},
): Promise<{ id: number; taxProfileId: number }> {
  const profile = await prisma.taxProfile.create({
    data: {
      name: `Deutschland 19 % ${crypto.randomUUID().slice(0, 8)}`,
      kind: TAX_PROFILE_KIND.STANDARD,
      defaultRateBasisPoints: 1900,
      taxCategoryCode: 'S',
    },
  });

  const customer = await prisma.customer.create({
    data: {
      companyName: 'Nordwind Logistik GmbH',
      street: 'Hafenstraße 12',
      postalCode: '20095',
      city: 'Hamburg',
      country: 'DE',
      defaultTaxProfileId: profile.id,
      hourlyRateCents: 5000,
      ...overrides,
    },
  });

  return { id: customer.id, taxProfileId: profile.id };
}

/**
 * Drei Tage, fünf Einträge, 10,5 Stunden — alles auf dem
 * Viertelstundenraster, das die Datenbank erzwingt.
 */
async function createEntries(customerId: number): Promise<void> {
  await prisma.timeEntry.createMany({
    data: [
      {
        customerId,
        date: '2026-02-03',
        startMinutes: 540,
        endMinutes: 660,
        breakMinutes: 0,
        description: 'Konzeption',
      },
      {
        customerId,
        date: '2026-02-03',
        startMinutes: 780,
        endMinutes: 870,
        breakMinutes: 0,
        description: 'Umsetzung',
      },
      {
        customerId,
        date: '2026-02-10',
        startMinutes: 600,
        endMinutes: 825,
        breakMinutes: 0,
        description: 'Umsetzung',
      },
      {
        customerId,
        date: '2026-02-10',
        startMinutes: 900,
        endMinutes: 945,
        breakMinutes: 0,
        description: null,
      },
      {
        customerId,
        date: '2026-02-24',
        startMinutes: 540,
        endMinutes: 690,
        breakMinutes: 0,
        description: 'Konzeption',
      },
    ],
  });
}

describe('Rechnung aus Zeiten', () => {
  it('macht eine Sammelzeile — die Vorgabe', async () => {
    const { id } = await createCustomer();
    await createEntries(id);

    const invoice = await fromTime.create(id);

    expect(invoice.items).toHaveLength(1);
    const [item] = invoice.items;
    expect(item?.description).toBe('Arbeit im Zeitraum 03.02.2026–24.02.2026');
    // 630 Minuten = 10,5 Stunden.
    expect(item?.quantity).toBe(10_500);
    expect(item?.unitPriceCents).toBe(5000);
    expect(item?.lineNetCents).toBe(52_500);
    expect(item?.discountValue).toBe(0);
  });

  it('schreibt Stunden als Einheit, auch für die E-Rechnung', async () => {
    const { id } = await createCustomer();
    await createEntries(id);

    const invoice = await fromTime.create(id);
    expect(invoice.items[0]?.unit).toBe('Std.');
    expect(invoice.items[0]?.unitCode).toBe(UNIT_CODE.HOUR);
  });

  it('übernimmt den Leistungszeitraum aus den Zeiten', async () => {
    const { id } = await createCustomer();
    await createEntries(id);

    const invoice = await fromTime.create(id);
    expect(invoice.serviceDate).toBe('2026-02-03');
    expect(invoice.serviceDateTo).toBe('2026-02-24');
  });

  it('lässt bei einem einzigen Tag das „bis" weg', async () => {
    const { id } = await createCustomer();
    await prisma.timeEntry.create({
      data: {
        customerId: id,
        date: '2026-02-03',
        startMinutes: 540,
        endMinutes: 660,
        breakMinutes: 0,
      },
    });

    const invoice = await fromTime.create(id);
    expect(invoice.serviceDate).toBe('2026-02-03');
    expect(invoice.serviceDateTo).toBeNull();
    expect(invoice.items[0]?.description).toBe('Arbeit am 03.02.2026');
  });

  it('stempelt die Zeiten mit Rechnung und Zeitpunkt', async () => {
    const { id } = await createCustomer();
    await createEntries(id);

    const invoice = await fromTime.create(id);

    const entries = await prisma.timeEntry.findMany({ where: { customerId: id } });
    expect(entries).toHaveLength(5);
    expect(entries.every((entry) => entry.billedAt !== null)).toBe(true);
    expect(entries.every((entry) => entry.invoiceId === invoice.id)).toBe(true);

    // Und sie sind aus der offenen Liste verschwunden.
    const open = await prisma.timeEntry.count({ where: { customerId: id, billedAt: null } });
    expect(open).toBe(0);
  });

  it('übernimmt Steuerprofil und Zahlungsziel des Kunden', async () => {
    const { id, taxProfileId } = await createCustomer({ defaultPaymentTermDays: 30 });
    await createEntries(id);

    const invoice = await fromTime.create(id);
    expect(invoice.taxProfileId).toBe(taxProfileId);
    expect(invoice.items[0]?.taxRateBasisPoints).toBe(1900);
  });

  it('rechnet bei Kleinunternehmern mit 0 %', async () => {
    const profile = await prisma.taxProfile.create({
      data: {
        name: `Kleinunternehmer ${crypto.randomUUID().slice(0, 8)}`,
        kind: TAX_PROFILE_KIND.SMALL_BUSINESS,
        defaultRateBasisPoints: 0,
        noteText: 'Gemäß § 19 UStG wird keine Umsatzsteuer berechnet.',
        taxCategoryCode: 'E',
      },
    });
    const customer = await prisma.customer.create({
      data: {
        companyName: 'Kleiner Kunde',
        street: 'Weg 1',
        postalCode: '10115',
        city: 'Berlin',
        country: 'DE',
        defaultTaxProfileId: profile.id,
        hourlyRateCents: 5000,
      },
    });
    await createEntries(customer.id);

    const invoice = await fromTime.create(customer.id);
    expect(invoice.items[0]?.taxRateBasisPoints).toBe(0);
  });
});

describe('Die Rücknahme', () => {
  it('gibt die Zeiten wieder frei, wenn der Entwurf gelöscht wird', async () => {
    // **Der Test, der wirklich wehtut.** Abgerechnete Zeiten ohne Rechnung
    // sind verlorenes Geld, und es merkt niemand.
    const { id } = await createCustomer();
    await createEntries(id);

    const invoice = await fromTime.create(id);
    expect(await prisma.timeEntry.count({ where: { customerId: id, billedAt: null } })).toBe(0);

    await invoices.deleteDraft(invoice.id);

    const entries = await prisma.timeEntry.findMany({ where: { customerId: id } });
    expect(entries).toHaveLength(5);
    // Beides muss fallen — `billedAt` allein zurückzusetzen hieße, einen
    // Verweis auf eine gelöschte Rechnung stehen zu lassen, und umgekehrt
    // bliebe die Zeit für immer abgerechnet.
    expect(entries.every((entry) => entry.billedAt === null)).toBe(true);
    expect(entries.every((entry) => entry.invoiceId === null)).toBe(true);
  });

  it('lässt Zeiten anderer Rechnungen unberührt', async () => {
    const erster = await createCustomer();
    const zweiter = await createCustomer({ companyName: 'Südwind GmbH' });
    await createEntries(erster.id);
    await createEntries(zweiter.id);

    const ersteRechnung = await fromTime.create(erster.id);
    await fromTime.create(zweiter.id);

    await invoices.deleteDraft(ersteRechnung.id);

    expect(await prisma.timeEntry.count({ where: { customerId: erster.id, billedAt: null } })).toBe(
      5,
    );
    expect(
      await prisma.timeEntry.count({ where: { customerId: zweiter.id, billedAt: null } }),
    ).toBe(0);
  });
});

describe('Die drei Abrechnungsarten', () => {
  it('ergeben auf den Cent dieselbe Summe', async () => {
    // Beweisbar, nicht erhofft: Weil jede Dauer auf dem Viertelstundenraster
    // liegt, ist jede Teilsumme ohne Rest in Stunden darstellbar.
    const summen: number[] = [];

    for (const mode of [BILLING_MODE.SAMMEL, BILLING_MODE.PRO_TAG, BILLING_MODE.PRO_BESCHREIBUNG]) {
      const { id } = await createCustomer();
      await createEntries(id);
      const invoice = await fromTime.create(id, mode);
      summen.push(invoice.totals.netCents);
    }

    expect(summen).toEqual([52_500, 52_500, 52_500]);
  });

  it('erzeugen unterschiedlich viele Positionen', async () => {
    const sammel = await createCustomer();
    await createEntries(sammel.id);
    expect((await fromTime.create(sammel.id, BILLING_MODE.SAMMEL)).items).toHaveLength(1);

    const proTag = await createCustomer();
    await createEntries(proTag.id);
    expect((await fromTime.create(proTag.id, BILLING_MODE.PRO_TAG)).items).toHaveLength(3);

    const proText = await createCustomer();
    await createEntries(proText.id);
    expect((await fromTime.create(proText.id, BILLING_MODE.PRO_BESCHREIBUNG)).items).toHaveLength(
      3,
    );
  });

  it('nehmen die Art des Kunden, wenn keine angegeben ist', async () => {
    const { id } = await createCustomer({ billingMode: BILLING_MODE.PRO_TAG });
    await createEntries(id);

    const invoice = await fromTime.create(id);
    expect(invoice.items).toHaveLength(3);
  });
});

describe('Was schiefgehen kann', () => {
  it('weist ab, wenn keine Zeiten offen sind', async () => {
    const { id } = await createCustomer();
    await expect(fromTime.create(id)).rejects.toThrow(/keine Zeiten offen/u);
  });

  it('weist ab, wenn kein Stundensatz hinterlegt ist', async () => {
    const { id } = await createCustomer({ hourlyRateCents: null });
    await createEntries(id);

    // Kein Entwurf mit 0,00 € — der Fehler nennt das Feld.
    await expect(fromTime.create(id)).rejects.toThrow(/Stundensatz/u);
    // Und die Zeiten sind unberührt.
    expect(await prisma.timeEntry.count({ where: { customerId: id, billedAt: null } })).toBe(5);
  });

  it('fällt auf die Vorgabe der Firma zurück', async () => {
    await prisma.company.update({ where: { id: 1 }, data: { defaultHourlyRateCents: 8000 } });
    const { id } = await createCustomer({ hourlyRateCents: null });
    await createEntries(id);

    const invoice = await fromTime.create(id);
    expect(invoice.items[0]?.unitPriceCents).toBe(8000);
  });

  it('lässt sich nachträglich bearbeiten wie jeder Entwurf', async () => {
    const { id } = await createCustomer();
    await createEntries(id);
    const invoice = await fromTime.create(id);

    // Die Übernahme ist ein Startpunkt, kein Ergebnis.
    const geaendert = await invoices.updateDraft(invoice.id, {
      customerId: id,
      taxProfileId: invoice.taxProfileId,
      buyerData: invoice.buyerData,
      invoiceDate: invoice.invoiceDate,
      serviceDate: invoice.serviceDate,
      serviceDateTo: invoice.serviceDateTo,
      dueDate: invoice.dueDate,
      notes: null,
      footerNote: null,
      internalNotes: null,
      items: [
        {
          description: 'Arbeit an Projekt Nordwind',
          quantity: 40_000,
          unit: 'Std.',
          unitCode: UNIT_CODE.HOUR,
          unitPriceCents: 5000,
          discountType: DISCOUNT_TYPE.PERCENT,
          discountValue: 0,
          taxRateBasisPoints: 1900,
        },
      ],
    } as never);

    expect(geaendert.items).toHaveLength(1);
    expect(geaendert.items[0]?.description).toBe('Arbeit an Projekt Nordwind');
  });
});

describe('Die Vorschau', () => {
  it('sagt vorher, was entsteht', async () => {
    const { id } = await createCustomer();
    await createEntries(id);

    const preview = await fromTime.preview(id);
    expect(preview.itemCount).toBe(1);
    expect(preview.durationMinutes).toBe(630);
    expect(preview.netCents).toBe(52_500);
    expect(preview.rateCents).toBe(5000);
    expect(preview.mode).toBe(BILLING_MODE.SAMMEL);
  });

  it('legt dabei nichts an', async () => {
    const { id } = await createCustomer();
    await createEntries(id);

    await fromTime.preview(id);

    expect(await prisma.invoice.count()).toBe(0);
    expect(await prisma.timeEntry.count({ where: { billedAt: null } })).toBe(5);
  });

  it('zeigt für jede Art denselben Betrag', async () => {
    const { id } = await createCustomer();
    await createEntries(id);

    const sammel = await fromTime.preview(id, BILLING_MODE.SAMMEL);
    const proTag = await fromTime.preview(id, BILLING_MODE.PRO_TAG);
    expect(proTag.netCents).toBe(sammel.netCents);
    expect(proTag.itemCount).toBe(3);
  });
});
