import { afterAll, beforeAll, beforeEach, describe, expect, it } from 'vitest';
import type { PrismaClient } from '@prisma/client';
import { CUSTOMER_ARCHIVE_FILTER, customerInputSchema } from '@agentur-tool/shared';
import { CustomersService } from '../src/customers/customers.service';
import { ApiError } from '../src/common/api-error';
import { createTestDatabase, type TestDatabase } from './database.helper';

let db: TestDatabase;
let prisma: PrismaClient;
let customers: CustomersService;

beforeAll(async () => {
  db = await createTestDatabase();
  prisma = db.prisma;
  customers = new CustomersService(prisma);
});

afterAll(async () => {
  await db.cleanup();
});

beforeEach(async () => {
  await prisma.invoice.deleteMany();
  await prisma.customer.deleteMany();
});

function input(overrides: Record<string, unknown> = {}) {
  return customerInputSchema.parse({
    customerNumber: '',
    companyName: 'Kunde GmbH',
    contactName: '',
    addressLine: '',
    street: 'Kundenstr. 5',
    postalCode: '20095',
    city: 'Hamburg',
    country: 'DE',
    email: '',
    vatId: '',
    notes: '',
    defaultPaymentTermDays: '',
    defaultTaxProfileId: '',
    ...overrides,
  });
}

const ACTIVE = { archived: CUSTOMER_ARCHIVE_FILTER.ACTIVE } as const;

describe('Anlegen und Ändern', () => {
  it('legt einen Kunden an und liest ihn zurück', async () => {
    const created = await customers.create(input({ companyName: 'Beispiel AG' }));
    expect(created.companyName).toBe('Beispiel AG');
    expect(created.archivedAt).toBeNull();
    expect(created.invoiceCount).toBe(0);

    expect((await customers.findById(created.id)).companyName).toBe('Beispiel AG');
  });

  it('meldet einen unbekannten Kunden als nicht gefunden', async () => {
    await expect(customers.findById(999_999)).rejects.toBeInstanceOf(ApiError);
  });

  it('ändert einen bestehenden Kunden', async () => {
    const created = await customers.create(input());
    const updated = await customers.update(created.id, input({ city: 'Bremen' }));
    expect(updated.city).toBe('Bremen');
  });
});

describe('Kundennummer', () => {
  it('erlaubt beliebig viele Kunden ohne Nummer', async () => {
    await customers.create(input({ companyName: 'A' }));
    await customers.create(input({ companyName: 'B' }));
    expect((await customers.list(ACTIVE)).length).toBe(2);
  });

  it('meldet eine doppelte Nummer als Feldfehler statt als Serverfehler', async () => {
    await customers.create(input({ companyName: 'A', customerNumber: 'K-1' }));

    // Ohne die Übersetzung käme hier ein roher Prisma-Fehler als 500 heraus,
    // obwohl es eine ganz gewöhnliche Eingabekorrektur ist.
    await expect(
      customers.create(input({ companyName: 'B', customerNumber: 'K-1' })),
    ).rejects.toMatchObject({
      code: 'VALIDATION_FAILED',
      details: [{ field: 'customerNumber' }],
    });
  });

  it('meldet eine doppelte Nummer auch beim Ändern', async () => {
    await customers.create(input({ companyName: 'A', customerNumber: 'K-1' }));
    const second = await customers.create(input({ companyName: 'B', customerNumber: 'K-2' }));

    await expect(
      customers.update(second.id, input({ companyName: 'B', customerNumber: 'K-1' })),
    ).rejects.toMatchObject({ code: 'VALIDATION_FAILED' });
  });
});

