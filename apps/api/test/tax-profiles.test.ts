import { afterAll, beforeAll, beforeEach, describe, expect, it } from 'vitest';
import type { PrismaClient } from '@prisma/client';
import { TAX_PROFILE_KIND, taxProfileInputSchema } from '@privatura/shared';
import { TaxProfilesService } from '../src/tax-profiles/tax-profiles.service';
import { CustomersService } from '../src/customers/customers.service';
import { ApiError } from '../src/common/api-error';
import { verifyConstraints } from '../prisma/verify-constraints';
import { createTestDatabase, type TestDatabase } from './database.helper';

let db: TestDatabase;
let prisma: PrismaClient;
let taxProfiles: TaxProfilesService;
let customers: CustomersService;

beforeAll(async () => {
  db = await createTestDatabase();
  prisma = db.prisma;
  taxProfiles = new TaxProfilesService(prisma);
  customers = new CustomersService(prisma);
});

afterAll(async () => {
  await db.cleanup();
});

beforeEach(async () => {
  await prisma.invoice.deleteMany();
  await prisma.customer.deleteMany();
  await prisma.taxProfile.deleteMany();
});

function input(overrides: Record<string, unknown> = {}) {
  return taxProfileInputSchema.parse({
    name: 'Deutschland 19 %',
    kind: TAX_PROFILE_KIND.STANDARD,
    defaultRateBasisPoints: '19',
    noteText: '',
    showTaxColumn: true,
    isDefault: false,
    sortOrder: 0,
    ...overrides,
  });
}

describe('Anlegen und Ändern', () => {
  it('legt ein Profil an und rechnet den Satz in Basispunkte um', async () => {
    const created = await taxProfiles.create(input({ defaultRateBasisPoints: '7,5' }));
    expect(created.defaultRateBasisPoints).toBe(750);
    expect(created.archivedAt).toBeNull();
  });

  it('meldet einen doppelten Namen als Feldfehler', async () => {
    await taxProfiles.create(input());
    await expect(taxProfiles.create(input())).rejects.toMatchObject({
      code: 'VALIDATION_FAILED',
      details: [{ field: 'name' }],
    });
  });

  it('sortiert nach Reihenfolge, dann nach Namen', async () => {
    await taxProfiles.create(input({ name: 'Zweitens', sortOrder: 20 }));
    await taxProfiles.create(input({ name: 'Erstens', sortOrder: 10 }));
    await taxProfiles.create(input({ name: 'Auch zwanzig', sortOrder: 20 }));

    const list = await taxProfiles.list({ includeArchived: false });
    expect(list.map((p) => p.name)).toEqual(['Erstens', 'Auch zwanzig', 'Zweitens']);
  });
});

describe('Standardprofil', () => {
  it('lässt nur ein Standardprofil zu', async () => {
    const first = await taxProfiles.create(input({ name: 'Erstes', isDefault: true }));
    const second = await taxProfiles.create(input({ name: 'Zweites', isDefault: true }));

    // Der Service muss den bisherigen Standard zurücksetzen, sonst greift der
    // partielle Unique-Index und das Anlegen scheitert.
    expect(second.isDefault).toBe(true);
    expect((await taxProfiles.findById(first.id)).isDefault).toBe(false);
    expect((await taxProfiles.findDefault())?.id).toBe(second.id);
  });

  it('wechselt den Standard auch beim Ändern', async () => {
    const first = await taxProfiles.create(input({ name: 'Erstes', isDefault: true }));
    const second = await taxProfiles.create(input({ name: 'Zweites' }));

    await taxProfiles.update(second.id, input({ name: 'Zweites', isDefault: true }));

    expect((await taxProfiles.findById(first.id)).isDefault).toBe(false);
    expect((await taxProfiles.findById(second.id)).isDefault).toBe(true);
  });

  it('wird durch den Unique-Index abgesichert', async () => {
    // Absicherung gegen einen Fehler im Service: Zwei Standardprofile per
    // Roh-SQL zu setzen muss die Datenbank verweigern.
    const first = await taxProfiles.create(input({ name: 'Erstes', isDefault: true }));
    const second = await taxProfiles.create(input({ name: 'Zweites' }));

    await expect(
      prisma.$executeRawUnsafe(`UPDATE "TaxProfile" SET "isDefault" = 1 WHERE "id" = ?`, second.id),
    ).rejects.toThrow();
    expect((await taxProfiles.findById(first.id)).isDefault).toBe(true);
  });

  it('lässt den Standard auch wieder abwählen', async () => {
    const profile = await taxProfiles.create(input({ isDefault: true }));
    await taxProfiles.update(profile.id, input({ isDefault: false }));
    expect(await taxProfiles.findDefault()).toBeNull();
  });
});

