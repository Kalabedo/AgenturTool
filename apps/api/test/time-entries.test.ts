import { afterAll, beforeAll, beforeEach, describe, expect, it } from 'vitest';
import type { PrismaClient } from '@prisma/client';
import {
  formatTimeOfDay,
  summarizeTimeEntries,
  timeEntryInputSchema,
  timeEntryRangeSchema,
} from '@agentur-tool/shared';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { ApiError } from '../src/common/api-error';
import { StorageConfig } from '../src/common/config.service';
import { FilesService } from '../src/files/files.service';
import { CompanyService } from '../src/company/company.service';
import { TimeReportService } from '../src/pdf/time-report.service';
import { TimeEntriesService } from '../src/time-entries/time-entries.service';
import { createTestDatabase, type TestDatabase } from './database.helper';
import { StubPdfRenderer } from './stub-renderer';
import { isPdf } from './pdf.helper';

let db: TestDatabase;
let prisma: PrismaClient;
let timeEntries: TimeEntriesService;
let report: TimeReportService;
let dataDir: string;
let customerId: number;
let otherCustomerId: number;

beforeAll(async () => {
  dataDir = fs.mkdtempSync(path.join(os.tmpdir(), 'agentur-tool-zeit-'));
  db = await createTestDatabase();
  prisma = db.prisma;
  timeEntries = new TimeEntriesService(prisma);
  const storage = new StorageConfig({ get: () => dataDir } as never);
  report = new TimeReportService(
    new CompanyService(prisma, new FilesService(prisma, storage)),
    // Geprüft wird das Dokument, nicht der Druck: Wie der Zeitnachweis
    // gesetzt ist — eigene Ränder, eigene Fußzeile —, misst
    // `pdf-electron.test.ts` am echten Chromium.
    new StubPdfRenderer(),
  );
});

afterAll(async () => {
  await db.cleanup();
  fs.rmSync(dataDir, { recursive: true, force: true });
});

beforeEach(async () => {
  await prisma.timeEntry.deleteMany();
  await prisma.customer.deleteMany();

  customerId = (await prisma.customer.create({ data: { companyName: 'Alpha AG' } })).id;
  otherCustomerId = (await prisma.customer.create({ data: { companyName: 'Zeta GmbH' } })).id;
});

function input(overrides: Record<string, unknown> = {}) {
  return timeEntryInputSchema.parse({
    date: '2026-09-07',
    customerId,
    startMinutes: '09:00',
    endMinutes: '12:30',
    breakMinutes: '',
    description: '',
    ...overrides,
  });
}

function range(overrides: Record<string, unknown> = {}) {
  return timeEntryRangeSchema.parse({ from: '2026-09-01', to: '2026-09-30', ...overrides });
}

describe('Anlegen und Ändern', () => {
  it('legt einen Eintrag an und rechnet die Dauer aus', async () => {
    const created = await timeEntries.create(input({ breakMinutes: '30' }));

    expect(created.customerName).toBe('Alpha AG');
    expect(created.durationMinutes).toBe(180);
    expect(formatTimeOfDay(created.startMinutes)).toBe('09:00');
  });

  it('speichert nur Vielfache von 15 Minuten', async () => {
    const created = await timeEntries.create(input({ startMinutes: '12:13', endMinutes: '14:02' }));

    expect(created.startMinutes % 15).toBe(0);
    expect(created.endMinutes % 15).toBe(0);
    expect(created.durationMinutes).toBe(120);
  });

  it('ändert einen Eintrag vollständig', async () => {
    const created = await timeEntries.create(input());
    const updated = await timeEntries.update(
      created.id,
      input({ customerId: otherCustomerId, endMinutes: '17:00', description: 'Workshop' }),
    );

    expect(updated.customerName).toBe('Zeta GmbH');
    expect(updated.description).toBe('Workshop');
    expect(updated.durationMinutes).toBe(480);
  });

  it('meldet einen unbekannten Eintrag als nicht gefunden', async () => {
    await expect(timeEntries.findById(999_999)).rejects.toBeInstanceOf(ApiError);
  });

  it('weist einen unbekannten Kunden als Eingabefehler zurück', async () => {
    await expect(timeEntries.create(input({ customerId: 999_999 }))).rejects.toBeInstanceOf(
      ApiError,
    );
  });

  it('löscht einen Eintrag', async () => {
    const created = await timeEntries.create(input());
    await timeEntries.remove(created.id);

    await expect(timeEntries.findById(created.id)).rejects.toBeInstanceOf(ApiError);
  });
});

