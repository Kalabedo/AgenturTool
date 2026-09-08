import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { afterAll, beforeAll, beforeEach, describe, expect, it } from 'vitest';
import type { PrismaClient } from '@prisma/client';
import { updateCompanySchema } from '@agentur-tool/shared';
import { StorageConfig } from '../src/common/config.service';
import { FilesService } from '../src/files/files.service';
import { CompanyService } from '../src/company/company.service';
import { ApiError } from '../src/common/api-error';
import { createTestDatabase, type TestDatabase } from './database.helper';
import { PNG_1PX, JPEG_1PX, WEBP_1PX, NOT_AN_IMAGE } from './fixtures/images';

let db: TestDatabase;
let prisma: PrismaClient;
let storage: StorageConfig;
let files: FilesService;
let company: CompanyService;
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
  storage = new StorageConfig({ get: () => dataDir } as never);
  files = new FilesService(prisma, storage);
  company = new CompanyService(prisma, files);

  await prisma.company.deleteMany();
  await prisma.asset.deleteMany();
});

const validInput = {
  companyName: 'Beispiel Agentur',
  street: 'Musterweg 1',
  postalCode: '10115',
  city: 'Berlin',
  country: 'DE',
  email: 'rechnung@example.com',
  website: '',
  phone: '',
  vatId: 'DE123456789',
  taxNumber: '',
  bankAccountHolder: 'Beispiel Agentur',
  iban: 'DE02 1203 0000 0000 2020 51',
  bic: 'BYLADEM1001',
  bankName: 'Beispielbank',
  defaultPaymentTermDays: '14',
};

describe('CompanyService', () => {
  it('legt die Firmendaten beim ersten Lesen an', async () => {
    // Die Anwendung darf sich nicht darauf verlassen, dass der Seed lief:
    // eine aus einem Backup wiederhergestellte Datenbank muss auch gehen.
    const result = await company.get();
    expect(result.id).toBe(1);
    expect(result.companyName).toBe('');
    expect(result.logoUrl).toBeNull();
  });

  it('speichert und liest die Daten zurück', async () => {
    const payload = updateCompanySchema.parse(validInput);
    const saved = await company.update(payload);

    expect(saved.companyName).toBe('Beispiel Agentur');
    expect(saved.iban).toBe('DE02 1203 0000 0000 2020 51');
    expect(saved.defaultPaymentTermDays).toBe(14);
    // Leere Felder liegen als null in der Datenbank, nicht als "".
    expect(saved.website).toBeNull();
    expect(saved.taxNumber).toBeNull();

    expect((await company.get()).companyName).toBe('Beispiel Agentur');
  });

  it('bleibt bei wiederholtem Speichern ein einziger Datensatz', async () => {
    const payload = updateCompanySchema.parse(validInput);
    await company.update(payload);
    await company.update({ ...payload, city: 'Hamburg' });

    expect(await prisma.company.count()).toBe(1);
    expect((await company.get()).city).toBe('Hamburg');
  });
});

describe('Logo', () => {
  it('nimmt PNG, JPEG und WebP an', async () => {
    for (const [name, buffer] of [
      ['png', PNG_1PX],
      ['jpeg', JPEG_1PX],
      ['webp', WEBP_1PX],
    ] as const) {
      const result = await company.setLogo(buffer, `logo.${name}`);
      expect(result.logoAssetId, name).not.toBeNull();
      expect(result.logoUrl, name).toBe(`/api/assets/${result.logoAssetId}`);
    }
  });

  it('lehnt eine Datei ab, die kein Bild ist', async () => {
    await expect(company.setLogo(NOT_AN_IMAGE, 'schaedlich.png')).rejects.toBeInstanceOf(ApiError);
  });

  it('lässt sich nicht durch die Dateiendung täuschen', async () => {
    // Der gemeldete Name und Content-Type sind frei wählbar; entscheidend
    // ist die Signatur im Inhalt.
    await expect(
      company.setLogo(Buffer.from('<script>alert(1)</script>'), 'logo.png'),
    ).rejects.toBeInstanceOf(ApiError);
  });

  it('lehnt zu große Dateien ab', async () => {
    const tooLarge = Buffer.concat([PNG_1PX, Buffer.alloc(3 * 1024 * 1024)]);
    await expect(company.setLogo(tooLarge, 'gross.png')).rejects.toBeInstanceOf(ApiError);
  });

  it('schreibt die Datei tatsächlich auf die Platte', async () => {
    const result = await company.setLogo(PNG_1PX, 'logo.png');
    const asset = await prisma.asset.findUniqueOrThrow({
      where: { id: result.logoAssetId ?? 0 },
    });

    expect(fs.existsSync(storage.resolve(asset.path))).toBe(true);
    expect(fs.readFileSync(storage.resolve(asset.path))).toEqual(PNG_1PX);
    // Der Dateiname ist der Inhalts-Hash, nicht der hochgeladene Name.
    expect(asset.path).toContain(asset.sha256);
    expect(asset.originalFilename).toBe('logo.png');
  });

  it('räumt das alte Logo beim Ersetzen weg', async () => {
    const first = await company.setLogo(PNG_1PX, 'alt.png');
    const oldAsset = await prisma.asset.findUniqueOrThrow({
      where: { id: first.logoAssetId ?? 0 },
    });

    const second = await company.setLogo(JPEG_1PX, 'neu.jpg');

    expect(second.logoAssetId).not.toBe(first.logoAssetId);
    expect(await prisma.asset.findUnique({ where: { id: oldAsset.id } })).toBeNull();
    expect(fs.existsSync(storage.resolve(oldAsset.path))).toBe(false);
  });

  it('verliert das Logo nicht, wenn dieselbe Datei erneut hochgeladen wird', async () => {
    // Fallstrick: storeImage() liefert bei gleichem Inhalt das bestehende
    // Asset zurück. Würde danach blind "das alte" gelöscht, wäre das gerade
    // gesetzte Logo weg.
    const first = await company.setLogo(PNG_1PX, 'logo.png');
    const second = await company.setLogo(PNG_1PX, 'logo-kopie.png');

    expect(second.logoAssetId).toBe(first.logoAssetId);

    const asset = await prisma.asset.findUniqueOrThrow({
      where: { id: second.logoAssetId ?? 0 },
    });
    expect(fs.existsSync(storage.resolve(asset.path))).toBe(true);
  });

  it('entfernt Logo und Datei auf Wunsch', async () => {
    const withLogo = await company.setLogo(PNG_1PX, 'logo.png');
    const asset = await prisma.asset.findUniqueOrThrow({
      where: { id: withLogo.logoAssetId ?? 0 },
    });

    const without = await company.removeLogo();

    expect(without.logoAssetId).toBeNull();
    expect(without.logoUrl).toBeNull();
    expect(fs.existsSync(storage.resolve(asset.path))).toBe(false);
  });

  it('verträgt das Entfernen, wenn gar kein Logo gesetzt ist', async () => {
    await expect(company.removeLogo()).resolves.toMatchObject({ logoAssetId: null });
  });
});

describe('StorageConfig', () => {
  it('verhindert einen Pfadausbruch aus DATA_DIR', () => {
    // Absicherung gegen einen manipulierten Datenbankeintrag.
    expect(() => storage.resolve('../../etc/passwd')).toThrow(/außerhalb von DATA_DIR/);
  });

  it('löst normale Pfade auf', () => {
    expect(storage.resolve('assets/abc.png')).toBe(path.join(dataDir, 'assets', 'abc.png'));
  });
});
