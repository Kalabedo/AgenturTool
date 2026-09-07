/**
 * Die Integritätsregeln, die von Hand in die Migration geschrieben wurden.
 *
 * Diese Liste existiert, weil Prisma SQLite-Tabellen bei manchen Migrationen
 * neu aufbaut und das CREATE TABLE dabei aus dem Prisma-Schema erzeugt —
 * handgeschriebene CHECK-Constraints und Trigger verschwinden dann ohne
 * Fehlermeldung. `prisma/verify.ts` vergleicht die tatsächliche Datenbank
 * gegen diese Liste und läuft als Test mit, damit ein solcher Verlust
 * auffällt statt unbemerkt zu bleiben.
 */

/** Trigger, die vorhanden sein müssen. */
export const EXPECTED_TRIGGERS = [
  'Invoice_immutable_after_issue',
  'Invoice_no_delete_after_issue',
  'InvoiceItem_no_insert_when_issued',
  'InvoiceItem_no_update_when_issued',
  'InvoiceItem_no_delete_when_issued',
] as const;

/**
 * CHECK-Constraints je Tabelle. Geprüft wird gegen den in sqlite_master
 * hinterlegten CREATE-TABLE-Text.
 */
export const EXPECTED_CHECK_CONSTRAINTS: Record<string, readonly string[]> = {
  Company: ['Company_singleton_check'],
  TemplateSettings: ['TemplateSettings_singleton_check'],
  TaxProfile: ['TaxProfile_kind_check'],
  NumberSequence: [
    'NumberSequence_scope_check',
    'NumberSequence_year_check',
    'NumberSequence_nextValue_check',
  ],
  Invoice: [
    'Invoice_documentType_check',
    'Invoice_status_check',
    'Invoice_number_draft_check',
    'Invoice_invoiceDate_isodate_check',
    'Invoice_serviceDate_isodate_check',
    'Invoice_serviceDateTo_isodate_check',
    'Invoice_dueDate_isodate_check',
    'Invoice_paidAt_isodate_check',
  ],
  InvoiceItem: ['InvoiceItem_discountType_check'],
  InvoiceEvent: ['InvoiceEvent_type_check'],
};

/** Unique-Indizes, auf die sich fachliche Garantien stützen. */
export const EXPECTED_UNIQUE_INDEXES = [
  // Harte Absicherung gegen doppelte Rechnungsnummern (Abschnitt 9).
  'Invoice_number_key',
  // Kundennummer optional, aber eindeutig wenn gesetzt (D22).
  'Customer_customerNumber_key',
  'NumberSequence_scope_year_key',
  'InvoiceItem_invoiceId_position_key',
] as const;

export interface VerificationResult {
  ok: boolean;
  missingTriggers: string[];
  missingChecks: string[];
  missingIndexes: string[];
}
