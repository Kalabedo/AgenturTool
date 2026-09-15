import { useEffect, useRef, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { useForm } from 'react-hook-form';
import { zodResolver } from '@hookform/resolvers/zod';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import {
  ONBOARDING_STATUS,
  ONBOARDING_STEP,
  ONBOARDING_STEP_VALUES,
  SMALL_BUSINESS_TAX_PROFILE,
  firstOpenOnboardingStep,
  taxProfileInputSchema,
  updateCompanySchema,
  type CompanyResponse,
  type OnboardingStepId,
  type TaxProfileResponse,
  type TemplateSettingsResponse,
  type UpdateCompanyPayload,
} from '@privatura/shared';
import { ApiRequestError, apiClient } from '../../lib/apiClient.js';
import { queryKeys } from '../../lib/queryKeys.js';
import { useDocumentTitle } from '../../lib/useDocumentTitle.js';
import { Button } from '../../components/ui/Button.js';
import { Card } from '../../components/ui/Card.js';
import { ErrorNotice } from '../../components/ui/ErrorNotice.js';
import { LoadingNote } from '../../components/ui/LoadingNote.js';
import { PageHeader } from '../../components/ui/PageHeader.js';
import { StatusText } from '../../components/ui/StatusText.js';
import { formErrorOf } from '../../lib/errorMessage.js';
import {
  toCompanyFormValues,
  type CompanyFormValues,
} from '../settings/company/companyFormValues.js';
import { ONBOARDING_STEP_FIELDS, stepOwningField } from './onboardingFields.js';
import { OnboardingProgress } from './OnboardingProgress.js';
import { useOnboardingState, useOnboardingStatusMutation } from './useOnboarding.js';
import { CompanyFields } from './steps/CompanyFields.js';
import { TaxFields, CREATE_SMALL_BUSINESS, type TaxProfileChoice } from './steps/TaxFields.js';
import { BankFields } from './steps/BankFields.js';
import { DefaultsFields } from './steps/DefaultsFields.js';
import {
  AppearanceFields,
  appearanceOf,
  toTemplateSettingsPayload,
  type AppearanceChoice,
} from './steps/AppearanceFields.js';
import { SummaryPanel } from './steps/SummaryPanel.js';

/**
 * Die geführte Einrichtung.
 *
 * Sie liegt bewusst **im** Anwendungsrahmen und nicht darüber: Die
 * Navigation bleibt sichtbar, nichts ist gesperrt, und wer lieber gleich
 * eine Rechnung schreiben will, klickt einfach weg. Ein Ablauf, der den
 * Weg versperrt, bis er zufrieden ist, hätte den umgekehrten Effekt — man
 * klickt ihn durch, ohne zu lesen.
 *
 * Gespeichert wird in jedem Schritt sofort und in die echten Stammdaten;
 * einen Zwischenspeicher für halbe Einrichtungen gibt es nicht. Deshalb ist
 * Abbrechen harmlos, Fortsetzen kostenlos, und die Haken in der Leiste
 * zeigen den Zustand der Daten und nicht den Verlauf eines Klickpfads.
 */

type Screen = 'welcome' | OnboardingStepId | 'summary';

const SCREENS: readonly Screen[] = ['welcome', ...ONBOARDING_STEP_VALUES, 'summary'];

/** Ergebnis eines Speicherversuchs — `clean` heißt: es gab nichts zu tun. */
type PersistResult = 'saved' | 'clean' | 'invalid';

export function OnboardingPage(): JSX.Element {
  useDocumentTitle('Einrichtung');
  const navigate = useNavigate();
  const queryClient = useQueryClient();

  const onboarding = useOnboardingState();
  const setStatus = useOnboardingStatusMutation();

  const company = useQuery({
    queryKey: queryKeys.company,
    queryFn: () => apiClient.get<CompanyResponse>('/company'),
  });

  const taxProfiles = useQuery({
    queryKey: queryKeys.taxProfiles.list(false),
    queryFn: () => apiClient.get<TaxProfileResponse[]>('/tax-profiles'),
  });

  const templateSettings = useQuery({
    queryKey: queryKeys.templateSettings,
    queryFn: () => apiClient.get<TemplateSettingsResponse>('/template-settings'),
  });

  const [screen, setScreen] = useState<Screen>('welcome');
  const [taxChoice, setTaxChoice] = useState<TaxProfileChoice>(null);
  const [appearance, setAppearance] = useState<AppearanceChoice | null>(null);
  const [blocked, setBlocked] = useState<string | null>(null);

  const form = useForm<CompanyFormValues, unknown, UpdateCompanyPayload>({
    // Dasselbe Schema wie auf der Einstellungsseite und im Server — die
    // Einrichtung ist eine andere Führung durch dieselben Felder, keine
    // zweite Wahrheit darüber, was gültig ist.
    resolver: zodResolver(updateCompanySchema),
    values: company.data === undefined ? undefined : toCompanyFormValues(company.data),
  });

  /*
   * Einmalig beim ersten vollständigen Laden: Wer schon etwas eingetragen
   * hat, landet beim ersten offenen Schritt statt auf der Begrüßung — die
   * hat er beim ersten Mal gelesen.
   */
  const positioned = useRef(false);
  useEffect(() => {
    if (positioned.current || onboarding.data === undefined) return;
    positioned.current = true;

    const steps = onboarding.data.steps;
    setScreen(steps.some((step) => step.done) ? firstOpenOnboardingStep(steps) : 'welcome');
  }, [onboarding.data]);

  const taxChoiceInitialised = useRef(false);
  useEffect(() => {
    if (taxChoiceInitialised.current || taxProfiles.data === undefined) return;
    taxChoiceInitialised.current = true;
    setTaxChoice(taxProfiles.data.find((profile) => profile.isDefault)?.id ?? null);
  }, [taxProfiles.data]);

  const appearanceInitialised = useRef(false);
  useEffect(() => {
    if (appearanceInitialised.current || templateSettings.data === undefined) return;
    appearanceInitialised.current = true;
    setAppearance(appearanceOf(templateSettings.data));
  }, [templateSettings.data]);

  const saveCompany = useMutation({
    mutationFn: (values: UpdateCompanyPayload) =>
      apiClient.put<CompanyResponse>('/company', values),
    onSuccess: (updated) => {
      queryClient.setQueryData(queryKeys.company, updated);
      form.reset(toCompanyFormValues(updated));
      void queryClient.invalidateQueries({ queryKey: queryKeys.onboarding });
    },
    onError: (cause: unknown) => {
      if (cause instanceof ApiRequestError) {
        for (const [field, message] of Object.entries(cause.fieldErrors())) {
          form.setError(field as keyof CompanyFormValues, { message });
        }
      }
    },
  });

  const saveTaxProfile = useMutation({
    mutationFn: async (choice: TaxProfileChoice) => {
      if (choice === CREATE_SMALL_BUSINESS) {
        await apiClient.post<TaxProfileResponse>(
          '/tax-profiles',
          taxProfileInputSchema.parse(SMALL_BUSINESS_TAX_PROFILE),
        );
        return;
      }

      const profile = (taxProfiles.data ?? []).find((candidate) => candidate.id === choice);
      // Schon Standard: Ein PATCH mit demselben Inhalt wäre ein Schreibvorgang
      // ohne Wirkung — und würde den Zeitstempel des Profils ohne Grund
      // bewegen.
      if (profile === undefined || profile.isDefault) return;

      await apiClient.patch<TaxProfileResponse>(
        `/tax-profiles/${profile.id}`,
        taxProfileInputSchema.parse({ ...profile, isDefault: true }),
      );
    },
    onSuccess: () => {
      void queryClient.invalidateQueries({ queryKey: queryKeys.taxProfiles.all });
    },
  });

  const saveAppearance = useMutation({
    mutationFn: (choice: AppearanceChoice) => {
      const stored = templateSettings.data;
      if (stored === undefined) throw new Error('Die Darstellung ist noch nicht geladen.');
      return apiClient.put<TemplateSettingsResponse>(
        '/template-settings',
        toTemplateSettingsPayload(stored, choice),
      );
    },
    onSuccess: (updated) => {
      queryClient.setQueryData(queryKeys.templateSettings, updated);
    },
  });

  /**
   * Die Firmendaten sichern, soweit sie gültig sind.
   *
   * `fields` grenzt die Prüfung auf den gerade sichtbaren Schritt ein — beim
   * „Weiter" soll nicht ein Feld aus Schritt vier rot werden, das noch
   * niemand gesehen hat. Beanstandet das Schema danach trotzdem ein Feld
   * aus einem anderen Schritt, springt die Ansicht dorthin: Ein PUT
   * schreibt den ganzen Datensatz, also muss auch der ganze Datensatz
   * gültig sein, und ein unsichtbarer Fehler wäre eine Sackgasse.
   */
  const persistCompany = async (
    fields?: readonly (keyof CompanyFormValues)[],
  ): Promise<PersistResult> => {
    setBlocked(null);

    if (fields !== undefined && fields.length > 0) {
      const valid = await form.trigger(fields as (keyof CompanyFormValues)[]);
      if (!valid) return 'invalid';
    }

    if (!form.formState.isDirty) return 'clean';

    const parsed = updateCompanySchema.safeParse(form.getValues());
    if (!parsed.success) {
      let target: OnboardingStepId | null = null;
      for (const issue of parsed.error.issues) {
        const field = String(issue.path[0] ?? '');
        if (field === '') continue;
        form.setError(field as keyof CompanyFormValues, { message: issue.message });
        target ??= stepOwningField(field);
      }
      if (target !== null && target !== screen) {
        setScreen(target);
        setBlocked('Hier steht noch ein Wert, mit dem die Anwendung nichts anfangen kann.');
      }
      return 'invalid';
    }

    try {
      await saveCompany.mutateAsync(parsed.data);
      return 'saved';
    } catch {
      // Die Meldung hängt bereits am Feld oder unter der Leiste.
      return 'invalid';
    }
  };

  /** Was zusätzlich zum Formular an diesem Schritt hängt. */
  const persistExtras = async (current: Screen): Promise<boolean> => {
    try {
      if (current === ONBOARDING_STEP.TAX && taxChoice !== null) {
        await saveTaxProfile.mutateAsync(taxChoice);
      }
      if (current === ONBOARDING_STEP.APPEARANCE && appearance !== null) {
        const stored = templateSettings.data;
        const unchanged =
          stored !== undefined &&
          stored.templateKey === appearance.templateKey &&
          stored.accentColor.toLowerCase() === appearance.accentColor.toLowerCase() &&
          stored.fontFamily === appearance.fontFamily;
        if (!unchanged) await saveAppearance.mutateAsync(appearance);
      }
      return true;
    } catch {
      setBlocked('Das konnte nicht gespeichert werden. Bitte prüfe die Eingaben.');
      return false;
    }
  };

  /**
   * Zu einem beliebigen Schritt wechseln — Leiste, „Zurück", Sprungmarken
   * der Abschlussliste.
   *
   * Anders als „Weiter" wird hier nicht der aktuelle Schritt geprüft,
   * sondern nur gesichert, was sich sichern lässt. Wer mitten im Tippen
   * zurückblättern will, soll das dürfen. Nur ein Wert, den das Schema
   * ablehnt, hält auf — sonst ginge er beim Speichern verloren.
   */
  const goTo = async (target: Screen): Promise<void> => {
    if ((await persistCompany()) === 'invalid') return;
    if (!(await persistExtras(screen))) return;
    setBlocked(null);
    setScreen(target);
  };

  const goNext = async (): Promise<void> => {
    const index = SCREENS.indexOf(screen);
    const target = SCREENS[index + 1] ?? 'summary';

    const fields =
      screen === 'welcome' || screen === 'summary' ? undefined : ONBOARDING_STEP_FIELDS[screen];

    if ((await persistCompany(fields)) === 'invalid') return;
    if (!(await persistExtras(screen))) return;
    setScreen(target);
  };

  const goBack = async (): Promise<void> => {
    const index = SCREENS.indexOf(screen);
    await goTo(SCREENS[index - 1] ?? 'welcome');
  };

  const leave = async (status: (typeof ONBOARDING_STATUS)[keyof typeof ONBOARDING_STATUS]) => {
    if ((await persistCompany()) === 'invalid') return;
    if (!(await persistExtras(screen))) return;
    await setStatus.mutateAsync(status);
    void navigate('/');
  };

  const loading =
    onboarding.isLoading ||
    company.isLoading ||
    taxProfiles.isLoading ||
    templateSettings.isLoading;

  const failed = [onboarding, company, taxProfiles, templateSettings].find(
    (query) => query.isError,
  );

  if (failed !== undefined) {
    return (
      <ErrorNotice
        error={failed.error}
        title="Die Einrichtung konnte nicht geladen werden."
        onRetry={() => {
          void onboarding.refetch();
          void company.refetch();
          void taxProfiles.refetch();
          void templateSettings.refetch();
        }}
      />
    );
  }

  if (
    loading ||
    onboarding.data === undefined ||
    company.data === undefined ||
    taxProfiles.data === undefined ||
    templateSettings.data === undefined ||
    appearance === null
  ) {
    return <LoadingNote>Die Einrichtung wird vorbereitet …</LoadingNote>;
  }

  const state = onboarding.data;
  const stepDefinition = state.steps.find((step) => step.id === screen) ?? null;
  const saving =
    saveCompany.isPending ||
    saveTaxProfile.isPending ||
    saveAppearance.isPending ||
    setStatus.isPending;

  const generalError =
    formErrorOf(saveCompany.error) ??
    formErrorOf(saveTaxProfile.error) ??
    formErrorOf(saveAppearance.error) ??
    formErrorOf(setStatus.error);

  return (
    /*
     * Kein <form>: Die Enter-Taste soll hier nicht absenden, weil es nichts
     * Einzelnes abzusenden gibt — jeder Schritt speichert für sich, und ein
     * versehentliches Enter im Feld „PLZ" würde sonst zwei Schritte weiter
     * springen.
     */
    <div className="space-y-6">
      <PageHeader
        title="Einrichtung"
        description="Einmal die Angaben durchgehen, die auf jeder Rechnung stehen. Du kannst jederzeit abbrechen; alles ist später unter Einstellungen erreichbar."
      />

      <OnboardingProgress
        steps={state.steps}
        current={stepDefinition?.id ?? null}
        onSelect={(step) => void goTo(step)}
      />

      {screen === 'welcome' && (
        <Card title="Willkommen bei Privatura">
          <div className="max-w-2xl space-y-3 text-sm text-ink">
            <p>
              In den nächsten fünf Schritten stehen die Angaben, die auf jeder Rechnung erscheinen:
              wer du bist, wie du besteuert wirst, wohin gezahlt werden soll, was neue Rechnungen
              vorschlagen sollen und wie das Blatt aussieht.
            </p>
            <p>
              Jeder Schritt wird sofort gespeichert. Du kannst zwischen den Schritten springen,
              abbrechen und später weitermachen — offene Punkte stehen dann als Liste auf dem
              Dashboard.
            </p>
            <p className="text-ink-subtle">
              Nichts davon verlässt diesen Rechner. Die Anwendung baut von sich aus keine Verbindung
              nach außen auf.
            </p>
          </div>
        </Card>
      )}

      {stepDefinition !== null && (
        <Card title={stepDefinition.title} description={stepDefinition.description}>
          {screen === ONBOARDING_STEP.COMPANY && <CompanyFields form={form} />}
          {screen === ONBOARDING_STEP.TAX && (
            <TaxFields
              form={form}
              profiles={taxProfiles.data}
              choice={taxChoice}
              onChoiceChange={setTaxChoice}
            />
          )}
          {screen === ONBOARDING_STEP.BANK && <BankFields form={form} />}
          {screen === ONBOARDING_STEP.DEFAULTS && <DefaultsFields form={form} />}
          {screen === ONBOARDING_STEP.APPEARANCE && (
            <AppearanceFields
              company={company.data}
              stored={templateSettings.data}
              choice={appearance}
              onChoiceChange={setAppearance}
            />
          )}
        </Card>
      )}

      {screen === 'summary' && (
        <Card
          title="Das war die Einrichtung"
          description="Was jetzt möglich ist — und was für die XRechnung noch fehlt."
        >
          <SummaryPanel state={state} onGoToStep={(step) => void goTo(step)} />
        </Card>
      )}

      <div className="flex flex-wrap items-center gap-x-4 gap-y-3">
        <div className="flex flex-wrap items-center gap-3">
          {screen === 'summary' ? (
            <Button
              onClick={() => void leave(ONBOARDING_STATUS.DONE)}
              pending={saving}
              pendingLabel="wird gespeichert …"
            >
              Einrichtung abschließen
            </Button>
          ) : (
            <Button
              onClick={() => void goNext()}
              pending={saving}
              pendingLabel="wird gespeichert …"
            >
              {screen === 'welcome' ? 'Los geht’s' : 'Weiter'}
            </Button>
          )}

          {screen !== 'welcome' && (
            <Button variant="secondary" onClick={() => void goBack()} disabled={saving}>
              Zurück
            </Button>
          )}
        </div>

        <div className="min-h-[1.25rem] min-w-0 flex-1 text-sm">
          {generalError !== null ? (
            <StatusText tone="error">{generalError}</StatusText>
          ) : blocked !== null ? (
            <StatusText tone="error">{blocked}</StatusText>
          ) : null}
        </div>

        {screen !== 'summary' && (
          <Button
            variant="ghost"
            onClick={() => void leave(ONBOARDING_STATUS.SKIPPED)}
            disabled={saving}
          >
            Später weitermachen
          </Button>
        )}
      </div>
    </div>
  );
}