describe('Archivieren', () => {
  it('blendet archivierte Profile aus der Auswahl aus', async () => {
    const profile = await taxProfiles.create(input());
    await taxProfiles.archive(profile.id);

    expect(await taxProfiles.list({ includeArchived: false })).toEqual([]);
    expect((await taxProfiles.list({ includeArchived: true })).length).toBe(1);
  });

  it('lässt beim Archivieren des Standards das nächste Profil nachrücken', async () => {
    // Ohne das stünde die Anwendung ohne Vorgabe da, und das
    // Rechnungsformular hätte nichts vorzuschlagen.
    const standard = await taxProfiles.create(
      input({ name: 'Standard', sortOrder: 10, isDefault: true }),
    );
    await taxProfiles.create(input({ name: 'Ersatz', sortOrder: 20 }));

    await taxProfiles.archive(standard.id);

    const nowDefault = await taxProfiles.findDefault();
    expect(nowDefault?.name).toBe('Ersatz');
    expect((await taxProfiles.findById(standard.id)).isDefault).toBe(false);
  });

  it('kommt ohne Nachrücker zurecht', async () => {
    const only = await taxProfiles.create(input({ isDefault: true }));
    await taxProfiles.archive(only.id);
    expect(await taxProfiles.findDefault()).toBeNull();
  });

  it('macht das Archivieren rückgängig', async () => {
    const profile = await taxProfiles.create(input());
    await taxProfiles.archive(profile.id);
    expect((await taxProfiles.unarchive(profile.id)).archivedAt).toBeNull();
  });
});

describe('Endgültiges Löschen', () => {
  it('löscht ein unbenutztes Profil', async () => {
    const profile = await taxProfiles.create(input());
    await taxProfiles.deletePermanently(profile.id);
    expect(await prisma.taxProfile.count()).toBe(0);
  });

  it('verweigert das Löschen bei Verwendung in einer Rechnung', async () => {
    const profile = await taxProfiles.create(input());
    await prisma.invoice.create({
      data: {
        taxProfileId: profile.id,
        invoiceDate: '2026-03-01',
        serviceDate: '2026-02-28',
        dueDate: '2026-03-15',
      },
    });

    await expect(taxProfiles.deletePermanently(profile.id)).rejects.toBeInstanceOf(ApiError);
  });

  it('verweigert das Löschen bei Verwendung als Kundenvorgabe', async () => {
    // Ein Entwurf oder eine Kundenvorgabe verlöre sonst still ihre Zuordnung,
    // weil der Fremdschlüssel auf null gesetzt würde.
    const profile = await taxProfiles.create(input());
    await prisma.customer.create({
      data: { companyName: 'Kunde', defaultTaxProfileId: profile.id },
    });

    await expect(taxProfiles.deletePermanently(profile.id)).rejects.toBeInstanceOf(ApiError);
    expect((await taxProfiles.findById(profile.id)).customerCount).toBe(1);
  });
});

describe('Verknüpfung mit Kunden', () => {
  it('speichert das Standard-Steuerprofil am Kunden', async () => {
    const profile = await taxProfiles.create(input());
    const customer = await customers.create({
      customerNumber: null,
      companyName: 'Kunde GmbH',
      contactName: null,
      addressLine: null,
      street: '',
      postalCode: '',
      city: '',
      country: 'DE',
      email: null,
      vatId: null,
      notes: null,
      defaultPaymentTermDays: null,
      defaultTaxProfileId: profile.id,
    });

    expect(customer.defaultTaxProfileId).toBe(profile.id);
  });

  it('lehnt ein unbekanntes Steuerprofil am Feld ab', async () => {
    // Ohne die Vorabprüfung käme ein Fremdschlüsselfehler als Serverfehler
    // beim Benutzer an statt als Hinweis am Auswahlfeld.
    await expect(
      customers.create({
        customerNumber: null,
        companyName: 'Kunde GmbH',
        contactName: null,
        addressLine: null,
        street: '',
        postalCode: '',
        city: '',
        country: 'DE',
        email: null,
        vatId: null,
        notes: null,
        defaultPaymentTermDays: null,
        defaultTaxProfileId: 999_999,
      }),
    ).rejects.toMatchObject({
      code: 'VALIDATION_FAILED',
      details: [{ field: 'defaultTaxProfileId' }],
    });
  });
});

describe('Absicherung der Integritätsregeln', () => {
  it('findet nach der Folgemigration weiterhin alle Regeln', async () => {
    const result = await verifyConstraints(prisma);
    expect(result.missingChecks).toEqual([]);
    expect(result.missingTriggers).toEqual([]);
    expect(result.missingIndexes).toEqual([]);
  });

  it('meldet eine verlorene Regel, statt sie zu übersehen', async () => {
    // Der eigentliche Zweck von db:verify: Prisma kann handgeschriebene
    // Regeln bei einer Migration stillschweigend verwerfen. Hier wird der
    // Verlust absichtlich herbeigeführt, um zu zeigen, dass er auffällt.
    await prisma.$executeRawUnsafe('DROP INDEX "TaxProfile_single_default"');
    try {
      const result = await verifyConstraints(prisma);
      expect(result.ok).toBe(false);
      expect(result.missingIndexes).toContain('TaxProfile_single_default');
    } finally {
      await prisma.$executeRawUnsafe(
        'CREATE UNIQUE INDEX "TaxProfile_single_default" ON "TaxProfile"("isDefault") WHERE "isDefault" = 1',
      );
    }

    expect((await verifyConstraints(prisma)).ok).toBe(true);
  });
});
