import { afterAll, beforeAll, beforeEach, describe, expect, it } from 'vitest';
import type { PrismaClient } from '@prisma/client';
import {
  DEFAULT_SMALL_BUSINESS_LIMITS,
  DOCUMENT_TYPE,
  INVOICE_STATUS,
  SMALL_BUSINESS_LIMITS_SETTING_KEY,
  SMALL_BUSINESS_STATE,
  TAX_PROFILE_KIND,
} from '@privatura/shared';
import { SmallBusinessService } from '../src/small-business/small-business.service';
import { createTestDatabase, resetInvoices, type TestDatabase } from './database.helper';

/**
 * Die Kleinunternehmergrenze über echte Rechnungen.
 *
 * Geprüft wird die Summierung — also das, was die reinen Funktionen in
 * `packages/shared` nicht prüfen können: dass nur ausgestellte
 * Kleinunternehmer-Rechnungen des richtigen Jahres zählen und ein Storno
 * sich abzieht.
 */
let db: TestDatabase;
let prisma: PrismaClient;
let service: SmallBusinessService;

beforeAll(async () => {
  db = await createTestDatabase();
  prisma = db.prisma;
  service = new SmallBusinessService(prisma);
});

afterAll(async () => {
  await db.cleanup();
});

beforeEach(async () => {
  await resetInvoices(prisma);
  await prisma.appSetting.deleteMany();
  await prisma.taxProfile.deleteMany();
});

async function smallBusinessProfile(): Promise<number> {
  const profile = await prisma.taxProfile.create({
    data: {
      name: 'Kleinunternehmer (§ 19 UStG)',
      kind: TAX_PROFILE_KIND.SMALL_BUSINESS,
      defaultRateBasisPoints: 0,
      noteText: 'Gemäß § 19 UStG wird keine Umsatzsteuer berechnet.',
      showTaxColumn: false,
    },
  });
  return profile.id;
}

/**
 * Eine ausgestellte Rechnung samt ihren abgeleiteten Spalten.
 *
 * Die Spalten entstehen sonst beim Finalisieren; hier werden sie direkt
 * gesetzt, weil geprüft werden soll, was die Auswertung aus ihnen macht —
 * nicht, wie sie dorthin kommen. Das prüft invoice-totals-columns.test.ts.
 */
let seq = 0;
async function issued(options: {
  netCents: number;
  invoiceDate?: string;
  kind?: string;
  documentType?: string;
}): Promise<void> {
  seq += 1;
  const invoiceDate = options.invoiceDate ?? '2026-05-01';
  await prisma.invoice.create({
    data: {
      documentType: options.documentType ?? DOCUMENT_TYPE.INVOICE,
      status: INVOICE_STATUS.ISSUED,
      number: `${invoiceDate.slice(0, 4)}-${String(seq).padStart(3, '0')}`,
      numberYear: Number(invoiceDate.slice(0, 4)),
      numberSeq: seq,
      invoiceDate,
      serviceDate: invoiceDate,
      dueDate: invoiceDate,
      issuedAt: new Date(),
      totalNetCents: options.netCents,
      totalTaxCents: 0,
      totalGrossCents: options.netCents,
      taxProfileKind: options.kind ?? TAX_PROFILE_KIND.SMALL_BUSINESS,
    },
  });
}

