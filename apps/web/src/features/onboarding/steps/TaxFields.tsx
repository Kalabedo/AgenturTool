import {
  ELECTRONIC_ADDRESS_SCHEME_LABELS,
  ELECTRONIC_ADDRESS_SCHEME_VALUES,
  SMALL_BUSINESS_TAX_PROFILE,
  TAX_PROFILE_KIND,
  TAX_PROFILE_KIND_DESCRIPTIONS,
  TAX_PROFILE_KIND_LABELS,
  formatBasisPoints,
  type ElectronicAddressScheme,
  type TaxProfileResponse,
} from '@agentur-tool/shared';
import { Field } from '../../../components/ui/Field.js';
import { Input } from '../../../components/ui/Input.js';
import { Select } from '../../../components/ui/Select.js';
import type { OnboardingForm } from '../onboardingFields.js';

/**
 * Die Wahl in diesem Schritt: ein vorhandenes Profil oder ein neu
 * anzulegendes für Kleinunternehmer.
 */
export const CREATE_SMALL_BUSINESS = 'CREATE_SMALL_BUSINESS';
export type TaxProfileChoice = number | typeof CREATE_SMALL_BUSINESS | null;

interface TaxFieldsProps {
  form: OnboardingForm;
  profiles: readonly TaxProfileResponse[];
  choice: TaxProfileChoice;
  onChoiceChange: (choice: TaxProfileChoice) => void;
}

function ChoiceRow({
  name,
  checked,
  onChange,
  title,
  description,
  suffix,
}: {
  name: string;
  checked: boolean;
  onChange: () => void;
  title: string;
  description: string;
  suffix?: string;
}): JSX.Element {
  return (
    <label
      className={[
        'flex cursor-pointer items-start gap-3 rounded-md border p-3 transition-colors',
        'focus-within:ring-2 focus-within:ring-focus',
        checked ? 'border-ink bg-surface-raised' : 'border-border hover:bg-surface-hover',
      ].join(' ')}
    >
      <input
        type="radio"
        name={name}
        checked={checked}
        onChange={onChange}
        className="mt-1 h-4 w-4 shrink-0 accent-current text-ink focus:outline-none"
      />
      <span className="min-w-0">
        <span className="flex flex-wrap items-baseline gap-x-2">
          <span className="text-sm font-medium text-ink">{title}</span>
          {suffix !== undefined && (
            <span className="text-sm tabular-nums text-ink-subtle">{suffix}</span>
          )}
        </span>
        <span className="mt-0.5 block text-sm leading-snug text-ink-subtle">{description}</span>
      </span>
    </label>
  );
}

/**
 * Steuerliche Kennung, Steuerprofil und die elektronische Adresse.
 *
 * Das Steuerprofil steht hier und nicht in den Einstellungen, weil es die
 * Frage beantwortet, die alles Weitere bestimmt: ob überhaupt Umsatzsteuer
 * ausgewiesen wird. Angeboten werden die mitgelieferten Profile — und für
 * Kleinunternehmer eines, das erst beim Anklicken entsteht. Der Seed liefert
 * es nicht mit, weil es die Mehrzahl der Benutzer nur im Weg stünde.
 */
export function TaxFields({ form, profiles, choice, onChoiceChange }: TaxFieldsProps): JSX.Element {
  const errors = form.formState.errors;
  const hasSmallBusiness = profiles.some(
    (profile) => profile.kind === TAX_PROFILE_KIND.SMALL_BUSINESS,
  );

  return (
    <div className="space-y-6">
      <div className="grid gap-4 sm:grid-cols-6">
        <Field
          label="USt-IdNr."
          htmlFor="vatId"
          error={errors.vatId?.message}
          hint="Mit Ländercode, z. B. DE123456789"
          className="sm:col-span-3"
        >
          <Input
            id="vatId"
            autoFocus
            invalid={errors.vatId !== undefined}
            {...form.register('vatId')}
          />
        </Field>

        <Field
          label="Steuernummer"
          htmlFor="taxNumber"
          error={errors.taxNumber?.message}
          hint="Eine der beiden Angaben genügt."
          className="sm:col-span-3"
        >
          <Input
            id="taxNumber"
            invalid={errors.taxNumber !== undefined}
            {...form.register('taxNumber')}
          />
        </Field>
      </div>

      <fieldset>
        <legend className="text-sm font-medium text-ink-muted">
          Womit rechnest du gewöhnlich ab?
        </legend>
        <p className="mt-0.5 text-sm text-ink-subtle">
          Das gewählte Profil schlägt jede neue Rechnung vor. Weitere Profile lassen sich später
          unter Einstellungen anlegen, und an jeder einzelnen Rechnung ist ein anderes wählbar.
        </p>

        <div className="mt-3 grid gap-2">
          {profiles.map((profile) => (
            <ChoiceRow
              key={profile.id}
              name="taxProfile"
              checked={choice === profile.id}
              onChange={() => onChoiceChange(profile.id)}
              title={profile.name}
              suffix={
                profile.kind === TAX_PROFILE_KIND.STANDARD
                  ? formatBasisPoints(profile.defaultRateBasisPoints)
                  : undefined
              }
              description={TAX_PROFILE_KIND_DESCRIPTIONS[profile.kind]}
            />
          ))}

          {!hasSmallBusiness && (
            <ChoiceRow
              name="taxProfile"
              checked={choice === CREATE_SMALL_BUSINESS}
              onChange={() => onChoiceChange(CREATE_SMALL_BUSINESS)}
              title={TAX_PROFILE_KIND_LABELS[TAX_PROFILE_KIND.SMALL_BUSINESS]}
              description={`${TAX_PROFILE_KIND_DESCRIPTIONS[TAX_PROFILE_KIND.SMALL_BUSINESS]} Das Profil „${SMALL_BUSINESS_TAX_PROFILE.name}" wird dabei angelegt.`}
            />
          )}
        </div>
      </fieldset>

      <div>
        <h3 className="text-sm font-medium text-ink-muted">E-Rechnung</h3>
        <p className="mt-0.5 text-sm text-ink-subtle">
          Nur für die XRechnung nötig, nicht für das PDF. An diese Adresse richtet der Empfänger
          seine Antwort — meist die eigene Rechnungs-E-Mail.
        </p>

        <div className="mt-3 grid gap-4 sm:grid-cols-6">
          <Field
            label="Elektronische Adresse"
            htmlFor="electronicAddress"
            error={errors.electronicAddress?.message}
            className="sm:col-span-4"
          >
            <Input
              id="electronicAddress"
              invalid={errors.electronicAddress !== undefined}
              {...form.register('electronicAddress')}
            />
          </Field>

          <Field
            label="Art der Adresse"
            htmlFor="electronicAddressScheme"
            error={errors.electronicAddressScheme?.message}
            className="sm:col-span-2"
          >
            <Select
              id="electronicAddressScheme"
              invalid={errors.electronicAddressScheme !== undefined}
              {...form.register('electronicAddressScheme')}
            >
              <option value="">— bitte wählen —</option>
              {ELECTRONIC_ADDRESS_SCHEME_VALUES.map((scheme) => (
                <option key={scheme} value={scheme}>
                  {ELECTRONIC_ADDRESS_SCHEME_LABELS[scheme as ElectronicAddressScheme]}
                </option>
              ))}
            </Select>
          </Field>
        </div>
      </div>
    </div>
  );
}
