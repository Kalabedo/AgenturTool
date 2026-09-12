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
 *
 * Die Spalten der E-Rechnung — `TaxProfile.taxCategoryCode`,
 * `InvoiceItem.unitCode` und `InvoiceDocument.kind` — stehen hier bewusst
 * nicht. SQLite kann einer bestehenden Tabelle keinen CHECK anfügen; das
 * ginge nur über einen Neuaufbau, und der hätte die drei Trigger auf
 * `InvoiceItem` verworfen. Die Trigger wiegen schwerer: Sie schützen eine
 * ausgestellte Rechnung vor Veränderung. Validiert werden die neuen
 * Spalten von Zod (packages/shared/src/einvoice/codes.ts); die Begründung
 * steht in der Migration 20260911072246_einvoice_fields.
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
  TimeEntry: [
    'TimeEntry_date_isodate_check',
    // Das Viertelstundenraster der Zeiterfassung: Ohne diese vier Regeln
    // hinge es allein am Zod-Schema, und ein Import an der Anwendung vorbei
    // brächte 12:13-Einträge in die Auswertung.
    'TimeEntry_startMinutes_check',
    'TimeEntry_endMinutes_check',
    'TimeEntry_range_check',
    'TimeEntry_breakMinutes_check',
  ],
  InvoiceEvent: ['InvoiceEvent_type_check'],
  // Der Versandweg: Wer hier von Hand einen unbekannten Transport oder einen
  // Port 70000 einträgt, bekommt keine halb funktionierende Einrichtung,
  // sondern eine Ablehnung.
  MailSettings: [
    'MailSettings_singleton_check',
    'MailSettings_transport_check',
    'MailSettings_security_check',
    'MailSettings_port_check',
  ],
  MailTemplate: ['MailTemplate_key_check'],
  MailMessage: ['MailMessage_transport_check', 'MailMessage_status_check'],
};

/** Unique-Indizes, auf die sich fachliche Garantien stützen. */
export const EXPECTED_UNIQUE_INDEXES = [
  // Harte Absicherung gegen doppelte Rechnungsnummern (Abschnitt 9).
  'Invoice_number_key',
  // Kundennummer optional, aber eindeutig wenn gesetzt (D22).
  'Customer_customerNumber_key',
  'NumberSequence_scope_year_key',
  'InvoiceItem_invoiceId_position_key',
  // Partieller Index: höchstens ein Steuerprofil ist Standard.
  'TaxProfile_single_default',
  // Genau eine Vorlage je Anlass — sonst erwischt der Versand mal die eine
  // und mal die andere.
  'MailTemplate_key_key',
] as const;

export interface VerificationResult {
  ok: boolean;
  missingTriggers: string[];
  missingChecks: string[];
  missingIndexes: string[];
}
