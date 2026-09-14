import { z } from 'zod';
import {
  COMPANY_FIELD_LABELS,
  missingCompanyFieldsForInvoicing,
  type CompanyResponse,
} from './company.js';
import { checkSellerEinvoiceReady } from './einvoice/readiness.js';
import { TAX_PROFILE_KIND } from './enums.js';
import type { FinalizationProblem } from './finalization.js';
import { sellerSnapshotFromCompany } from './snapshot-mapping.js';
import type { TaxProfileInput } from './tax-profile.js';

/**
 * Die geführte Einrichtung beim ersten Start.
 *
 * Zwei Entscheidungen prägen diesen Vertrag, und beide stehen gegen die
 * naheliegende Bauweise:
 *
 * 1. **Der Fortschritt wird abgeleitet, nicht mitgeschrieben.** Jeder
 *    Schritt speichert sofort in die echten Stammdaten — es gibt keinen
 *    Zwischenspeicher für halbe Einrichtungen. Ob ein Schritt erledigt ist,
 *    steht deshalb in den Daten selbst. Ein mitgeführter Zähler könnte
 *    dagegen falsch werden: Wer die Bankverbindung später in den
 *    Einstellungen wieder leert, hätte einen Haken für etwas, das nicht
 *    mehr da ist. Fortsetzen heißt damit schlicht: zum ersten offenen
 *    Schritt springen.
 *
 * 2. **Gespeichert wird nur die Haltung des Benutzers.** Ob die Einrichtung
 *    noch ansteht, übersprungen oder abgeschlossen wurde, kann man den
 *    Daten nicht ansehen — das ist eine Entscheidung und gehört deshalb als
 *    einziger Wert in `AppSetting`.
 */

export const ONBOARDING_STATUS = {
  /** Noch nicht angefasst. */
  OPEN: 'OPEN',
  /** Weggeklickt — die Anwendung zeigt den Rest als Liste, nicht als Ablauf. */
  SKIPPED: 'SKIPPED',
  /** Vom Benutzer für beendet erklärt. Danach ist Ruhe. */
  DONE: 'DONE',
} as const;

export const ONBOARDING_STATUS_VALUES = [
  ONBOARDING_STATUS.OPEN,
  ONBOARDING_STATUS.SKIPPED,
  ONBOARDING_STATUS.DONE,
] as const;

export type OnboardingStatus = (typeof ONBOARDING_STATUS_VALUES)[number];

export const ONBOARDING_STEP = {
  COMPANY: 'company',
  TAX: 'tax',
  BANK: 'bank',
  DEFAULTS: 'defaults',
  APPEARANCE: 'appearance',
} as const;

export const ONBOARDING_STEP_VALUES = [
  ONBOARDING_STEP.COMPANY,
  ONBOARDING_STEP.TAX,
  ONBOARDING_STEP.BANK,
  ONBOARDING_STEP.DEFAULTS,
  ONBOARDING_STEP.APPEARANCE,
] as const;

export type OnboardingStepId = (typeof ONBOARDING_STEP_VALUES)[number];

export interface OnboardingStepDefinition {
  id: OnboardingStepId;
  title: string;
  /** Ein Satz, was in diesem Schritt passiert. */
  description: string;
  /**
   * Ob ohne diese Angaben überhaupt keine Rechnung ausgestellt werden kann.
   *
   * Die Grenze ist nicht „wichtig" gegen „unwichtig", sondern § 14 UStG:
   * Firma und steuerliche Kennung sind Pflichtbestandteile einer Rechnung,
   * alles Weitere nicht. Die Bankverbindung fehlt dieser Liste deshalb,
   * obwohl eine Rechnung ohne sie unpraktisch ist — was sie für die
   * XRechnung bedeutet, sagt der Abschlussschritt.
   */
  required: boolean;
}

/**
 * Die Schritte in ihrer Reihenfolge.
 *
 * Sie folgt der Rechnung von oben nach unten: erst wer man ist, dann wie
 * man besteuert wird, dann wohin gezahlt werden soll, dann die Vorgaben für
 * neue Rechnungen, zuletzt das Aussehen. Das Aussehen steht am Ende, weil
 * es als einziges nichts blockiert — und weil es mehr Freude macht, wenn
 * die Pflichtangaben schon stehen.
 */
export const ONBOARDING_STEPS: readonly OnboardingStepDefinition[] = [
  {
    id: ONBOARDING_STEP.COMPANY,
    title: 'Unternehmensdaten',
    description: 'Name, Anschrift und Kontakt — der Absender jeder Rechnung.',
    required: true,
  },
  {
    id: ONBOARDING_STEP.TAX,
    title: 'Steuerangaben',
    description:
      'Steuernummer oder USt-IdNr. und das Steuerprofil, mit dem du gewöhnlich abrechnest.',
    required: true,
  },
  {
    id: ONBOARDING_STEP.BANK,
    title: 'Bankverbindung',
    description: 'Wohin der Rechnungsbetrag überwiesen werden soll.',
    required: false,
  },
  {
    id: ONBOARDING_STEP.DEFAULTS,
    title: 'Rechnungsvorgaben',
    description: 'Zahlungsziel und Stundensatz, die neue Rechnungen vorschlagen.',
    required: false,
  },
  {
    id: ONBOARDING_STEP.APPEARANCE,
    title: 'Logo und Darstellung',
    description: 'Logo, Vorlage, Akzentfarbe und Schrift des Rechnungsdokuments.',
    required: false,
  },
];

export interface OnboardingStepState extends OnboardingStepDefinition {
  done: boolean;
}

function filled(value: string | null | undefined): boolean {
  return value !== null && value !== undefined && value.trim() !== '';
}

