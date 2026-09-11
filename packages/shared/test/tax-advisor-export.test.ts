import { describe, expect, it } from 'vitest';
import {
  taxAdvisorExportFilename,
  taxAdvisorExportInputSchema,
  TAX_ADVISOR_EXPORT_FORMAT_VERSION,
} from '../src/tax-advisor-export.js';

describe('Steuerberater-Export', () => {
  it('validiert einen inklusiven Zeitraum und belegt die Belege vor', () => {
    expect(taxAdvisorExportInputSchema.parse({ from: '2026-01-01', to: '2026-03-31' })).toEqual({
      from: '2026-01-01',
      to: '2026-03-31',
      includeDocuments: true,
    });
  });

  it('weist einen umgedrehten oder unmöglichen Zeitraum ab', () => {
    expect(() =>
      taxAdvisorExportInputSchema.parse({ from: '2026-04-01', to: '2026-03-31' }),
    ).toThrow(/Enddatum/u);
    expect(() =>
      taxAdvisorExportInputSchema.parse({ from: '2026-02-30', to: '2026-03-31' }),
    ).toThrow();
  });

  it('bildet einen stabilen Dateinamen', () => {
    const input = taxAdvisorExportInputSchema.parse({
      from: '2026-01-01',
      to: '2026-12-31',
      includeDocuments: false,
    });

    expect(taxAdvisorExportFilename(input.from, input.to)).toBe(
      'steuerberater-20260101-20261231.zip',
    );
    expect(TAX_ADVISOR_EXPORT_FORMAT_VERSION).toBe(1);
  });
});
