import { describe, expect, it } from 'vitest';
import {
  ONBOARDING_STEP,
  ONBOARDING_STEPS,
  SMALL_BUSINESS_TAX_PROFILE,
  firstOpenOnboardingStep,
  missingCompanyFieldsForEinvoice,
  onboardingSteps,
} from '../src/onboarding.js';
import { updateCompanySchema, type CompanyResponse } from '../src/company.js';
import { checkEinvoiceReady } from '../src/einvoice/readiness.js';
import { sellerSnapshotFromCompany, taxSnapshotFromProfile } from '../src/snapshot-mapping.js';
import { taxProfileInputSchema } from '../src/tax-profile.js';
import { TAX_PROFILE_KIND } from '../src/enums.js';
import { emptyBuyerData } from '../src/invoice.js';

const leer: CompanyResponse = {
  id: 1,
  companyName: '',
  street: '',
  postalCode: '',
  city: '',
  country: 'DE',
  email: null,
  website: null,
  phone: null,
  vatId: null,
  taxNumber: null,
  electronicAddress: null,
  electronicAddressScheme: null,
  bankAccountHolder: null,
  iban: null,
  bic: null,
  bankName: null,
  defaultPaymentTermDays: 14,
  defaultHourlyRateCents: null,
  logoAssetId: null,
  logoUrl: null,
  updatedAt: '2026-09-14T08:00:00.000Z',
};

const vollstaendig: CompanyResponse = {
  ...leer,
  companyName: 'Beispiel Agentur',
  street: 'Musterweg 1',
  postalCode: '10115',
  city: 'Berlin',
  phone: '030 123456',
  vatId: 'DE123456789',
  electronicAddress: 'rechnung@example.com',
  electronicAddressScheme: 'EM',
  iban: 'DE02120300000000202051',
  defaultHourlyRateCents: 8500,
  logoAssetId: 7,
  logoUrl: '/api/assets/7',
};

describe('Schritte der Einrichtung', () => {
  it('meldet bei leeren Firmendaten alles als offen', () => {
    const steps = onboardingSteps(leer);
    expect(steps).toHaveLength(ONBOARDING_STEPS.length);
    expect(steps.every((step) => !step.done)).toBe(true);
    expect(firstOpenOnboardingStep(steps)).toBe(ONBOARDING_STEP.COMPANY);
  });

  it('meldet bei vollständigen Firmendaten alles als erledigt', () => {
    expect(onboardingSteps(vollstaendig).every((step) => step.done)).toBe(true);
  });

  it('erkennt den Stundensatz null als Angabe, die Abwesenheit aber nicht', () => {
    // Der Unterschied, für den die Spalte NULL-fähig ist: Wer ausdrücklich
    // 0 einträgt, hat entschieden — wer nichts einträgt, noch nicht.
    const mitNull = onboardingSteps({ ...leer, defaultHourlyRateCents: 0 });
    expect(mitNull.find((step) => step.id === ONBOARDING_STEP.DEFAULTS)?.done).toBe(true);

    const ohne = onboardingSteps(leer);
    expect(ohne.find((step) => step.id === ONBOARDING_STEP.DEFAULTS)?.done).toBe(false);
  });

  it('verlangt für die Firmendaten die Anschrift vollständig', () => {
    const ohneOrt = onboardingSteps({ ...vollstaendig, city: '   ' });
    expect(ohneOrt.find((step) => step.id === ONBOARDING_STEP.COMPANY)?.done).toBe(false);
  });

  it('lässt bei den Steuerangaben eine der beiden Kennungen genügen', () => {
    const nurSteuernummer = onboardingSteps({
      ...leer,
      vatId: null,
      taxNumber: '12/345/67890',
    });
    expect(nurSteuernummer.find((step) => step.id === ONBOARDING_STEP.TAX)?.done).toBe(true);
  });

  it('springt beim Fortsetzen auf den ersten offenen Schritt', () => {
    const steps = onboardingSteps({ ...vollstaendig, iban: null });
    expect(firstOpenOnboardingStep(steps)).toBe(ONBOARDING_STEP.BANK);
  });

  it('führt bei fertiger Einrichtung auf den letzten Schritt', () => {
    expect(firstOpenOnboardingStep(onboardingSteps(vollstaendig))).toBe(ONBOARDING_STEP.APPEARANCE);
  });
});

