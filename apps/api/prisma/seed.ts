import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { config as loadEnv } from 'dotenv';
import { PrismaClient } from '@prisma/client';
import { TAX_PROFILE_KIND } from '@agentur-tool/shared';

const here = path.dirname(fileURLToPath(import.meta.url));
loadEnv({ path: path.resolve(here, '../../../.env'), quiet: true });

const prisma = new PrismaClient();

/**
 * Grunddaten für eine frische Installation. Idempotent: Der Seed darf
 * jederzeit erneut laufen, ohne bereits gepflegte Daten zu überschreiben.
 */
async function main(): Promise<void> {
  // Company und TemplateSettings sind Singletons mit fester id = 1.
  // `create`-Zweig nur beim ersten Lauf; ein `update` würde eingegebene
  // Firmendaten überschreiben, deshalb bleibt er leer.
  await prisma.company.upsert({
    where: { id: 1 },
    update: {},
    create: { id: 1, country: 'DE' },
  });

  await prisma.templateSettings.upsert({
    where: { id: 1 },
    update: {},
    create: {
      id: 1,
      templateKey: 'classic',
      accentColor: '#1e293b',
      fontFamily: 'Inter',
      logoWidthMm: 40,
      paymentNote: 'Bitte überweisen Sie den Rechnungsbetrag bis zum Fälligkeitsdatum.',
      closingNote: 'Vielen Dank für die gute Zusammenarbeit.',
    },
  });

  const taxProfiles = [
    {
      name: 'Deutschland 19 %',
      kind: TAX_PROFILE_KIND.STANDARD,
      defaultRateBasisPoints: 1900,
      noteText: null,
      showTaxColumn: true,
      isDefault: true,
      sortOrder: 10,
    },
    {
      name: 'Deutschland 7 %',
      kind: TAX_PROFILE_KIND.STANDARD,
      defaultRateBasisPoints: 700,
      noteText: null,
      showTaxColumn: true,
      isDefault: false,
      sortOrder: 20,
    },
    {
      name: 'Steuerfrei 0 %',
      kind: TAX_PROFILE_KIND.ZERO_RATED,
      defaultRateBasisPoints: 0,
      noteText: null,
      showTaxColumn: true,
      isDefault: false,
      sortOrder: 30,
    },
    {
      name: 'EU B2B Reverse Charge',
      kind: TAX_PROFILE_KIND.REVERSE_CHARGE,
      defaultRateBasisPoints: 0,
      noteText:
        'Steuerschuldnerschaft des Leistungsempfängers (Reverse Charge). ' +
        'Die Umsatzsteuer ist vom Leistungsempfänger zu erklären und abzuführen.',
      showTaxColumn: false,
      isDefault: false,
      sortOrder: 40,
    },
  ];

  for (const profile of taxProfiles) {
    await prisma.taxProfile.upsert({
      where: { name: profile.name },
      update: {},
      create: profile,
    });
  }

  const counts = {
    steuerprofile: await prisma.taxProfile.count(),
    company: await prisma.company.count(),
    templateSettings: await prisma.templateSettings.count(),
  };
  console.log('Seed abgeschlossen:', counts);
}

main()
  .catch((error: unknown) => {
    console.error('Seed fehlgeschlagen:', error);
    process.exitCode = 1;
  })
  .finally(() => {
    void prisma.$disconnect();
  });
