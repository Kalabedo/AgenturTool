import { useForm } from 'react-hook-form';
import { zodResolver } from '@hookform/resolvers/zod';
import {
  customerInputSchema,
  type CustomerInput,
  type CustomerPayload,
  type CustomerResponse,
} from '@agentur-tool/shared';
import { Button } from '../../components/ui/Button.js';
import { Card } from '../../components/ui/Card.js';
import { Field } from '../../components/ui/Field.js';
import { Input } from '../../components/ui/Input.js';
import { Textarea } from '../../components/ui/Textarea.js';

type FormValues = CustomerInput;

export function emptyCustomerValues(): FormValues {
  return {
    customerNumber: '',
    companyName: '',
    contactName: '',
    addressLine: '',
    street: '',
    postalCode: '',
    city: '',
    country: 'DE',
    email: '',
    vatId: '',
    notes: '',
    defaultPaymentTermDays: '',
  };
}

export function toCustomerValues(customer: CustomerResponse): FormValues {
  return {
    customerNumber: customer.customerNumber ?? '',
    companyName: customer.companyName,
    contactName: customer.contactName ?? '',
    addressLine: customer.addressLine ?? '',
    street: customer.street,
    postalCode: customer.postalCode,
    city: customer.city,
    country: customer.country,
    email: customer.email ?? '',
    vatId: customer.vatId ?? '',
    notes: customer.notes ?? '',
    defaultPaymentTermDays:
      customer.defaultPaymentTermDays === null ? '' : String(customer.defaultPaymentTermDays),
  };
}

interface CustomerFormProps {
  defaultValues: FormValues;
  submitLabel: string;
  isSubmitting: boolean;
  onSubmit: (payload: CustomerPayload) => void;
  /** Zusätzliche Bedienelemente rechts neben dem Speichern-Knopf. */
  secondaryActions?: React.ReactNode;
  /** Serverseitige Feldfehler, die beim Absenden zurückkamen. */
  fieldErrors?: Record<string, string>;
  generalError?: string | null;
}

export function CustomerForm({
  defaultValues,
  submitLabel,
  isSubmitting,
  onSubmit,
  secondaryActions,
  fieldErrors,
  generalError,
}: CustomerFormProps): JSX.Element {
  const form = useForm<FormValues, unknown, CustomerPayload>({
    resolver: zodResolver(customerInputSchema),
    defaultValues,
  });

  const errors = form.formState.errors;

  /** Client- und Serverfehler zusammenführen; der Serverfehler hat Vorrang. */
  const errorFor = (field: keyof FormValues): string | undefined =>
    fieldErrors?.[field] ?? errors[field]?.message;

  return (
    <form onSubmit={form.handleSubmit(onSubmit)} className="space-y-6" noValidate>
      <Card title="Kunde">
        <div className="grid gap-4 sm:grid-cols-6">
          <Field
            label="Firma oder Name"
            htmlFor="companyName"
            required
            error={errorFor('companyName')}
            className="sm:col-span-4"
          >
            <Input
              id="companyName"
              autoFocus
              invalid={errorFor('companyName') !== undefined}
              {...form.register('companyName')}
            />
          </Field>

          <Field
            label="Kundennummer"
            htmlFor="customerNumber"
            error={errorFor('customerNumber')}
            hint="Frei wählbar, muss aber eindeutig sein"
            className="sm:col-span-2"
          >
            <Input
              id="customerNumber"
              invalid={errorFor('customerNumber') !== undefined}
              {...form.register('customerNumber')}
            />
          </Field>

          <Field
            label="Ansprechpartner"
            htmlFor="contactName"
            error={errorFor('contactName')}
            className="sm:col-span-3"
          >
            <Input
              id="contactName"
              invalid={errorFor('contactName') !== undefined}
              {...form.register('contactName')}
            />
          </Field>

          <Field
            label="Adresszusatz"
            htmlFor="addressLine"
            error={errorFor('addressLine')}
            hint="z. B. „z. Hd. Buchhaltung“"
            className="sm:col-span-3"
          >
            <Input
              id="addressLine"
              invalid={errorFor('addressLine') !== undefined}
              {...form.register('addressLine')}
            />
          </Field>
        </div>
      </Card>

      <Card title="Anschrift">
        <div className="grid gap-4 sm:grid-cols-6">
          <Field
            label="Straße und Hausnummer"
            htmlFor="street"
            error={errorFor('street')}
            className="sm:col-span-6"
          >
            <Input
              id="street"
              invalid={errorFor('street') !== undefined}
              {...form.register('street')}
            />
          </Field>
          <Field
            label="PLZ"
            htmlFor="postalCode"
            error={errorFor('postalCode')}
            className="sm:col-span-2"
          >
            <Input
              id="postalCode"
              invalid={errorFor('postalCode') !== undefined}
              {...form.register('postalCode')}
            />
          </Field>
          <Field label="Ort" htmlFor="city" error={errorFor('city')} className="sm:col-span-4">
            <Input id="city" invalid={errorFor('city') !== undefined} {...form.register('city')} />
          </Field>
          <Field
            label="Land"
            htmlFor="country"
            error={errorFor('country')}
            className="sm:col-span-3"
          >
            <Input
              id="country"
              invalid={errorFor('country') !== undefined}
              {...form.register('country')}
            />
          </Field>
        </div>
      </Card>

      <Card title="Kontakt und Steuer">
        <div className="grid gap-4 sm:grid-cols-6">
          <Field label="E-Mail" htmlFor="email" error={errorFor('email')} className="sm:col-span-3">
            <Input
              id="email"
              type="email"
              invalid={errorFor('email') !== undefined}
              {...form.register('email')}
            />
          </Field>
          <Field
            label="USt-IdNr."
            htmlFor="vatId"
            error={errorFor('vatId')}
            hint="Bei Reverse Charge erforderlich"
            className="sm:col-span-3"
          >
            <Input
              id="vatId"
              invalid={errorFor('vatId') !== undefined}
              {...form.register('vatId')}
            />
          </Field>
        </div>
      </Card>

      <Card title="Vorgaben und Notizen">
        <div className="grid gap-4 sm:grid-cols-6">
          <Field
            label="Abweichendes Zahlungsziel"
            htmlFor="defaultPaymentTermDays"
            error={errorFor('defaultPaymentTermDays')}
            hint="Leer lassen, um die Vorgabe aus den Unternehmensdaten zu verwenden"
            className="sm:col-span-6"
          >
            <Input
              id="defaultPaymentTermDays"
              type="number"
              min={0}
              max={365}
              className="sm:w-32"
              invalid={errorFor('defaultPaymentTermDays') !== undefined}
              {...form.register('defaultPaymentTermDays')}
            />
          </Field>

          <Field
            label="Interne Notiz"
            htmlFor="notes"
            error={errorFor('notes')}
            hint="Nur für dich — erscheint nicht auf der Rechnung"
            className="sm:col-span-6"
          >
            <Textarea
              id="notes"
              invalid={errorFor('notes') !== undefined}
              {...form.register('notes')}
            />
          </Field>
        </div>
      </Card>

      <div className="flex flex-wrap items-center gap-3">
        <Button type="submit" disabled={isSubmitting}>
          {isSubmitting ? 'wird gespeichert …' : submitLabel}
        </Button>
        {secondaryActions}
        {generalError != null && <span className="text-sm text-rose-600">{generalError}</span>}
      </div>
    </form>
  );
}