describe('Was für die XRechnung fehlt', () => {
  it('nennt genau das, was die Exportprüfung am Verkäufer bemängelt', () => {
    // Der eigentliche Punkt: Die Einrichtung baut die Liste nicht nach,
    // sondern ruft dieselbe Prüfung. Liefe beides auseinander, fiele es
    // erst an der ersten abgewiesenen XRechnung auf.
    const ausExport = checkEinvoiceReady({
      seller: sellerSnapshotFromCompany(leer),
      buyer: { ...emptyBuyerData(), buyerReference: 'X', electronicAddress: 'a@b.de' },
      tax: taxSnapshotFromProfile(null),
    }).filter((problem) => problem.field.startsWith('seller.'));

    expect(missingCompanyFieldsForEinvoice(leer)).toEqual(ausExport);
  });

  it('ist bei vollständigen Stammdaten leer', () => {
    expect(missingCompanyFieldsForEinvoice(vollstaendig)).toEqual([]);
  });

  it('bemängelt eine Telefonnummer ohne Ziffern', () => {
    const problems = missingCompanyFieldsForEinvoice({ ...vollstaendig, phone: '—' });
    expect(problems.map((problem) => problem.field)).toContain('seller.phone');
  });
});

describe('Standard-Stundensatz', () => {
  const basis = {
    companyName: 'Beispiel',
    street: 'Weg 1',
    postalCode: '10115',
    city: 'Berlin',
    country: 'DE',
    email: '',
    website: '',
    phone: '',
    vatId: '',
    taxNumber: '',
    bankAccountHolder: '',
    iban: '',
    bic: '',
    bankName: '',
    defaultPaymentTermDays: '14',
  };

  it('nimmt deutsche und englische Schreibweise', () => {
    expect(
      updateCompanySchema.parse({ ...basis, defaultHourlyRateCents: '85' }).defaultHourlyRateCents,
    ).toBe(8500);
    expect(
      updateCompanySchema.parse({ ...basis, defaultHourlyRateCents: '85,50' })
        .defaultHourlyRateCents,
    ).toBe(8550);
    expect(
      updateCompanySchema.parse({ ...basis, defaultHourlyRateCents: '1.200,00' })
        .defaultHourlyRateCents,
    ).toBe(120000);
  });

  it('nimmt eine Zahl als Cent-Betrag an', () => {
    expect(
      updateCompanySchema.parse({ ...basis, defaultHourlyRateCents: 8500 }).defaultHourlyRateCents,
    ).toBe(8500);
  });

  it('macht aus dem leeren Feld null und nicht null Euro', () => {
    expect(
      updateCompanySchema.parse({ ...basis, defaultHourlyRateCents: '' }).defaultHourlyRateCents,
    ).toBeNull();
    expect(
      updateCompanySchema.parse({ ...basis, defaultHourlyRateCents: '  ' }).defaultHourlyRateCents,
    ).toBeNull();
  });

  it('bleibt ohne die Angabe gültig', () => {
    // Ein Aufruf aus der Zeit vor diesem Feld darf nicht scheitern.
    expect(updateCompanySchema.parse(basis).defaultHourlyRateCents).toBeNull();
  });

  it('lehnt Unsinn und unplausible Beträge ab', () => {
    for (const value of ['abc', '-5', '10.000,01']) {
      expect(
        updateCompanySchema.safeParse({ ...basis, defaultHourlyRateCents: value }).success,
        value,
      ).toBe(false);
    }
  });
});

describe('Steuerprofil für Kleinunternehmer', () => {
  it('ist so vorbereitet, dass das Eingabeschema es annimmt', () => {
    // Es entsteht erst beim Anklicken in der Einrichtung — dann aber ohne
    // Nachfrage, also muss es auf Anhieb durch jede Prüfung gehen.
    const parsed = taxProfileInputSchema.parse(SMALL_BUSINESS_TAX_PROFILE);

    expect(parsed.kind).toBe(TAX_PROFILE_KIND.SMALL_BUSINESS);
    expect(parsed.defaultRateBasisPoints).toBe(0);
    expect(parsed.isDefault).toBe(true);
    // BR-E-10: ohne Befreiungsgrund keine gültige XRechnung. Der Text kommt
    // aus dem Hinweistext, den § 19 UStG ohnehin verlangt.
    expect(parsed.exemptionReasonText).toBe(SMALL_BUSINESS_TAX_PROFILE.noteText);
  });
});
