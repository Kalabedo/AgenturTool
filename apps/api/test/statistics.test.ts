import { afterAll, beforeAll, beforeEach, describe, expect, it } from 'vitest';
import type { PrismaClient } from '@prisma/client';
import {
  CURRENT_SNAPSHOT_VERSION,
  DOCUMENT_TYPE,
  INVOICE_STATUS,
  TAX_PROFILE_KIND,
  toIsoDate,
} from '@privatura/shared';
import { StatisticsService } from '../src/statistics/statistics.service';
import { createTestDatabase, resetInvoices, type TestDatabase } from './database.helper';

/**
 * Die kleine Auswertung über echte Zeilen.
 *
 * Geprüft wird gegen von Hand gerechnete Beträge — eine Auswertung, die sich
 * selbst bestätigt, prüft nichts.
 */
let db: TestDatabase;
let prisma: PrismaClient;
let service: StatisticsService;

beforeAll(async () => {
  db = await createTestDatabase();
  prisma = db.prisma;
  service = new StatisticsService(prisma);
});

afterAll(async () => {
  await db.cleanup();
});

beforeEach(async () => {
  await resetInvoices(prisma);
  await prisma.timeEntry.deleteMany();
  await prisma.customer.deleteMany();
  await prisma.company.deleteMany();
});

let seq = 0;
async function issued(options: {
  netCents: number;
  invoiceDate: string;
  dueDate?: string;
  status?: string;
  documentType?: string;
  customerName?: string;
  customerId?: number;
}): Promise<void> {
  seq += 1;
  const grossCents = Math.round(options.netCents * 1.19);
  await prisma.invoice.create({
    data: {
      documentType: options.documentType ?? DOCUMENT_TYPE.INVOICE,
      status: options.status ?? INVOICE_STATUS.ISSUED,
      number: `${options.invoiceDate.slice(0, 4)}-${String(seq).padStart(3, '0')}`,
      numberYear: Number(options.invoiceDate.slice(0, 4)),
      numberSeq: seq,
      invoiceDate: options.invoiceDate,
      serviceDate: options.invoiceDate,
      dueDate: options.dueDate ?? options.invoiceDate,
      issuedAt: new Date(),
      customerId: options.customerId ?? null,
      buyerData: JSON.stringify({
        snapshotVersion: CURRENT_SNAPSHOT_VERSION,
        companyName: options.customerName ?? 'Acme GmbH',
        address: { street: '', postalCode: '', city: '', country: 'DE' },
      }),
      totalNetCents: options.netCents,
      totalTaxCents: grossCents - options.netCents,
      totalGrossCents: grossCents,
      taxProfileKind: TAX_PROFILE_KIND.STANDARD,
    },
  });
}

const YEAR_2026 = { from: toIsoDate('2026-01-01'), to: toIsoDate('2026-12-31') };

describe('Umsatz im Zeitraum', () => {
  it('summiert netto und brutto der ausgestellten Belege', async () => {
    await issued({ netCents: 100_000, invoiceDate: '2026-02-10' });
    await issued({ netCents: 250_000, invoiceDate: '2026-03-05' });

    const result = await service.summary(YEAR_2026, '2026-06-01');

    expect(result.totalNetCents).toBe(350_000);
    // 119.000 + 297.500 — brutto wird nicht aus der Nettosumme gerechnet,
    // sondern aus den eingefrorenen Beträgen der einzelnen Belege.
    expect(result.totalGrossCents).toBe(416_500);
    expect(result.totalCount).toBe(2);
  });

  it('lässt Entwürfe außen vor', async () => {
    await issued({ netCents: 100_000, invoiceDate: '2026-02-10' });
    await prisma.invoice.create({
      data: {
        invoiceDate: '2026-02-11',
        serviceDate: '2026-02-11',
        dueDate: '2026-02-25',
        totalNetCents: 900_000,
      },
    });

    const result = await service.summary(YEAR_2026, '2026-06-01');

    expect(result.totalNetCents).toBe(100_000);
  });

  it('zieht ein Storno ab', async () => {
    await issued({ netCents: 300_000, invoiceDate: '2026-02-10' });
    await issued({
      netCents: -100_000,
      invoiceDate: '2026-03-01',
      documentType: DOCUMENT_TYPE.CANCELLATION,
    });

    const result = await service.summary(YEAR_2026, '2026-06-01');

    expect(result.totalNetCents).toBe(200_000);
  });

  it('achtet die Zeitraumgrenzen beidseitig', async () => {
    await issued({ netCents: 100_000, invoiceDate: '2025-12-31' });
    await issued({ netCents: 200_000, invoiceDate: '2026-01-01' });
    await issued({ netCents: 400_000, invoiceDate: '2026-12-31' });
    await issued({ netCents: 800_000, invoiceDate: '2027-01-01' });

    const result = await service.summary(YEAR_2026, '2026-06-01');

    expect(result.totalNetCents).toBe(600_000);
  });
});