describe('Suche', () => {
  beforeEach(async () => {
    await customers.create(
      input({ companyName: 'Nordwind Logistik', city: 'Hamburg', customerNumber: 'K-100' }),
    );
    await customers.create(
      input({ companyName: 'Südlicht Studio', city: 'München', contactName: 'Alex Beispiel' }),
    );
    await customers.create(
      input({ companyName: 'Ostwind Verlag', city: 'Berlin', email: 'buchhaltung@ostwind.de' }),
    );
  });

  it('findet über den Firmennamen', async () => {
    const found = await customers.list({ ...ACTIVE, q: 'wind' });
    expect(found.map((c) => c.companyName).sort()).toEqual(['Nordwind Logistik', 'Ostwind Verlag']);
  });

  it('ignoriert Groß- und Kleinschreibung', async () => {
    expect((await customers.list({ ...ACTIVE, q: 'NORDWIND' })).length).toBe(1);
    expect((await customers.list({ ...ACTIVE, q: 'nordwind' })).length).toBe(1);
  });

  it('findet über Ort, Kundennummer, Ansprechpartner und E-Mail', async () => {
    expect((await customers.list({ ...ACTIVE, q: 'München' }))[0]?.companyName).toBe(
      'Südlicht Studio',
    );
    expect((await customers.list({ ...ACTIVE, q: 'K-100' }))[0]?.companyName).toBe(
      'Nordwind Logistik',
    );
    expect((await customers.list({ ...ACTIVE, q: 'Alex' }))[0]?.companyName).toBe(
      'Südlicht Studio',
    );
    expect((await customers.list({ ...ACTIVE, q: 'ostwind.de' }))[0]?.companyName).toBe(
      'Ostwind Verlag',
    );
  });

  it('liefert bei fehlendem Treffer eine leere Liste', async () => {
    expect(await customers.list({ ...ACTIVE, q: 'gibtesnicht' })).toEqual([]);
  });

  it('sortiert alphabetisch', async () => {
    const all = await customers.list(ACTIVE);
    expect(all.map((c) => c.companyName)).toEqual([
      'Nordwind Logistik',
      'Ostwind Verlag',
      'Südlicht Studio',
    ]);
  });
});

describe('Archivieren', () => {
  it('nimmt archivierte Kunden aus der aktiven Liste', async () => {
    const created = await customers.create(input({ companyName: 'Altkunde' }));
    await customers.archive(created.id);

    expect(await customers.list(ACTIVE)).toEqual([]);
    expect(
      (await customers.list({ archived: CUSTOMER_ARCHIVE_FILTER.ARCHIVED })).map(
        (c) => c.companyName,
      ),
    ).toEqual(['Altkunde']);
    expect((await customers.list({ archived: CUSTOMER_ARCHIVE_FILTER.ALL })).length).toBe(1);
  });

  it('macht das Archivieren rückgängig', async () => {
    const created = await customers.create(input());
    await customers.archive(created.id);
    const restored = await customers.unarchive(created.id);

    expect(restored.archivedAt).toBeNull();
    expect((await customers.list(ACTIVE)).length).toBe(1);
  });
});

describe('Endgültiges Löschen', () => {
  it('löscht einen Kunden ohne Rechnungen', async () => {
    const created = await customers.create(input());
    await customers.deletePermanently(created.id);
    expect(await prisma.customer.count()).toBe(0);
  });

  it('verweigert das Löschen, sobald eine Rechnung existiert', async () => {
    // Der eigentliche Schutz: Eine Rechnung ohne Kundenbezug verlöre ihren
    // Anknüpfungspunkt für Filter und Auswertungen.
    const created = await customers.create(input());
    await prisma.invoice.create({
      data: {
        customerId: created.id,
        invoiceDate: '2026-03-01',
        serviceDate: '2026-02-28',
        dueDate: '2026-03-15',
      },
    });

    await expect(customers.deletePermanently(created.id)).rejects.toBeInstanceOf(ApiError);
    expect(await prisma.customer.count()).toBe(1);
  });

  it('weist die Rechnungsanzahl aus, damit die Oberfläche das Löschen ausblenden kann', async () => {
    const created = await customers.create(input());
    await prisma.invoice.create({
      data: {
        customerId: created.id,
        invoiceDate: '2026-03-01',
        serviceDate: '2026-02-28',
        dueDate: '2026-03-15',
      },
    });

    expect((await customers.findById(created.id)).invoiceCount).toBe(1);
  });
});
