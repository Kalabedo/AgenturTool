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

export const updateTemplateSettingsSchema = z.object({
  templateKey: z.string().trim().min(1).max(64).default('classic'),
  accentColor: hexColorSchema.default('#1e293b'),
  fontFamily: z.string().trim().min(1).max(120).default('Open Sans'),
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
