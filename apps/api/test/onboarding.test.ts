import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { afterAll, beforeAll, beforeEach, describe, expect, it } from 'vitest';
import type { PrismaClient } from '@prisma/client';
import { ONBOARDING_STATUS, ONBOARDING_STEP, updateCompanySchema } from '@agentur-tool/shared';
import { StorageConfig } from '../src/common/config.service';
import { FilesService } from '../src/files/files.service';
import { CompanyService } from '../src/company/company.service';
import {
  ONBOARDING_STATUS_SETTING_KEY,
  OnboardingService,
} from '../src/onboarding/onboarding.service';
import { createTestDatabase, resetInvoices, type TestDatabase } from './database.helper';

let db: TestDatabase;
let prisma: PrismaClient;
let onboarding: OnboardingService;
let dataDir: string;

beforeAll(async () => {
  db = await createTestDatabase();
  prisma = db.prisma;
});

afterAll(async () => {
  await db.cleanup();
  fs.rmSync(dataDir, { recursive: true, force: true });
});

beforeEach(async () => {
  dataDir = fs.mkdtempSync(path.join(os.tmpdir(), 'agentur-tool-data-'));
  const storage = new StorageConfig({ get: () => dataDir } as never);
  const company = new CompanyService(prisma, new FilesService(prisma, storage));
  onboarding = new OnboardingService(prisma, company);

  await resetInvoices(prisma);
  await prisma.timeEntry.deleteMany();
  await prisma.customer.deleteMany();
  await prisma.company.deleteMany();
  await prisma.appSetting.deleteMany();
});

const vollstaendig = {
  companyName: 'Beispiel Agentur',
  street: 'Musterweg 1',
  postalCode: '10115',
  city: 'Berlin',
  country: 'DE',
  email: 'rechnung@example.com',
  website: '',
  phone: '030 123456',
  vatId: 'DE123456789',
  taxNumber: '',
  bankAccountHolder: 'Beispiel Agentur',
  iban: 'DE02 1203 0000 0000 2020 51',
  bic: 'BYLADEM1001',
  bankName: 'Beispielbank',
  electronicAddress: 'rechnung@example.com',
  electronicAddressScheme: 'EM',
  defaultPaymentTermDays: '14',
  defaultHourlyRateCents: '85',
};

async function saveCompany(overrides: Record<string, unknown> = {}): Promise<void> {
  const company = new CompanyService(
    prisma,
    new FilesService(prisma, new StorageConfig({ get: () => dataDir } as never)),
  );
  await company.update(updateCompanySchema.parse({ ...vollstaendig, ...overrides }));
}

describe('Zustand der Einrichtung', () => {
  it('steht auf offen, solange niemand etwas entschieden hat', async () => {
    const state = await onboarding.state();
    expect(state.status).toBe(ONBOARDING_STATUS.OPEN);
    expect(state.steps.every((step) => !step.done)).toBe(true);
  });

  it('merkt sich Überspringen und Abschließen', async () => {
    expect((await onboarding.setStatus(ONBOARDING_STATUS.SKIPPED)).status).toBe(
      ONBOARDING_STATUS.SKIPPED,
    );
    expect((await onboarding.state()).status).toBe(ONBOARDING_STATUS.SKIPPED);

    await onboarding.setStatus(ONBOARDING_STATUS.DONE);
    expect((await onboarding.state()).status).toBe(ONBOARDING_STATUS.DONE);
  });

  it('fällt bei einem verbogenen Wert auf offen zurück', async () => {
    // Von Hand in der Datenbank geändert. Ein Fehler an dieser Stelle wäre
    // die falsche Antwort — die Einrichtung ist nichts, woran die Anwendung
    // scheitern darf.
    await prisma.appSetting.create({
      data: { key: ONBOARDING_STATUS_SETTING_KEY, value: 'VIELLEICHT' },
    });
    expect((await onboarding.state()).status).toBe(ONBOARDING_STATUS.OPEN);
  });

  it('leitet die erledigten Schritte aus den Firmendaten ab', async () => {
    await saveCompany();
    const steps = await onboarding.state().then((state) => state.steps);

    const byId = new Map(steps.map((step) => [step.id, step.done]));
    expect(byId.get(ONBOARDING_STEP.COMPANY)).toBe(true);
    expect(byId.get(ONBOARDING_STEP.TAX)).toBe(true);
    expect(byId.get(ONBOARDING_STEP.BANK)).toBe(true);
    expect(byId.get(ONBOARDING_STEP.DEFAULTS)).toBe(true);
    // Ohne Logo bleibt der Darstellungsschritt offen — er ist freiwillig.
    expect(byId.get(ONBOARDING_STEP.APPEARANCE)).toBe(false);
  });

  it('zieht einen Schritt zurück, wenn seine Angabe wieder verschwindet', async () => {
    await saveCompany();
    await saveCompany({ iban: '' });

    const steps = await onboarding.state().then((state) => state.steps);
    expect(steps.find((step) => step.id === ONBOARDING_STEP.BANK)?.done).toBe(false);
  });

  it('nennt, was für Rechnung und XRechnung noch fehlt', async () => {
    const leer = await onboarding.state();
    expect(leer.missingForInvoice).toContain('companyName');
    expect(leer.missingForInvoice).toContain('vatIdOrTaxNumber');
    expect(leer.missingForEinvoice.map((problem) => problem.field)).toContain('seller.iban');

    await saveCompany();
    const gefuellt = await onboarding.state();
    expect(gefuellt.missingForInvoice).toEqual([]);
    expect(gefuellt.missingForEinvoice).toEqual([]);
  });
});

describe('Leere Datenbank', () => {
  it('gilt trotz der Grunddaten aus dem Seed als leer', async () => {
    // Firmendaten, Steuerprofile und Mail-Vorlagen legt der Seed in jeder
    // Installation an. Zählte man sie mit, wäre keine Datenbank je leer.
    await saveCompany();
    expect((await onboarding.state()).fresh).toBe(true);
  });

  it('gilt als benutzt, sobald ein Kunde angelegt ist', async () => {
    await prisma.customer.create({ data: { companyName: 'Hanse Handels GmbH' } });
    expect((await onboarding.state()).fresh).toBe(false);
  });

  it('gilt als benutzt, sobald ein Zeiteintrag erfasst ist', async () => {
    const customer = await prisma.customer.create({ data: { companyName: 'Hanse Handels GmbH' } });
    await prisma.timeEntry.create({
      data: {
        date: '2026-09-14',
        customerId: customer.id,
        startMinutes: 540,
        endMinutes: 600,
        breakMinutes: 0,
      },
    });
    expect((await onboarding.state()).fresh).toBe(false);
  });
});
