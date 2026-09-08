import { z } from 'zod';
import {
  TAX_PROFILE_KIND,
  TAX_PROFILE_KIND_VALUES,
  ZERO_TAX_KINDS,
  type TaxProfileKind,
} from './enums.js';
import { parsePercentToBasisPoints } from './money.js';

/**
 * Verträge für die Steuerprofile.
 *
 * Der Grundsatz aus der Architektur: keine Steuerlogik im Code, sondern
 * konfigurierbare Profile. `kind` steuert genau drei Dinge — erzwungener
 * Satz 0, verpflichtender Hinweistext und Sichtbarkeit der Steuerspalte.
 * Alles Weitere ist Freitext, den du selbst festlegst.
 */

const optionalText = z
  .string()
  .trim()
  .transform((value) => (value === '' ? null : value))
  .nullable();

/** Steuersatz als Prozenteingabe ("19", "7,5") oder direkt als Basispunkte. */
const rateInput = z.union([z.string().trim(), z.number()]).transform((value, ctx) => {
  if (typeof value === 'number') {
    if (!Number.isInteger(value) || value < 0 || value > 10_000) {
      ctx.addIssue({
        code: z.ZodIssueCode.custom,
        message: 'Der Steuersatz muss zwischen 0 und 100 % liegen',
      });
      return z.NEVER;
    }
    return value;
  }

  if (value === '') return 0;

  const basisPoints = parsePercentToBasisPoints(value);
  if (basisPoints === null) {
    ctx.addIssue({
      code: z.ZodIssueCode.custom,
      message: 'Bitte einen Prozentsatz zwischen 0 und 100 angeben, z. B. 19 oder 7,5',
    });
    return z.NEVER;
  }
  return basisPoints;
});

export const taxProfileInputSchema = z
  .object({
    name: z.string().trim().min(1, 'Bitte einen Namen angeben').max(120),
    kind: z.enum(TAX_PROFILE_KIND_VALUES as [TaxProfileKind, ...TaxProfileKind[]]),
    defaultRateBasisPoints: rateInput,
    noteText: optionalText,
    showTaxColumn: z.coerce.boolean(),
    isDefault: z.coerce.boolean(),
    sortOrder: z.coerce.number().int().min(0).max(9999).default(0),
  })
  .transform((profile) => ({
    ...profile,
    // Steuerfrei, Reverse Charge und Kleinunternehmer weisen keinen Steuersatz
    // aus. Den Satz hier zu erzwingen statt ihn nur im Formular auszublenden
    // stellt sicher, dass auch ein direkter API-Aufruf keine 19 % auf einer
    // Reverse-Charge-Rechnung erzeugen kann.
    defaultRateBasisPoints: ZERO_TAX_KINDS.includes(profile.kind)
      ? 0
      : profile.defaultRateBasisPoints,
  }))
  .superRefine((profile, ctx) => {
    // Bei Reverse Charge verlangt § 14a UStG einen Hinweis auf die
    // Steuerschuldnerschaft des Leistungsempfängers; bei der
    // Kleinunternehmerregelung erwartet der Empfänger die Begründung, warum
    // keine Umsatzsteuer ausgewiesen ist. Ein Profil ohne Hinweistext wäre
    // in beiden Fällen unbrauchbar.
    if (
      (profile.kind === TAX_PROFILE_KIND.REVERSE_CHARGE ||
        profile.kind === TAX_PROFILE_KIND.SMALL_BUSINESS) &&
      profile.noteText === null
    ) {
      ctx.addIssue({
        code: z.ZodIssueCode.custom,
        path: ['noteText'],
        message: 'Für diese Steuerart muss ein Hinweistext auf der Rechnung erscheinen',
      });
    }
  });

export type TaxProfileInput = z.input<typeof taxProfileInputSchema>;
export type TaxProfilePayload = z.output<typeof taxProfileInputSchema>;

export const taxProfileResponseSchema = z.object({
  id: z.number().int(),
  name: z.string(),
  kind: z.enum(TAX_PROFILE_KIND_VALUES as [TaxProfileKind, ...TaxProfileKind[]]),
  defaultRateBasisPoints: z.number().int(),
  noteText: z.string().nullable(),
  showTaxColumn: z.boolean(),
  isDefault: z.boolean(),
  sortOrder: z.number().int(),
  archivedAt: z.string().nullable(),
  /** Verwendungen in Rechnungen und als Kundenvorgabe — entscheidet über die Löschbarkeit. */
  invoiceCount: z.number().int(),
  customerCount: z.number().int(),
  createdAt: z.string(),
  updatedAt: z.string(),
});
export type TaxProfileResponse = z.infer<typeof taxProfileResponseSchema>;

export const taxProfileListQuerySchema = z.object({
  includeArchived: z
    .union([z.boolean(), z.enum(['true', 'false'])])
    .transform((value) => value === true || value === 'true')
    .default(false),
});
export type TaxProfileListQuery = z.output<typeof taxProfileListQuerySchema>;

/** Beschriftungen der Steuerarten, geteilt zwischen Formular und Liste. */
export const TAX_PROFILE_KIND_LABELS: Record<TaxProfileKind, string> = {
  [TAX_PROFILE_KIND.STANDARD]: 'Regelbesteuerung',
  [TAX_PROFILE_KIND.ZERO_RATED]: 'Steuerfrei (0 %)',
  [TAX_PROFILE_KIND.REVERSE_CHARGE]: 'EU B2B Reverse Charge',
  [TAX_PROFILE_KIND.SMALL_BUSINESS]: 'Kleinunternehmer (§ 19 UStG)',
};

export const TAX_PROFILE_KIND_DESCRIPTIONS: Record<TaxProfileKind, string> = {
  [TAX_PROFILE_KIND.STANDARD]: 'Normaler Steuerausweis mit dem hinterlegten Satz.',
  [TAX_PROFILE_KIND.ZERO_RATED]: 'Kein Steuerausweis; der Satz wird auf 0 gesetzt.',
  [TAX_PROFILE_KIND.REVERSE_CHARGE]:
    'Der Leistungsempfänger schuldet die Steuer. Satz 0, Hinweistext verpflichtend, USt-IdNr. beider Seiten nötig.',
  [TAX_PROFILE_KIND.SMALL_BUSINESS]:
    'Keine Umsatzsteuer nach § 19 UStG. Satz 0, Hinweistext verpflichtend.',
};

/** Ob für diese Steuerart überhaupt ein Satz eingegeben werden kann. */
export function allowsRateInput(kind: TaxProfileKind): boolean {
  return !ZERO_TAX_KINDS.includes(kind);
}

/** Ob für diese Steuerart ein Hinweistext zwingend ist. */
export function requiresNoteText(kind: TaxProfileKind): boolean {
  return kind === TAX_PROFILE_KIND.REVERSE_CHARGE || kind === TAX_PROFILE_KIND.SMALL_BUSINESS;
}
