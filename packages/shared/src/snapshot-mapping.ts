import type { CompanyResponse } from './company.js';
import { defaultTaxCategoryForKind } from './einvoice/codes.js';
import { ZERO_TAX_KINDS, type TaxProfileKind } from './enums.js';
import {
  CURRENT_SNAPSHOT_VERSION,
  type SellerSnapshot,
  type TaxSnapshot,
  type TemplateSnapshot,
} from './snapshots.js';
import type { TaxProfileResponse } from './tax-profile.js';
import type { TemplateSettingsResponse } from './template-settings.js';

/**
 * Aus lebenden Stammdaten einen Snapshot machen.
 *
 * Diese Funktionen haben zwei Aufgaben, die dieselbe sein müssen:
 *
 * 1. Die Vorschau eines Entwurfs zeigt die aktuellen Stammdaten (D9) — sie
 *    baut sich den Snapshot bei jedem Render neu.
 * 2. Beim Finalisieren (Schritt 9) wird genau dieses Ergebnis gespeichert
 *    und nie wieder verändert.
 *
 * Zwei getrennte Implementierungen wären ein stiller Fehler der übelsten
 * Sorte: Die Vorschau zeigte etwas anderes als das eingefrorene Dokument,
 * und auffallen würde es erst an einer Rechnung, die schon beim Kunden ist.
 */

function emptyToNull(value: string | null | undefined): string | null {
  if (value === null || value === undefined) return null;
  const trimmed = value.trim();
  return trimmed === '' ? null : trimmed;
}

export function sellerSnapshotFromCompany(company: CompanyResponse): SellerSnapshot {
  return {
    snapshotVersion: CURRENT_SNAPSHOT_VERSION,
    companyName: company.companyName ?? '',
    address: {
      street: company.street ?? '',
      postalCode: company.postalCode ?? '',
      city: company.city ?? '',
      country: company.country ?? '',
    },
    email: emptyToNull(company.email),
    website: emptyToNull(company.website),
    phone: emptyToNull(company.phone),
    vatId: emptyToNull(company.vatId),
    taxNumber: emptyToNull(company.taxNumber),
    bankAccountHolder: emptyToNull(company.bankAccountHolder),
    iban: emptyToNull(company.iban),
    bic: emptyToNull(company.bic),
    bankName: emptyToNull(company.bankName),
    electronicAddress: emptyToNull(company.electronicAddress),
    electronicAddressScheme: emptyToNull(company.electronicAddressScheme),
    logoAssetId: company.logoAssetId,
  };
}

/**
 * Ohne gewähltes Steuerprofil entsteht ein neutraler Snapshot mit 0 %.
 *
 * Das ist kein Rückfall auf einen Standardsatz: Ein Entwurf ohne Profil ist
 * ein unfertiger Entwurf, und die Vorschau soll ihn zeigen dürfen, statt
 * einen Steuersatz zu erfinden, den niemand ausgewählt hat. Das Finalisieren
 * verlangt in Schritt 9 ohnehin ein gesetztes Profil.
 */
export function taxSnapshotFromProfile(profile: TaxProfileResponse | null): TaxSnapshot {
  if (profile === null) {
    return {
      snapshotVersion: CURRENT_SNAPSHOT_VERSION,
      profileName: '',
      kind: 'STANDARD',
      defaultRateBasisPoints: 0,
      noteText: null,
      showTaxColumn: false,
      taxCategoryCode: defaultTaxCategoryForKind('STANDARD'),
      exemptionReasonCode: null,
      exemptionReasonText: null,
    };
  }

  return {
    snapshotVersion: CURRENT_SNAPSHOT_VERSION,
    profileName: profile.name,
    kind: profile.kind,
    defaultRateBasisPoints: profile.defaultRateBasisPoints,
    noteText: emptyToNull(profile.noteText),
    showTaxColumn: profile.showTaxColumn,
    taxCategoryCode: profile.taxCategoryCode ?? defaultTaxCategoryForKind(profile.kind),
    exemptionReasonCode: emptyToNull(profile.exemptionReasonCode),
    exemptionReasonText: emptyToNull(profile.exemptionReasonText) ?? emptyToNull(profile.noteText),
  };
}

export function templateSnapshotFromSettings(settings: TemplateSettingsResponse): TemplateSnapshot {
  return {
    snapshotVersion: CURRENT_SNAPSHOT_VERSION,
    templateKey: settings.templateKey,
    accentColor: settings.accentColor,
    fontFamily: settings.fontFamily,
    logoWidthMm: settings.logoWidthMm,
    footerText: emptyToNull(settings.footerText),
    paymentNote: emptyToNull(settings.paymentNote),
    closingNote: emptyToNull(settings.closingNote),
    inkColor: settings.inkColor,
    inkSoftColor: settings.inkSoftColor,
    ruleColor: settings.ruleColor,
    bandColor: settings.bandColor,
    density: settings.density,
    showLogo: settings.showLogo,
    showPaymentBlock: settings.showPaymentBlock,
    showFooterRule: settings.showFooterRule,
  };
}

/**
 * Steuerprofile ohne Steuerausweis (Kleinunternehmer, Reverse Charge,
 * innergemeinschaftliche Lieferung) rechnen immer mit 0 %, unabhängig davon,
 * was im Profil als Satz hinterlegt ist.
 */
export function effectiveTaxRateBasisPoints(snapshot: TaxSnapshot): number {
  return ZERO_TAX_KINDS.includes(snapshot.kind as TaxProfileKind)
    ? 0
    : snapshot.defaultRateBasisPoints;
}