/**
 * Das Raster hängt nicht am Zod-Schema allein.
 *
 * Diese Tests gehen an der Anwendung vorbei direkt in die Datenbank — genau
 * der Weg, den ein Import oder ein Skript nähme.
 */
describe('CHECK-Constraints der Tabelle', () => {
  const base = { date: '2026-09-07', startMinutes: 540, endMinutes: 660 };

  it('lehnt Uhrzeiten neben dem Viertelstundenraster ab', async () => {
    await expect(
      prisma.timeEntry.create({ data: { ...base, customerId, startMinutes: 553 } }),
    ).rejects.toThrow();
  });

  it('lehnt ein Ende vor dem Beginn ab', async () => {
    await expect(
      prisma.timeEntry.create({ data: { ...base, customerId, endMinutes: 480 } }),
    ).rejects.toThrow();
  });

  it('lehnt eine Pause ab, die die Spanne aufzehrt', async () => {
    await expect(
      prisma.timeEntry.create({ data: { ...base, customerId, breakMinutes: 120 } }),
    ).rejects.toThrow();
  });

  it('lehnt ein Datum ab, das kein Kalendertag ist', async () => {
    await expect(
      prisma.timeEntry.create({ data: { ...base, customerId, date: '07.09.2026' } }),
    ).rejects.toThrow();
  });

  it('lässt einen Kunden mit erfassten Zeiten nicht löschen', async () => {
    await timeEntries.create(input());
    await expect(prisma.customer.delete({ where: { id: customerId } })).rejects.toThrow();
  });
});

describe('Liste und Zeitraum', () => {
  beforeEach(async () => {
    await timeEntries.create(
      input({ date: '2026-08-31', startMinutes: '08:00', endMinutes: '09:00' }),
    );
    await timeEntries.create(
      input({ date: '2026-09-01', startMinutes: '14:00', endMinutes: '15:00' }),
    );
    await timeEntries.create(
      input({ date: '2026-09-01', startMinutes: '09:00', endMinutes: '10:00' }),
    );
    await timeEntries.create(
      input({ date: '2026-09-30', customerId: otherCustomerId, endMinutes: '10:30' }),
    );
    await timeEntries.create(
      input({ date: '2026-10-01', startMinutes: '08:00', endMinutes: '09:00' }),
    );
  });

  it('schließt Anfang und Ende des Zeitraums ein', async () => {
    const found = await timeEntries.list(range());
    expect(found.map((entry) => entry.date)).toEqual(['2026-09-01', '2026-09-01', '2026-09-30']);
  });

  it('sortiert nach Tag und Beginn, nicht nach Anlagezeitpunkt', async () => {
    const [first, second] = await timeEntries.list(range());
    expect(formatTimeOfDay(first.startMinutes)).toBe('09:00');
    expect(formatTimeOfDay(second.startMinutes)).toBe('14:00');
  });

  it('filtert auf einen Kunden', async () => {
    const found = await timeEntries.list(range({ customerId: otherCustomerId }));
    expect(found).toHaveLength(1);
    expect(found[0].customerName).toBe('Zeta GmbH');
  });

  it('liefert für einen leeren Zeitraum eine leere Liste', async () => {
    expect(await timeEntries.list(range({ from: '2026-07-01', to: '2026-07-31' }))).toEqual([]);
  });
});

