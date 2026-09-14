import type { UseFormReturn } from 'react-hook-form';
import {
  ONBOARDING_STEP,
  type OnboardingStepId,
  type UpdateCompanyPayload,
} from '@agentur-tool/shared';
import type { CompanyFormValues } from '../settings/company/companyFormValues.js';

/**
 * Welche Felder der Firmendaten zu welchem Schritt gehören.
 *
 * Der Ablauf führt **ein** Formular über alle Schritte — die Firmendaten
 * sind ein einziger Datensatz, und ein PUT schreibt ihn ganz. Diese Tabelle
 * ist deshalb an zwei Stellen nötig: Sie sagt, welche Felder beim „Weiter"
 * geprüft werden, und sie sagt umgekehrt, zu welchem Schritt ein Feld
 * gehört, wenn der Server oder das Schema es beanstandet. Ohne das Zweite
 * könnte eine Fehlermeldung an einem Feld hängen, das gerade gar nicht auf
 * dem Bildschirm steht.
 */
export const ONBOARDING_STEP_FIELDS: Record<
  OnboardingStepId,
  readonly (keyof CompanyFormValues)[]
> = {
  [ONBOARDING_STEP.COMPANY]: [
    'companyName',
    'street',
    'postalCode',
    'city',
    'country',
    'email',
    'phone',
    'website',
  ],
  [ONBOARDING_STEP.TAX]: ['vatId', 'taxNumber', 'electronicAddress', 'electronicAddressScheme'],
  [ONBOARDING_STEP.BANK]: ['bankAccountHolder', 'iban', 'bic', 'bankName'],
  [ONBOARDING_STEP.DEFAULTS]: ['defaultPaymentTermDays', 'defaultHourlyRateCents'],
  // Logo und Aussehen haben eigene Endpunkte und stehen nicht in diesem
  // Formular.
  [ONBOARDING_STEP.APPEARANCE]: [],
};

/** Der Schritt, auf dem ein Feld zu sehen ist — oder `null`, wenn keiner. */
export function stepOwningField(field: string): OnboardingStepId | null {
  for (const [step, fields] of Object.entries(ONBOARDING_STEP_FIELDS)) {
    if ((fields as readonly string[]).includes(field)) return step as OnboardingStepId;
  }
  return null;
}

/**
 * Dasselbe für die Feldnamen aus den Prüfungen.
 *
 * Sie sprechen die Sprache der Rechnung und nicht die des Formulars:
 * `seller.iban` meint dasselbe Feld wie `iban`, und `vatIdOrTaxNumber`
 * meint zwei Felder, von denen eines genügt. Diese Übersetzung steht hier,
 * damit ein Punkt in der Abschlussliste zu der Stelle führt, an der er sich
 * beheben lässt.
 */
export function stepForProblemField(field: string): OnboardingStepId | null {
  if (field === 'vatIdOrTaxNumber') return ONBOARDING_STEP.TAX;
  return stepOwningField(field.startsWith('seller.') ? field.slice('seller.'.length) : field);
}

/**
 * Das Formular der Einrichtung, wie es die Schritte bekommen.
 *
 * Alle Schritte arbeiten auf derselben Instanz: Nur so bleibt ein in
 * Schritt eins getippter Wert erhalten, wenn man in Schritt drei
 * zurückblättert.
 */
export type OnboardingForm = UseFormReturn<CompanyFormValues, unknown, UpdateCompanyPayload>;
