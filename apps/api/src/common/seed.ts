import {
  MAIL_TEMPLATE_DEFAULTS,
  MAIL_TEMPLATE_KEY_VALUES,
  TAX_CATEGORY_CODE,
  TAX_PROFILE_KIND,
  VAT_EXEMPTION_REASON_CODE,
  type MailTemplateKey,
} from '@agentur-tool/shared';
import type { PrismaClient } from '@prisma/client';

/** Was nach dem Seed in der Datenbank steht. */
export interface SeedCounts {
  steuerprofile: number;
  company: number;
  templateSettings: number;
  mailVorlagen: number;
}

/**
 * Grunddaten für eine frische Installation.
 *
 * Idempotent: Der Seed darf jederzeit erneut laufen, ohne bereits
 * gepflegte Daten zu überschreiben. Deshalb sind alle `update`-Zweige
 * leer — ein `update` würde eingegebene Firmendaten überschreiben.
 *
 * Steht in `src/` und nicht mehr nur als Skript, weil es zwei Aufrufer
 * gibt: `prisma/seed.ts` auf der Kommandozeile und der Electron-
 * Hauptprozess beim ersten Start. In einer gepackten Anwendung gibt es
 * kein `tsx`, das ein TypeScript-Skript ausführen könnte.
 */
export async function seed(prisma: PrismaClient): Promise<SeedCounts> {
  // Company und TemplateSettings sind Singletons mit fester id = 1.
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
      fontFamily: 'Open Sans',
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
      taxCategoryCode: TAX_CATEGORY_CODE.STANDARD,
      exemptionReasonCode: null,
      exemptionReasonText: null,
      showTaxColumn: true,
      isDefault: true,
      sortOrder: 10,
    },
    {
      name: 'Deutschland 7 %',
      kind: TAX_PROFILE_KIND.STANDARD,
      defaultRateBasisPoints: 700,
      noteText: null,
      taxCategoryCode: TAX_CATEGORY_CODE.STANDARD,
      exemptionReasonCode: null,
      exemptionReasonText: null,
      showTaxColumn: true,
      isDefault: false,
      sortOrder: 20,
    },
    {
      name: 'Steuerfrei 0 %',
      kind: TAX_PROFILE_KIND.ZERO_RATED,
      defaultRateBasisPoints: 0,
      // Ohne Grund keine Befreiung: BR-E-10 verlangt BT-120 oder BT-121.
      // Welcher Sachverhalt gemeint ist, weiß nur der Benutzer — hier steht
      // deshalb der allgemeinste Satz, der sich ändern lässt.
      noteText: 'Steuerfreie Leistung.',
      taxCategoryCode: TAX_CATEGORY_CODE.EXEMPT,
      exemptionReasonCode: null,
      exemptionReasonText: 'Steuerfreie Leistung.',
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
      taxCategoryCode: TAX_CATEGORY_CODE.REVERSE_CHARGE,
      exemptionReasonCode: VAT_EXEMPTION_REASON_CODE.REVERSE_CHARGE,
      exemptionReasonText: 'Steuerschuldnerschaft des Leistungsempfängers.',
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

  // Die drei E-Mail-Vorlagen im Auslieferungsstand. `update: {}` wie
  // überall hier: Ein zweiter Lauf darf einen bearbeiteten Text nicht
  // zurücksetzen — dafür gibt es den Knopf in den Einstellungen.
  for (const key of MAIL_TEMPLATE_KEY_VALUES as MailTemplateKey[]) {
    await prisma.mailTemplate.upsert({
      where: { key },
      update: {},
      create: { key, ...MAIL_TEMPLATE_DEFAULTS[key] },
    });
  }

  // Der Versandweg entsteht als Zeile, aber auf NONE: Die Anwendung greift
  // erst nach außen, wenn es jemand einrichtet (D45).
  await prisma.mailSettings.upsert({ where: { id: 1 }, update: {}, create: { id: 1 } });

  return {
    steuerprofile: await prisma.taxProfile.count(),
    company: await prisma.company.count(),
    templateSettings: await prisma.templateSettings.count(),
    mailVorlagen: await prisma.mailTemplate.count(),
  };
}
