import { z } from 'zod';
import { isoDateSchema, type IsoDate } from './date.js';

/**
 * Vertrag des Steuerberater-Exports.
 *
 * Der Zeitraum bezieht sich auf das Rechnungsdatum, nicht auf das Erstell-
 * oder Zahlungsdatum. Das ist derselbe Kalendertag, nach dem auch die
 * Rechnungsübersicht und der Nummernkreis arbeiten.
 */
export const taxAdvisorExportInputSchema = z
  .object({
    from: isoDateSchema,
    to: isoDateSchema,
    includeDocuments: z.boolean().optional().default(true),
  })
  .superRefine((value, ctx) => {
    if (value.to < value.from) {
      ctx.addIssue({
        code: z.ZodIssueCode.custom,
        path: ['to'],
        message: 'Das Enddatum darf nicht vor dem Anfangsdatum liegen',
      });
    }
  });

export type TaxAdvisorExportInput = z.input<typeof taxAdvisorExportInputSchema>;
export type TaxAdvisorExportPayload = z.output<typeof taxAdvisorExportInputSchema>;

export const TAX_ADVISOR_EXPORT_FORMAT_VERSION = 1;

export interface TaxAdvisorExportManifestFile {
  path: string;
  sha256: string;
  sizeBytes: number;
}

/** Maschinenlesbare Inhaltsangabe des Pakets. */
export interface TaxAdvisorExportManifest {
  formatVersion: number;
  createdAt: string;
  period: { from: IsoDate; to: IsoDate };
  counts: {
    invoices: number;
    cancellations: number;
    pdfs: number;
    xmls: number;
  };
  files: TaxAdvisorExportManifestFile[];
}

export interface TaxAdvisorExportProblem {
  invoiceId: number;
  invoiceNumber: string;
  message: string;
}

/** Ergebnis der Vorprüfung, bevor die womöglich große ZIP-Datei entsteht. */
export interface TaxAdvisorExportSummary {
  period: { from: IsoDate; to: IsoDate };
  ready: boolean;
  counts: TaxAdvisorExportManifest['counts'];
  problems: TaxAdvisorExportProblem[];
}

/** Sortierbarer, plattformtauglicher Name für das heruntergeladene ZIP. */
export function taxAdvisorExportFilename(from: IsoDate, to: IsoDate): string {
  return `steuerberater-${from.replaceAll('-', '')}-${to.replaceAll('-', '')}.zip`;
}
