import { Field } from '../../../components/ui/Field.js';
import { Input } from '../../../components/ui/Input.js';
import type { OnboardingForm } from '../onboardingFields.js';

/**
 * Wer die Rechnung stellt.
 *
 * Firmenname und Anschrift sind die einzigen Pflichtangaben dieses
 * Schrittes — § 14 UStG verlangt genau sie. Telefon und E-Mail stehen
 * daneben, weil die XRechnung sie später braucht; der Hinweis dazu steht
 * am Feld und nicht als Warnung, denn im PDF sind sie freiwillig.
 */
export function CompanyFields({ form }: { form: OnboardingForm }): JSX.Element {
  const errors = form.formState.errors;

  return (
    <div className="grid gap-4 sm:grid-cols-6">
      <Field
        label="Firmenname"
        htmlFor="companyName"
        required
        error={errors.companyName?.message}
        className="sm:col-span-6"
      >
        <Input
          id="companyName"
          autoFocus
          invalid={errors.companyName !== undefined}
          {...form.register('companyName')}
        />
      </Field>

      <Field
        label="Straße und Hausnummer"
        htmlFor="street"
        required
        error={errors.street?.message}
        className="sm:col-span-6"
      >
        <Input id="street" invalid={errors.street !== undefined} {...form.register('street')} />
      </Field>

      <Field
        label="PLZ"
        htmlFor="postalCode"
        required
        error={errors.postalCode?.message}
        className="sm:col-span-2"
      >
        <Input
          id="postalCode"
          invalid={errors.postalCode !== undefined}
          {...form.register('postalCode')}
        />
      </Field>

      <Field
        label="Ort"
        htmlFor="city"
        required
        error={errors.city?.message}
        className="sm:col-span-4"
      >
        <Input id="city" invalid={errors.city !== undefined} {...form.register('city')} />
      </Field>

      <Field
        label="Land"
        htmlFor="country"
        error={errors.country?.message}
        className="sm:col-span-2"
      >
        <Input id="country" invalid={errors.country !== undefined} {...form.register('country')} />
      </Field>

      <Field label="E-Mail" htmlFor="email" error={errors.email?.message} className="sm:col-span-4">
        <Input
          id="email"
          type="email"
          invalid={errors.email !== undefined}
          {...form.register('email')}
        />
      </Field>

      <Field
        label="Telefon"
        htmlFor="phone"
        error={errors.phone?.message}
        hint="Für die XRechnung verpflichtend, im PDF freiwillig."
        className="sm:col-span-3"
      >
        <Input id="phone" invalid={errors.phone !== undefined} {...form.register('phone')} />
      </Field>

      <Field
        label="Website"
        htmlFor="website"
        error={errors.website?.message}
        className="sm:col-span-3"
      >
        <Input
          id="website"
          placeholder="example.de"
          invalid={errors.website !== undefined}
          {...form.register('website')}
        />
      </Field>
    </div>
  );
}