describe('Zeitnachweis', () => {
  it('zeigt Einträge, Kundensummen und die Gesamtsumme', async () => {
    await timeEntries.create(input({ description: 'Konzept' }));
    await timeEntries.create(
      input({ date: '2026-09-08', customerId: otherCustomerId, endMinutes: '10:00' }),
    );

    const query = range();
    const entries = await timeEntries.list(query);
    const html = report.buildHtml({
      title: 'Zeitnachweis',
      companyName: 'Meine Agentur',
      query,
      entries,
      summary: summarizeTimeEntries(entries),
    });

    expect(html).toContain('Alpha AG');
    expect(html).toContain('Zeta GmbH');
    expect(html).toContain('Konzept');
    expect(html).toContain('07.09.2026');
    // 3:30 h plus 1:00 h, einmal je Kunde und einmal als Gesamtsumme.
    expect(html).toContain('3:30');
    expect(html).toContain('4:30');
    expect(html).toContain('Meine Agentur');
  });

  it('maskiert HTML aus den Eingaben', async () => {
    await timeEntries.create(input({ description: '<script>alert(1)</script>' }));

    const query = range();
    const entries = await timeEntries.list(query);
    const html = report.buildHtml({
      title: 'Zeitnachweis',
      companyName: '',
      query,
      entries,
      summary: summarizeTimeEntries(entries),
    });

    expect(html).not.toContain('<script>alert');
    expect(html).toContain('&lt;script&gt;');
  });

  it('sagt es, wenn im Zeitraum nichts erfasst wurde', () => {
    const query = range();
    const html = report.buildHtml({
      title: 'Zeitnachweis',
      companyName: '',
      query,
      entries: [],
      summary: summarizeTimeEntries([]),
    });

    expect(html).toContain('keine Zeiten erfasst');
  });

  /**
   * Der Druck selbst.
   *
   * Geprüft wird der Weg — dass aus Einträgen ein Dokument mit dem
   * richtigen Namen wird. Wie es gesetzt ist, misst `pdf-electron.test.ts`
   * am echten Chromium: Der Zeitnachweis steht dort als eigenes
   * Referenzdokument, weil er mit 14 mm eigene Ränder mitbringt.
   */
  it('druckt ein Dokument mit dem Dateinamen des Zeitraums', async () => {
    await timeEntries.create(input({ description: 'Konzept' }));

    const query = range();
    const document = await report.render(query, await timeEntries.list(query));

    expect(isPdf(document.bytes)).toBe(true);
    expect(document.filename).toBe('Zeitnachweis-Alpha-AG-2026-09-01-bis-2026-09-30.pdf');
  });
});

/**
 * Das Abrechnen.
 *
 * Der Kern der Zeiterfassung: Die Liste ist ein Posteingang, und
 * „Abrechnen" leert ihn, ohne etwas wegzuwerfen. Diese Tests halten die
 * beiden Zusagen fest, an denen Geld hängt — nichts verschwindet
 * unbemerkt, und nichts gilt als abgerechnet, ohne auf dem Nachweis zu
 * stehen.
 */
