import { DOCUMENT_TYPE, TAX_CATEGORY_CODE } from '@privatura/shared';
import { renderCii } from '../src/cii.js';
import { buildEinvoiceModel } from '../src/model.js';
import { SOURCE, TOTALS } from './fixtures.js';

/**
 * Die Fälle, für die es eine Golden-Datei gibt.
 *
 * An einer Stelle, damit Vergleichstest und Schreibskript dieselbe Liste
 * benutzen — und damit der KoSIT-Validator in der CI nichts übersieht.
 *
 * Die drei Fälle decken ab, woran eine Abbildung erfahrungsgemäß scheitert:
 * gemischte Steuersätze, eine Kategorie mit Befreiungsgrund und ein
 * Dokument, das auf ein anderes verweist.
 */
export const GOLDEN_CASES: Record<string, string> = {
  /** Regelfall: zwei Steuersätze, ein Zeilenrabatt, ein Zeitraum. */
  'rechnung-standard': renderCii(buildEinvoiceModel(SOURCE, TOTALS)),

  /** Reverse Charge: Kategorie AE, Befreiungsgrund als Code und Text. */
  'rechnung-reverse-charge': renderCii(
    buildEinvoiceModel(
      {
        ...SOURCE,
        tax: {
          ...SOURCE.tax,
          profileName: 'EU B2B Reverse Charge',
          kind: 'REVERSE_CHARGE',
          defaultRateBasisPoints: 0,
          showTaxColumn: false,
          taxCategoryCode: TAX_CATEGORY_CODE.REVERSE_CHARGE,
          exemptionReasonCode: 'VATEX-EU-AE',
          exemptionReasonText: 'Steuerschuldnerschaft des Leistungsempfängers.',
        },
        items: SOURCE.items.map((item) => ({ ...item, taxRateBasisPoints: 0 })),
      },
      {
        ...TOTALS,
        taxCents: 0,
        grossCents: TOTALS.netCents,
        taxGroups: [{ rateBasisPoints: 0, netCents: TOTALS.netCents, taxCents: 0 }],
      },
    ),
  ),

  /** Storno: Gutschrift 381 mit Verweis auf die aufgehobene Rechnung. */
  storno: renderCii(
    buildEinvoiceModel(
      { ...SOURCE, documentType: DOCUMENT_TYPE.CANCELLATION, number: '2026-0008' },
      TOTALS,
      { precedingInvoiceNumber: '2026-0007' },
    ),
  ),
};
