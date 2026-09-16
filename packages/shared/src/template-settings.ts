import { z } from 'zod';

/**
 * Darstellungseinstellungen des Dokuments.
 *
 * Wie die Firmendaten ein Singleton mit fester id. Diese Werte landen beim
 * Finalisieren als `templateSnapshot` auf der Rechnung — eine später
 * geänderte Akzentfarbe verändert also keine ausgestellte Rechnung mehr.
 */

const optionalText = z
  .string()
  .trim()
  .max(2000)
  .transform((value) => (value === '' ? null : value))
  .nullable()
  .default(null)
  .transform((value) => value ?? null);

/**
 * Hex-Farbe in Langform. Die Kurzform `#abc` wird bewusst abgelehnt: Der
 * Wert geht unverändert in den Snapshot und von dort ins CSS, und zwei
 * Schreibweisen für dieselbe Farbe machen jeden späteren Vergleich unnötig
 * kompliziert.
 */
export const hexColorSchema = z
  .string()
  .trim()
  .regex(/^#[0-9a-fA-F]{6}$/u, 'Bitte eine Farbe in der Form #1e293b angeben.')
  .transform((value) => value.toLowerCase());

/**
 * Die mitgelieferten Designs.
 *
 * Die Liste steht hier und nicht in der Template-Registry, weil dieses Paket
 * nicht von `@privatura/invoice-template` abhängen darf — die Abhängigkeit
 * läuft andersherum. Dass beide Listen übereinstimmen, prüft ein Test dort
 * gegen `listTemplates()`.
 */
export const TEMPLATE_KEY_VALUES = ['classic', 'modern', 'kompakt', 'schlicht'] as const;
export type TemplateKey = (typeof TEMPLATE_KEY_VALUES)[number];

/**
 * Die mitgelieferten Schriften.
 *
 * Eine feste Auswahl statt eines Textfeldes, und das ist kein Gängeln:
 * Gedruckt wird in einer abgeschotteten Sitzung ohne Netz und ohne
 * Zugriff auf installierte Schriften. Ein freier Name fiele dort lautlos
 * auf irgendetwas zurück — und bräche anders um als die Vorschau, die im
 * Browser des Benutzers durchaus eine Schrift dieses Namens fände.
 */
export const TEMPLATE_FONT_FAMILY_VALUES = ['Open Sans', 'Source Serif 4'] as const;
export type TemplateFontFamily = (typeof TEMPLATE_FONT_FAMILY_VALUES)[number];

/**
 * Wie eng das Dokument gesetzt ist. Drei Stufen statt eines stufenlosen
 * Reglers, damit die Seitenumbrüche aller Kombinationen prüfbar bleiben.
 */
export const TEMPLATE_DENSITY_VALUES = ['kompakt', 'normal', 'luftig'] as const;
export type TemplateDensityValue = (typeof TEMPLATE_DENSITY_VALUES)[number];

export const updateTemplateSettingsSchema = z.object({
  templateKey: z.enum(TEMPLATE_KEY_VALUES).default('classic'),
  accentColor: hexColorSchema.default('#1e293b'),
  fontFamily: z.enum(TEMPLATE_FONT_FAMILY_VALUES).default('Open Sans'),
  /*
   * Die vier Farben des Dokuments. Die Vorgaben sind genau die Werte, die
   * „classic" seit jeher in seinem `:root` stehen hatte — wer nichts
   * einstellt, bekommt also unverändert das bisherige Aussehen.
   */
  inkColor: hexColorSchema.default('#1f2328'),
  inkSoftColor: hexColorSchema.default('#4b5563'),
  ruleColor: hexColorSchema.default('#e3e6ea'),
  bandColor: hexColorSchema.default('#f4f5f7'),
  pageColor: hexColorSchema.default('#ffffff'),
  density: z.enum(TEMPLATE_DENSITY_VALUES).default('normal'),
  showLogo: z.boolean().default(true),
  showPaymentBlock: z.boolean().default(true),
  showFooterRule: z.boolean().default(true),
  /**
   * Breite des Logos auf dem Dokument in Millimetern. Die Obergrenze von
   * 80 mm ist keine Schikane: Darüber schiebt das Logo den Firmenblock aus
   * dem Kopfbereich heraus.
   */
  logoWidthMm: z
    .union([z.number(), z.string().trim()])
    .transform((value, ctx) => {
      const parsed = typeof value === 'number' ? value : Number(value.replace(',', '.'));
      if (!Number.isFinite(parsed)) {
        ctx.addIssue({ code: z.ZodIssueCode.custom, message: 'Bitte eine Zahl angeben.' });
        return z.NEVER;
      }
      return parsed;
    })
    .pipe(z.number().min(10).max(80))
    .default(40),
  footerText: optionalText,
  paymentNote: optionalText,
  closingNote: optionalText,
});

export type UpdateTemplateSettingsInput = z.input<typeof updateTemplateSettingsSchema>;
export type UpdateTemplateSettingsPayload = z.output<typeof updateTemplateSettingsSchema>;

export const templateSettingsResponseSchema = updateTemplateSettingsSchema.extend({
  id: z.number().int(),
  updatedAt: z.string(),
});
export type TemplateSettingsResponse = z.infer<typeof templateSettingsResponseSchema>;
