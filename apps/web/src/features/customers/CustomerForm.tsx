import { useForm } from 'react-hook-form';
import { zodResolver } from '@hookform/resolvers/zod';
import { useQuery } from '@tanstack/react-query';
import {
  ELECTRONIC_ADDRESS_SCHEME_LABELS,
  ELECTRONIC_ADDRESS_SCHEME_VALUES,
  TAX_PROFILE_KIND_LABELS,
  allowsRateInput,
  customerInputSchema,
  formatBasisPoints,
  type CustomerInput,
  type CustomerPayload,
  type CustomerResponse,
  type ElectronicAddressScheme,
  type TaxProfileResponse,
} from '@privatura/shared';
import { apiClient } from '../../lib/apiClient.js';
import { queryKeys } from '../../lib/queryKeys.js';
import { Select } from '../../components/ui/Select.js';
import { Button } from '../../components/ui/Button.js';
import { Card } from '../../components/ui/Card.js';
import { Field } from '../../components/ui/Field.js';
import { FormActions } from '../../components/ui/FormActions.js';
import { Input } from '../../components/ui/Input.js';
import { StatusText } from '../../components/ui/StatusText.js';
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
    buyerReference: '',
    electronicAddress: '',
    electronicAddressScheme: '',
    notes: '',
    defaultPaymentTermDays: '',
    defaultTaxProfileId: '',
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
    buyerReference: customer.buyerReference ?? '',
    electronicAddress: customer.electronicAddress ?? '',
    electronicAddressScheme: customer.electronicAddressScheme ?? '',
    notes: customer.notes ?? '',
    defaultPaymentTermDays:
      customer.defaultPaymentTermDays === null ? '' : String(customer.defaultPaymentTermDays),
    defaultTaxProfileId:
      customer.defaultTaxProfileId === null ? '' : String(customer.defaultTaxProfileId),
  };
}

interface CustomerFormProps {
  defaultValues: FormValues;
  submitLabel: string;
  isSubmitting: boolean;
  onSubmit: (payload: CustomerPayload) => void;
  /** Zusätzliche Schaltflächen neben dem Speichern-Knopf. */
  secondaryActions?: React.ReactNode;
  /** Rückmeldung zum Speichern — steht rechts in der Leiste. */
  status?: React.ReactNode;
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
  status,
  fieldErrors,
  generalError,
}: CustomerFormProps): JSX.Element {
  const form = useForm<FormValues, unknown, CustomerPayload>({
    resolver: zodResolver(customerInputSchema),
    defaultValues,
  });

  // Nur aktive Profile zur Auswahl. Ein bereits zugeordnetes archiviertes
  // Profil bliebe sonst unsichtbar und würde beim nächsten Speichern still
  // verloren gehen — deshalb wird es unten ergänzt, wenn es fehlt.
  const taxProfiles = useQuery({
    queryKey: queryKeys.taxProfiles.list(false),
    queryFn: () => apiClient.get<TaxProfileResponse[]>('/tax-profiles?includeArchived=false'),
  });

  const selectedProfileId = defaultValues.defaultTaxProfileId;
  const profileOptions = taxProfiles.data ?? [];
  const selectedIsMissing =
    typeof selectedProfileId === 'string' &&
    selectedProfileId !== '' &&
    !profileOptions.some((profile) => String(profile.id) === selectedProfileId);

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
          {/* „DE" braucht keine halbe Zeile. Ein Feld sollte so breit sein
              wie das, was hineingehört — sonst sieht ein Formular aus, als
              wären die Breiten gewürfelt. */}
          <Field
            label="Land"
            htmlFor="country"
            error={errorFor('country')}
            className="sm:col-span-2"
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

      <Card
        title="E-Rechnung"
        description="Nur für die XRechnung. Ohne diese Angaben entsteht weiterhin ein PDF."
      >
        <div className="grid gap-4 sm:grid-cols-6">
          <Field
            label="Leitweg-ID / Referenz des Käufers"
            htmlFor="buyerReference"
            error={errorFor('buyerReference')}
            hint="Vergibt der Auftraggeber. Bei Behörden die Leitweg-ID, sonst die Bestell- oder Kostenstellennummer."
            className="sm:col-span-6"
          >
            <Input
              id="buyerReference"
              invalid={errorFor('buyerReference') !== undefined}
              {...form.register('buyerReference')}
            />
          </Field>
          <Field
            label="Elektronische Adresse"
            htmlFor="electronicAddress"
            error={errorFor('electronicAddress')}
            hint="Wohin die E-Rechnung zugestellt wird. Meist die Rechnungs-E-Mail des Kunden."
            className="sm:col-span-4"
          >
            <Input
              id="electronicAddress"
              invalid={errorFor('electronicAddress') !== undefined}
              {...form.register('electronicAddress')}
            />
          </Field>
          <Field
            label="Art der Adresse"
            htmlFor="electronicAddressScheme"
            error={errorFor('electronicAddressScheme')}
            className="sm:col-span-2"
          >
            <Select
              id="electronicAddressScheme"
              invalid={errorFor('electronicAddressScheme') !== undefined}
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
            label="Standard-Steuerprofil"
            htmlFor="defaultTaxProfileId"
            error={errorFor('defaultTaxProfileId')}
            hint="Wird beim Erstellen einer Rechnung vorgeschlagen. Leer lassen, um das allgemeine Standardprofil zu verwenden."
            className="sm:col-span-6"
          >
            <Select
              id="defaultTaxProfileId"
              className="sm:max-w-md"
              invalid={errorFor('defaultTaxProfileId') !== undefined}
              {...form.register('defaultTaxProfileId')}
            >
              <option value="">Standardprofil verwenden</option>
              {profileOptions.map((profile) => (
                <option key={profile.id} value={profile.id}>
                  {profile.name}
                  {allowsRateInput(profile.kind)
                    ? ` — ${formatBasisPoints(profile.defaultRateBasisPoints)}`
                    : ` — ${TAX_PROFILE_KIND_LABELS[profile.kind]}`}
                </option>
              ))}
              {selectedIsMissing && (
                <option value={selectedProfileId}>Bisher zugeordnetes Profil (archiviert)</option>
              )}
            </Select>
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

      <FormActions
        status={
          generalError != null ? <StatusText tone="error">{generalError}</StatusText> : status
        }
      >
        <Button type="submit" pending={isSubmitting} pendingLabel="wird gespeichert …">
          {submitLabel}
        </Button>
        {secondaryActions}
      </FormActions>
    </form>
  );
}
