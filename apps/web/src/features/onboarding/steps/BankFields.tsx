import { formatIban } from '@privatura/shared';
import { Field } from '../../../components/ui/Field.js';
import { Input } from '../../../components/ui/Input.js';
import type { OnboardingForm } from '../onboardingFields.js';

/** Wohin gezahlt werden soll. */
export function BankFields({ form }: { form: OnboardingForm }): JSX.Element {
  const errors = form.formState.errors;

  return (
    <div className="grid gap-4 sm:grid-cols-6">
      <Field
        label="Kontoinhaber"
        htmlFor="bankAccountHolder"
        error={errors.bankAccountHolder?.message}
        className="sm:col-span-4"
      >
        <Input
          id="bankAccountHolder"
          autoFocus
          invalid={errors.bankAccountHolder !== undefined}
          {...form.register('bankAccountHolder')}
        />
      </Field>

      <Field
        label="Bank"
        htmlFor="bankName"
        error={errors.bankName?.message}
        className="sm:col-span-2"
      >
        <Input
          id="bankName"
          invalid={errors.bankName !== undefined}
          {...form.register('bankName')}
        />
      </Field>

      <Field
        label="IBAN"
        htmlFor="iban"
        error={errors.iban?.message}
        hint="Die Prüfsumme wird beim Speichern kontrolliert"
        className="sm:col-span-4"
      >
        <Input
          id="iban"
          invalid={errors.iban !== undefined}
          {...form.register('iban', {
            // Wie auf der Einstellungsseite: beim Verlassen in Viererblöcke
            // gruppieren, damit sich die Zahl gegen den Kontoauszug prüfen
            // lässt.
            onBlur: (event) => {
              const value = (event.target as HTMLInputElement).value;
              if (value.trim() !== '') {
                form.setValue('iban', formatIban(value), { shouldValidate: true });
              }
            },
          })}
        />
      </Field>

      <Field label="BIC" htmlFor="bic" error={errors.bic?.message} className="sm:col-span-2">
        <Input id="bic" invalid={errors.bic !== undefined} {...form.register('bic')} />
      </Field>
    </div>
  );
}