describe('Abrechnen', () => {
  it('markiert die offenen Zeiten eines Kunden und lässt andere unberührt', async () => {
    const mine = await timeEntries.create(input());
    const other = await timeEntries.create(input({ customerId: otherCustomerId }));

    const result = await timeEntries.bill(customerId);

    expect(result.entries.map((entry) => entry.id)).toEqual([mine.id]);
    expect((await timeEntries.findById(mine.id)).billedAt).not.toBeNull();
    expect((await timeEntries.findById(other.id)).billedAt).toBeNull();
  });

  it('löscht nicht: die Einträge bleiben über den Zeitraum abrufbar', async () => {
    const created = await timeEntries.create(input());
    await timeEntries.bill(customerId);

    const billed = await timeEntries.list(range({ billing: 'billed' }));
    expect(billed.map((entry) => entry.id)).toEqual([created.id]);
  });

  it('nimmt aus der offenen Liste, was abgerechnet wurde', async () => {
    await timeEntries.create(input());
    await timeEntries.create(input({ date: '2026-09-08' }));
    await timeEntries.bill(customerId);

    expect(await timeEntries.list(range({ billing: 'open' }))).toHaveLength(0);
  });

  it('rechnet ein zweites Mal nur ab, was seither dazugekommen ist', async () => {
    await timeEntries.create(input());
    await timeEntries.bill(customerId);

    const later = await timeEntries.create(input({ date: '2026-09-10' }));
    const second = await timeEntries.bill(customerId);

    expect(second.entries.map((entry) => entry.id)).toEqual([later.id]);
  });

  it('weist das Abrechnen ohne offene Zeiten zurück', async () => {
    await expect(timeEntries.bill(customerId)).rejects.toBeInstanceOf(ApiError);
  });

  it('nimmt eine Abrechnung wieder zurück', async () => {
    const created = await timeEntries.create(input());
    const result = await timeEntries.bill(customerId);

    const count = await timeEntries.unbill(result.entries.map((entry) => entry.id));

    expect(count).toBe(1);
    expect((await timeEntries.findById(created.id)).billedAt).toBeNull();
    expect(await timeEntries.list(range({ billing: 'open' }))).toHaveLength(1);
  });

  it('bleibt beim zweiten Rückgängigmachen ruhig', async () => {
    await timeEntries.create(input());
    const result = await timeEntries.bill(customerId);
    const ids = result.entries.map((entry) => entry.id);

    await timeEntries.unbill(ids);
    expect(await timeEntries.unbill(ids)).toBe(0);
  });

  /**
   * Ein abgerechneter Eintrag steht auf einem Nachweis beim Kunden. Ihn
   * danach zu ändern hieße, das Dokument still von seiner Grundlage zu
   * lösen — der Kunde hätte eine Zahl auf dem Papier und die Datenbank eine
   * andere.
   */
  it('lässt abgerechnete Einträge nicht mehr ändern oder löschen', async () => {
    const created = await timeEntries.create(input());
    await timeEntries.bill(customerId);

    await expect(
      timeEntries.update(created.id, input({ endMinutes: '18:00' })),
    ).rejects.toBeInstanceOf(ApiError);
    await expect(timeEntries.remove(created.id)).rejects.toBeInstanceOf(ApiError);
  });

  it('gibt einen zurückgenommenen Eintrag wieder zur Änderung frei', async () => {
    const created = await timeEntries.create(input());
    const result = await timeEntries.bill(customerId);
    await timeEntries.unbill(result.entries.map((entry) => entry.id));

    const updated = await timeEntries.update(created.id, input({ endMinutes: '18:00' }));
    expect(updated.durationMinutes).toBe(540);
  });
});

describe('Offene Zeiten je Kunde', () => {
  it('nennt Summe, Anzahl und Zeitraum je Kunde', async () => {
    await timeEntries.create(input({ date: '2026-09-07' }));
    await timeEntries.create(input({ date: '2026-09-10', endMinutes: '11:00' }));
    await timeEntries.create(input({ customerId: otherCustomerId }));

    const summary = await timeEntries.openSummary();
    const alpha = summary.find((entry) => entry.customerId === customerId);

    expect(alpha).toMatchObject({
      customerName: 'Alpha AG',
      entryCount: 2,
      durationMinutes: 330,
      from: '2026-09-07',
      to: '2026-09-10',
    });
  });

  it('führt keinen Kunden mehr, dessen Zeiten abgerechnet sind', async () => {
    await timeEntries.create(input());
    await timeEntries.create(input({ customerId: otherCustomerId }));
    await timeEntries.bill(customerId);

    expect((await timeEntries.openSummary()).map((entry) => entry.customerName)).toEqual([
      'Zeta GmbH',
    ]);
  });

  it('sortiert die Kunden nach Namen', async () => {
    await timeEntries.create(input({ customerId: otherCustomerId }));
    await timeEntries.create(input());

    expect((await timeEntries.openSummary()).map((entry) => entry.customerName)).toEqual([
      'Alpha AG',
      'Zeta GmbH',
    ]);
  });
});

/**
 * Ohne Zeitraum liefert die Liste alles — auch den Eintrag von vor drei
 * Monaten. Genau darauf beruht der Posteingang: Was nicht abgerechnet ist,
 * bleibt sichtbar, egal wie alt es ist.
 */
describe('Liste ohne Zeitraum', () => {
  it('zeigt offene Einträge außerhalb des laufenden Monats', async () => {
    await timeEntries.create(input({ date: '2026-06-15' }));
    await timeEntries.create(input({ date: '2026-09-07' }));

    const open = timeEntryRangeSchema.parse({ billing: 'open' });
    expect(await timeEntries.list(open)).toHaveLength(2);
  });

  it('grenzt trotzdem auf einen Kunden ein', async () => {
    await timeEntries.create(input());
    await timeEntries.create(input({ customerId: otherCustomerId }));

    const open = timeEntryRangeSchema.parse({ billing: 'open', customerId });
    expect(await timeEntries.list(open)).toHaveLength(1);
  });
});
