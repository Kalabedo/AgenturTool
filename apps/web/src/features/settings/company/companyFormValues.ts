import { centsToInput, type CompanyResponse, type UpdateCompanyInput } from '@agentur-tool/shared';

/**
 * Der Eingabetyp des geteilten Schemas ist zugleich der Formulartyp.
 *
 * Ein eigener Typ mit lauter Strings wäre lesbarer, würde aber neben dem
 * Schema herlaufen und bei jeder Feldänderung nachgezogen werden müssen.
 * Im Formular stehen ohnehin durchgehend Strings; leere Felder wandelt das
 * Schema beim Absenden in null um.
 */
export type CompanyFormValues = UpdateCompanyInput;

/**
 * Steht in einer eigenen Datei, weil es zwei Formulare mit denselben
 * Feldern gibt: die Einstellungsseite und die geführte Einrichtung. Zwei
 * Abbildungen liefen auseinander — das eine Formular zeigte dann einen
 * leeren Stundensatz, wo das andere „0,00" anbietet.
 */
export function toCompanyFormValues(company: CompanyResponse): CompanyFormValues {
  return {
    companyName: company.companyName,
    street: company.street,
    postalCode: company.postalCode,
    city: company.city,
    country: company.country,
    email: company.email ?? '',
    website: company.website ?? '',
    phone: company.phone ?? '',
    vatId: company.vatId ?? '',
    taxNumber: company.taxNumber ?? '',
    bankAccountHolder: company.bankAccountHolder ?? '',
    iban: company.iban ?? '',
    bic: company.bic ?? '',
    bankName: company.bankName ?? '',
    electronicAddress: company.electronicAddress ?? '',
    electronicAddressScheme: company.electronicAddressScheme ?? '',
    defaultPaymentTermDays: String(company.defaultPaymentTermDays),
    // Leer heißt „nicht festgelegt". Eine „0,00" an dieser Stelle wäre eine
    // Behauptung, die niemand aufgestellt hat.
    defaultHourlyRateCents:
      company.defaultHourlyRateCents === null ? '' : centsToInput(company.defaultHourlyRateCents),
  };
}