/**
 * Ob ein einzelner Schritt als erledigt gilt.
 *
 * Jeder Schritt hat genau ein Merkmal, an dem sich das ablesen lässt — das
 * erste Feld, das ohne die Einrichtung leer bliebe. Alle Felder eines
 * Schritts zu verlangen wäre falsch: Eine BIC braucht bei einer deutschen
 * IBAN niemand, und ein Haken, den man nur durch Ausfüllen unnötiger Felder
 * bekommt, erzieht zum Erfinden von Angaben.
 */
export function isOnboardingStepDone(id: OnboardingStepId, company: CompanyResponse): boolean {
  switch (id) {
    case ONBOARDING_STEP.COMPANY:
      return (
        filled(company.companyName) &&
        filled(company.street) &&
        filled(company.postalCode) &&
        filled(company.city)
      );
    case ONBOARDING_STEP.TAX:
      return filled(company.vatId) || filled(company.taxNumber);
    case ONBOARDING_STEP.BANK:
      return filled(company.iban);
    case ONBOARDING_STEP.DEFAULTS:
      // Das Zahlungsziel hat einen Vorgabewert und taugt deshalb nicht als
      // Merkmal — es ist immer gesetzt. Der Stundensatz darf NULL sein und
      // unterscheidet damit „festgelegt" von „noch nicht angesehen".
      return company.defaultHourlyRateCents !== null;
    case ONBOARDING_STEP.APPEARANCE:
      // Das Logo, nicht die Designregler: Deren Vorgaben sind ein fertiges,
      // brauchbares Aussehen, und „unverändert" ist bei ihnen eine gültige
      // Wahl. Beim Logo ist „nicht vorhanden" dagegen sichtbar.
      return company.logoAssetId !== null;
  }
}

export function onboardingSteps(company: CompanyResponse): OnboardingStepState[] {
  return ONBOARDING_STEPS.map((step) => ({
    ...step,
    done: isOnboardingStepDone(step.id, company),
  }));
}

/**
 * Der erste Schritt, der noch aussteht — der Einstiegspunkt beim Fortsetzen.
 *
 * Ist alles erledigt, landet man auf dem letzten Schritt: Dort steht die
 * Zusammenfassung, und genau die will sehen, wer eine fertige Einrichtung
 * noch einmal öffnet.
 */
export function firstOpenOnboardingStep(steps: readonly OnboardingStepState[]): OnboardingStepId {
  return steps.find((step) => !step.done)?.id ?? ONBOARDING_STEP.APPEARANCE;
}

/**
 * Was für eine XRechnung an den eigenen Stammdaten noch fehlt.
 *
 * Ruft dieselbe Prüfung wie der spätere Export auf, damit die Einrichtung
 * nicht ihre eigene Vorstellung davon entwickelt. Was am Kunden und an der
 * einzelnen Rechnung hängt — Leitweg-ID, Adresse des Empfängers — kann hier
 * naturgemäß nicht geprüft werden und steht deshalb nicht in der Liste.
 */
export function missingCompanyFieldsForEinvoice(company: CompanyResponse): FinalizationProblem[] {
  return checkSellerEinvoiceReady(sellerSnapshotFromCompany(company));
}

/** Menschenlesbare Fassung dessen, was `missingCompanyFieldsForInvoicing` liefert. */
export function missingInvoiceFieldLabels(company: CompanyResponse): string[] {
  return missingCompanyFieldsForInvoicing(company).map(
    (field) => COMPANY_FIELD_LABELS[field] ?? field,
  );
}

export const onboardingStatusSchema = z.object({
  status: z.enum(ONBOARDING_STATUS_VALUES),
});
export type OnboardingStatusPayload = z.infer<typeof onboardingStatusSchema>;

export interface OnboardingStateResponse {
  status: OnboardingStatus;
  /**
   * Ob die Anwendung die Einrichtung von selbst öffnen darf.
   *
   * Nur bei leerer Datenbank — kein Kunde, keine Rechnung, kein Zeiteintrag.
   * Wer die Anwendung bereits benutzt, wird nicht mehr in einen Ablauf
   * geschickt, den er offensichtlich nicht braucht; für ihn bleibt die
   * Einrichtung als Liste erreichbar.
   */
  fresh: boolean;
  steps: OnboardingStepState[];
  /** Feldnamen aus `COMPANY_FIELD_LABELS`, die § 14 UStG verlangt. */
  missingForInvoice: string[];
  missingForEinvoice: FinalizationProblem[];
}

/**
 * Das Steuerprofil für Kleinunternehmer, falls die Einrichtung es anlegen muss.
 *
 * Der Seed liefert es bewusst nicht mit: Er läuft bei jeder Installation,
 * und die Mehrzahl der Benutzer rechnet mit Umsatzsteuer ab — ein viertes,
 * ungenutztes Profil in jeder Auswahlliste wäre ein schlechter Tausch. Wer
 * Kleinunternehmer ist, sagt es dagegen in der Einrichtung, und dann
 * entsteht das Profil in genau dem Moment, in dem es gebraucht wird.
 *
 * Den Befreiungsgrund (BT-120) füllt das Eingabeschema aus dem Hinweistext;
 * einen VATEX-Code gibt es für § 19 UStG nicht (siehe `codes.ts`).
 */
export const SMALL_BUSINESS_TAX_PROFILE: TaxProfileInput = {
  name: 'Kleinunternehmer (§ 19 UStG)',
  kind: TAX_PROFILE_KIND.SMALL_BUSINESS,
  defaultRateBasisPoints: 0,
  noteText: 'Gemäß § 19 UStG wird keine Umsatzsteuer berechnet.',
  showTaxColumn: false,
  isDefault: true,
  sortOrder: 50,
};
