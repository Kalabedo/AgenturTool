import { afterAll, beforeAll, beforeEach, describe, expect, it } from 'vitest';
import type { PrismaClient } from '@prisma/client';
import { updateTemplateSettingsSchema } from '@privatura/shared';
import { TemplateSettingsService } from '../src/template-settings/template-settings.service';
import { createTestDatabase, type TestDatabase } from './database.helper';

let db: TestDatabase;
let prisma: PrismaClient;
let settings: TemplateSettingsService;

beforeAll(async () => {
  db = await createTestDatabase();
  prisma = db.prisma;
  settings = new TemplateSettingsService(prisma);
});

afterAll(async () => {
  await db.cleanup();
});

beforeEach(async () => {
  await prisma.templateSettings.deleteMany();
});

describe('TemplateSettingsService', () => {
  it('legt die Einstellungen beim ersten Lesen an', async () => {
    // Eine aus einem Backup wiederhergestellte Datenbank hat den Seed nie
    // gesehen. Ohne dieses Anlegen bliebe die Vorschau dort leer.
    const created = await settings.get();

    expect(created.id).toBe(1);
    expect(created.templateKey).toBe('classic');
    expect(created.fontFamily).toBe('Open Sans');
  });

  it('liefert bei wiederholtem Lesen dieselbe Zeile', async () => {
    const first = await settings.get();
    const second = await settings.get();

    expect(second.id).toBe(first.id);
    expect(await prisma.templateSettings.count()).toBe(1);
  });

  it('speichert geänderte Werte', async () => {
    await settings.get();
    const updated = await settings.update(
      updateTemplateSettingsSchema.parse({
        templateKey: 'classic',
        accentColor: '#B91C1C',
        pageColor: '#FFF7ED',
        fontFamily: 'Open Sans',
        logoWidthMm: '55,5',
        footerText: 'Amtsgericht Ulm HRB 12345',
        paymentNote: '',
        closingNote: null,
      }),
    );

    expect(updated.accentColor).toBe('#b91c1c');
    expect(updated.pageColor).toBe('#fff7ed');
    expect(updated.logoWidthMm).toBe(55.5);
    expect(updated.footerText).toBe('Amtsgericht Ulm HRB 12345');
    // Ein leeres Feld wird zu null, nicht zu einem leeren String — sonst
    // druckte das Template eine leere Zeile.
    expect(updated.paymentNote).toBeNull();
  });

  it('wehrt sich gegen eine Farbe in Kurzform', () => {
    // Beide Schreibweisen zuzulassen hieße, denselben Farbwert später in
    // zwei Formen im Snapshot zu haben.
    expect(() => updateTemplateSettingsSchema.parse({ accentColor: '#abc' })).toThrow();
  });

  it('lehnt eine unbrauchbare Logobreite ab', () => {
    expect(() => updateTemplateSettingsSchema.parse({ logoWidthMm: '5' })).toThrow();
    expect(() => updateTemplateSettingsSchema.parse({ logoWidthMm: '120' })).toThrow();
    expect(() => updateTemplateSettingsSchema.parse({ logoWidthMm: 'breit' })).toThrow();
  });

  /**
   * Der CHECK-Constraint auf id = 1 ist in der Migration
   * `template_settings_default_font` von Hand wieder eingesetzt worden,
   * nachdem Prisma ihn beim Tabellenneuaufbau verworfen hatte. Dieser Test
   * hält fest, dass er wirkt.
   */
  it('lässt keine zweite Zeile zu', async () => {
    await settings.get();
    await expect(
      prisma.$executeRawUnsafe(
        'INSERT INTO "TemplateSettings" ("id", "updatedAt") VALUES (2, CURRENT_TIMESTAMP)',
      ),
    ).rejects.toThrow();
  });
});