describe('Umsatz gegen die Grenze', () => {
  it('meldet sich gar nicht, wenn es kein Kleinunternehmerprofil gibt', async () => {
    const status = await service.status(new Date('2026-06-01T00:00:00Z'));

    // Der Seed liefert das Profil bewusst nicht mit. Wer die Regelung nicht
    // nutzt, soll von ihr auch nichts lesen.
    expect(status.applicable).toBe(false);
  });

  it('summiert die ausgestellten Rechnungen des laufenden Jahres', async () => {
    await smallBusinessProfile();
    await issued({ netCents: 3_000_000 });
    await issued({ netCents: 2_000_000 });

    const status = await service.status(new Date('2026-06-01T00:00:00Z'));

    expect(status.applicable).toBe(true);
    expect(status.current.year).toBe(2026);
    expect(status.current.revenueCents).toBe(5_000_000);
    expect(status.current.state).toBe(SMALL_BUSINESS_STATE.RUHIG);
  });

  it('trennt die Jahre und stellt das Vorjahr seiner eigenen Grenze gegenüber', async () => {
    await smallBusinessProfile();
    await issued({ netCents: 2_000_000, invoiceDate: '2025-11-01' });
    await issued({ netCents: 4_000_000, invoiceDate: '2026-02-01' });

    const status = await service.status(new Date('2026-06-01T00:00:00Z'));

    expect(status.current.revenueCents).toBe(4_000_000);
    expect(status.previous.revenueCents).toBe(2_000_000);
    expect(status.previous.limitCents).toBe(DEFAULT_SMALL_BUSINESS_LIMITS.previousYearCents);
    // 20.000 € bei 25.000 € Vorjahresgrenze sind bereits 80 %.
    expect(status.previous.state).toBe(SMALL_BUSINESS_STATE.NAHE);
  });

  it('zieht ein Storno wieder ab', async () => {
    await smallBusinessProfile();
    await issued({ netCents: 9_000_000 });
    await issued({ netCents: -4_000_000, documentType: DOCUMENT_TYPE.CANCELLATION });

    const status = await service.status(new Date('2026-06-01T00:00:00Z'));

    expect(status.current.revenueCents).toBe(5_000_000);
  });

  it('zählt Rechnungen anderer Steuerarten nicht mit', async () => {
    await smallBusinessProfile();
    await issued({ netCents: 3_000_000 });
    await issued({ netCents: 8_000_000, kind: TAX_PROFILE_KIND.STANDARD });

    const status = await service.status(new Date('2026-06-01T00:00:00Z'));

    expect(status.current.revenueCents).toBe(3_000_000);
  });

  it('lässt Entwürfe außen vor', async () => {
    await smallBusinessProfile();
    await issued({ netCents: 3_000_000 });
    await prisma.invoice.create({
      data: {
        invoiceDate: '2026-04-01',
        serviceDate: '2026-04-01',
        dueDate: '2026-04-15',
        // Ein Entwurf trägt keine abgeleiteten Summen; selbst wenn er es
        // täte, filtert `number: not null` ihn heraus.
        totalNetCents: 9_000_000,
        taxProfileKind: TAX_PROFILE_KIND.SMALL_BUSINESS,
      },
    });

    const status = await service.status(new Date('2026-06-01T00:00:00Z'));

    expect(status.current.revenueCents).toBe(3_000_000);
  });

  it('erkennt das Überschreiten der Grenze des laufenden Jahres', async () => {
    await smallBusinessProfile();
    await issued({ netCents: 10_000_001 });

    const status = await service.status(new Date('2026-06-01T00:00:00Z'));

    expect(status.current.state).toBe(SMALL_BUSINESS_STATE.UEBERSCHRITTEN);
    expect(status.current.remainingCents).toBeLessThan(0);
  });
});

describe('Grenzwerte aus der Konfiguration', () => {
  it('nimmt abweichende Werte aus AppSetting an', async () => {
    await smallBusinessProfile();
    await prisma.appSetting.create({
      data: {
        key: SMALL_BUSINESS_LIMITS_SETTING_KEY,
        value: JSON.stringify({
          previousYearCents: 3_000_000,
          currentYearCents: 12_000_000,
          warnAtPercent: 90,
        }),
      },
    });

    const status = await service.status(new Date('2026-06-01T00:00:00Z'));

    expect(status.limits.currentYearCents).toBe(12_000_000);
    expect(status.current.limitCents).toBe(12_000_000);
  });

  it('fällt auf die gesetzlichen Werte zurück, wenn der Eintrag unbrauchbar ist', async () => {
    await smallBusinessProfile();
    await prisma.appSetting.create({
      data: { key: SMALL_BUSINESS_LIMITS_SETTING_KEY, value: 'kein JSON' },
    });

    const status = await service.status(new Date('2026-06-01T00:00:00Z'));

    // Lieber die gesetzlichen Werte als gar keine Auswertung — dieselbe
    // Haltung wie beim Nummernmuster.
    expect(status.limits).toEqual(DEFAULT_SMALL_BUSINESS_LIMITS);
  });
});
