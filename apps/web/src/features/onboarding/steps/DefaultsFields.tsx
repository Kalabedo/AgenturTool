import { Field } from '../../../components/ui/Field.js';
import { Input } from '../../../components/ui/Input.js';
import type { OnboardingForm } from '../onboardingFields.js';

/**
 * Vorschläge, keine Festlegungen.
 *
 * Beide Werte lassen sich an jeder einzelnen Rechnung überschreiben — und
 * der Stundensatz später zusätzlich je Projekt. Der Satz darunter sagt das
 * ausdrücklich, weil ein Feld in einer Einrichtung sonst endgültiger wirkt,
 * als es ist.
 */
export function DefaultsFields({ form }: { form: OnboardingForm }): JSX.Element {
  const errors = form.formState.errors;

  return (
    <div className="grid gap-4 sm:grid-cols-6">
      <Field
        label="Zahlungsziel in Tagen"
        htmlFor="defaultPaymentTermDays"
        error={errors.defaultPaymentTermDays?.message}
        hint="Vorschlag für das Fälligkeitsdatum neuer Rechnungen"
        className="sm:col-span-3"
      >
        <Input
          id="defaultPaymentTermDays"
          type="number"
          min={0}
          max={365}
          autoFocus
          invalid={errors.defaultPaymentTermDays !== undefined}
          className="sm:w-32"
          {...form.register('defaultPaymentTermDays')}
        />
      </Field>

      <Field
        label="Standard-Stundensatz"
        htmlFor="defaultHourlyRateCents"
        error={errors.defaultHourlyRateCents?.message}
        hint="Netto, in Euro. Leer lassen, wenn du nicht nach Stunden abrechnest."
        className="sm:col-span-3"
      >
        <Input
          id="defaultHourlyRateCents"
          inputMode="decimal"
          placeholder="z. B. 85,00"
          invalid={errors.defaultHourlyRateCents !== undefined}
          className="sm:w-40"
          {...form.register('defaultHourlyRateCents')}
        />
      </Field>
    </div>
  );
}