describe('Einteilung', () => {
  it('fasst nach Monat, Quartal und Jahr zusammen', async () => {
    await issued({ netCents: 100_000, invoiceDate: '2026-02-10' });
    await issued({ netCents: 200_000, invoiceDate: '2026-02-20' });
    await issued({ netCents: 400_000, invoiceDate: '2026-05-05' });

    const result = await service.summary(YEAR_2026, '2026-06-01');

    expect(result.byMonth).toHaveLength(2);
    expect(result.byMonth[0]).toMatchObject({
      key: '2026-02',
      label: 'Februar 2026',
      netCents: 300_000,
      count: 2,
    });

    expect(result.byQuarter.map((entry) => entry.key)).toEqual(['2026-Q1', '2026-Q2']);
    expect(result.byQuarter[1]).toMatchObject({ label: '2. Quartal 2026', netCents: 400_000 });

    expect(result.byYear).toHaveLength(1);
    expect(result.byYear[0]).toMatchObject({ key: '2026', netCents: 700_000 });
  });

  it('gruppiert je Kunde nach dem eingefrorenen Namen und sortiert absteigend', async () => {
    await issued({ netCents: 100_000, invoiceDate: '2026-02-10', customerName: 'Klein GmbH' });
    await issued({ netCents: 500_000, invoiceDate: '2026-03-10', customerName: 'Groß AG' });
    await issued({ netCents: 200_000, invoiceDate: '2026-04-10', customerName: 'Groß AG' });

    const result = await service.summary(YEAR_2026, '2026-06-01');

    expect(result.byCustomer[0]).toMatchObject({
      customerName: 'Groß AG',
      netCents: 700_000,
      count: 2,
    });
    expect(result.byCustomer[1]).toMatchObject({ customerName: 'Klein GmbH', netCents: 100_000 });
  });
});

describe('Offene Posten', () => {
  it('trennt offen von überfällig nach derselben Regel wie die Rechnungsliste', async () => {
    // Ausgestellt, Fälligkeit vorbei -> überfällig.
    await issued({ netCents: 100_000, invoiceDate: '2026-01-10', dueDate: '2026-01-24' });
    // Ausgestellt, noch nicht fällig -> offen, aber nicht überfällig.
    await issued({ netCents: 200_000, invoiceDate: '2026-05-10', dueDate: '2026-12-01' });
    // Bezahlt -> weder offen noch überfällig.
    await issued({
      netCents: 400_000,
      invoiceDate: '2026-02-10',
      dueDate: '2026-02-24',
      status: INVOICE_STATUS.PAID,
    });

    const result = await service.summary(YEAR_2026, '2026-06-01');

    expect(result.openItems.openCount).toBe(2);
    expect(result.openItems.openNetCents).toBe(300_000);
    expect(result.openItems.overdueCount).toBe(1);
    expect(result.openItems.overdueNetCents).toBe(100_000);
  });
});

describe('Stunden', () => {
  async function customer(): Promise<number> {
    const row = await prisma.customer.create({ data: { companyName: 'Acme GmbH' } });
    return row.id;
  }

  it('trennt abgerechnete von offenen Minuten und zieht die Pause ab', async () => {
    const customerId = await customer();
    await prisma.timeEntry.createMany({
      data: [
        // 4 Stunden minus 30 Minuten Pause = 210 Minuten, offen.
        { date: '2026-02-10', customerId, startMinutes: 540, endMinutes: 780, breakMinutes: 30 },
        // 2 Stunden, abgerechnet.
        {
          date: '2026-02-11',
          customerId,
          startMinutes: 540,
          endMinutes: 660,
          breakMinutes: 0,
          billedAt: new Date(),
        },
      ],
    });

    const result = await service.summary(YEAR_2026, '2026-06-01');

    expect(result.hours.openMinutes).toBe(210);
    expect(result.hours.billedMinutes).toBe(120);
  });

  /**
   * Der Punkt, an dem die Seite ehrlich bleiben muss: Ein Zeiteintrag trägt
   * keinen Stundensatz. Ohne hinterlegten Satz gibt es keinen Betrag — und
   * `null` ist etwas anderes als 0 €.
   */
  it('schätzt den Wert offener Stunden nur bei hinterlegtem Stundensatz', async () => {
    const customerId = await customer();
    await prisma.timeEntry.create({
      data: { date: '2026-02-10', customerId, startMinutes: 540, endMinutes: 660 },
    });

    const ohneSatz = await service.summary(YEAR_2026, '2026-06-01');
    expect(ohneSatz.hours.openEstimatedCents).toBeNull();
    expect(ohneSatz.hours.hourlyRateCents).toBeNull();

    await prisma.company.create({
      data: { id: 1, companyName: 'XYZ', defaultHourlyRateCents: 12_000 },
    });

    const mitSatz = await service.summary(YEAR_2026, '2026-06-01');
    // 2 Stunden zu 120,00 € = 240,00 €.
    expect(mitSatz.hours.openEstimatedCents).toBe(24_000);
    expect(mitSatz.hours.hourlyRateCents).toBe(12_000);
  });
});
