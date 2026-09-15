import { useState } from 'react';
import { useForm } from 'react-hook-form';
import { zodResolver } from '@hookform/resolvers/zod';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import {
  formatIban,
  updateCompanySchema,
  type CompanyResponse,
  type UpdateCompanyPayload,
  ELECTRONIC_ADDRESS_SCHEME_LABELS,
  ELECTRONIC_ADDRESS_SCHEME_VALUES,
  type ElectronicAddressScheme,
} from '@privatura/shared';
import { ApiRequestError, apiClient } from '../../../lib/apiClient.js';
import { queryKeys } from '../../../lib/queryKeys.js';
import { Button } from '../../../components/ui/Button.js';
import { Card } from '../../../components/ui/Card.js';
import { Field } from '../../../components/ui/Field.js';
import { FormActions } from '../../../components/ui/FormActions.js';
import { Input } from '../../../components/ui/Input.js';
import { PageHeader } from '../../../components/ui/PageHeader.js';
import { StatusText } from '../../../components/ui/StatusText.js';
import { Select } from '../../../components/ui/Select.js';
import { LogoUpload } from './LogoUpload.js';
import { toCompanyFormValues, type CompanyFormValues } from './companyFormValues.js';
import { ErrorNotice } from '../../../components/ui/ErrorNotice.js';
import { formErrorOf } from '../../../lib/errorMessage.js';
import { LoadingNote } from '../../../components/ui/LoadingNote.js';
import { useDocumentTitle } from '../../../lib/useDocumentTitle.js';

type FormValues = CompanyFormValues;

export function CompanyPage(): JSX.Element {
  useDocumentTitle('Unternehmensdaten');
  const queryClient = useQueryClient();
  const [saved, setSaved] = useState(false);

  const company = useQuery({
    queryKey: queryKeys.company,
    queryFn: () => apiClient.get<CompanyResponse>('/company'),
  });

  const form = useForm<FormValues, unknown, UpdateCompanyPayload>({
    // Dasselbe Schema, das der Server benutzt — eine Validierungsquelle
    // statt zweier, die auseinanderlaufen können.
    resolver: zodResolver(updateCompanySchema),
    values: company.data === undefined ? undefined : toCompanyFormValues(company.data),
  });

  const save = useMutation({
    mutationFn: (values: UpdateCompanyPayload) =>
      apiClient.put<CompanyResponse>('/company', values),
    onSuccess: (updated) => {
      queryClient.setQueryData(queryKeys.company, updated);
      form.reset(toCompanyFormValues(updated));
      setSaved(true);
    },
    onError: (cause: unknown) => {
      // Feldbezogene Serverfehler an die richtige Stelle im Formular
      // hängen. Sie sollten selten auftreten, weil dasselbe Schema schon im
      // Browser lief — aber wenn doch, gehören sie ans Feld und nicht in
      // einen anonymen Sammelhinweis.
      if (cause instanceof ApiRequestError) {
        for (const [field, message] of Object.entries(cause.fieldErrors())) {
          form.setError(field as keyof FormValues, { message });
        }
      }
    },
  });

  if (company.isLoading) {
    return <LoadingNote>Unternehmensdaten werden geladen …</LoadingNote>;
  }

  if (company.isError) {
    return (
      <ErrorNotice
        error={company.error}
        title="Die Unternehmensdaten konnten nicht geladen werden."
        onRetry={() => void company.refetch()}
      />
    );
  }

  const errors = form.formState.errors;
  const generalError = formErrorOf(save.error);

  return (
    <form
      onSubmit={form.handleSubmit((values) => save.mutate(values))}
      className="space-y-6"
      noValidate
    >
      <PageHeader
        title="Unternehmensdaten"
        description="Diese Angaben erscheinen auf jeder Rechnung. Sie werden beim Finalisieren als unveränderlicher Snapshot festgehalten — spätere Änderungen wirken sich nicht auf bereits ausgestellte Rechnungen aus."
      />

      <Card title="Logo" description="Erscheint im Kopf der Rechnung">
        <LogoUpload logoUrl={company.data?.logoUrl ?? null} />
      </Card>

      <Card title="Firma und Anschrift">
        <div className="grid gap-4 sm:grid-cols-6">
          <Field
            label="Firmenname"
            htmlFor="companyName"
            error={errors.companyName?.message}
            className="sm:col-span-6"
          >
            <Input
              id="companyName"
              invalid={errors.companyName !== undefined}
              {...form.register('companyName')}
            />
          </Field>

          <Field
            label="Straße und Hausnummer"
            htmlFor="street"
            error={errors.street?.message}
            className="sm:col-span-6"
          >
            <Input id="street" invalid={errors.street !== undefined} {...form.register('street')} />
          </Field>

          <Field
            label="PLZ"
            htmlFor="postalCode"
            error={errors.postalCode?.message}
            className="sm:col-span-2"
          >
            <Input
              id="postalCode"
              invalid={errors.postalCode !== undefined}
              {...form.register('postalCode')}
            />
          </Field>

          <Field label="Ort" htmlFor="city" error={errors.city?.message} className="sm:col-span-4">
            <Input id="city" invalid={errors.city !== undefined} {...form.register('city')} />
          </Field>

          <Field
            label="Land"
            htmlFor="country"
            error={errors.country?.message}
            className="sm:col-span-2"
          >
            <Input
              id="country"
              invalid={errors.country !== undefined}
              {...form.register('country')}
            />
          </Field>
        </div>
      </Card>

      <Card title="Kontakt">
        <div className="grid gap-4 sm:grid-cols-6">
          <Field
            label="E-Mail"
            htmlFor="email"
            error={errors.email?.message}
            className="sm:col-span-3"
          >
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
            className="sm:col-span-3"
          >
            <Input id="phone" invalid={errors.phone !== undefined} {...form.register('phone')} />
          </Field>
          <Field
            label="Website"
            htmlFor="website"
            error={errors.website?.message}
            className="sm:col-span-6"
          >
            <Input
              id="website"
              placeholder="example.de"
              invalid={errors.website !== undefined}
              {...form.register('website')}
            />
          </Field>
        </div>
      </Card>

      <Card
        title="Steuerliche Angaben"
        description="Eine Rechnung braucht mindestens eine der beiden Angaben."
      >
        <div className="grid gap-4 sm:grid-cols-6">
          <Field
            label="USt-IdNr."
            htmlFor="vatId"
            error={errors.vatId?.message}
            hint="Mit Ländercode, z. B. DE123456789"
            className="sm:col-span-3"
          >
            <Input id="vatId" invalid={errors.vatId !== undefined} {...form.register('vatId')} />
          </Field>
          <Field
            label="Steuernummer"
            htmlFor="taxNumber"
            error={errors.taxNumber?.message}
            className="sm:col-span-3"
          >
            <Input
              id="taxNumber"
              invalid={errors.taxNumber !== undefined}
              {...form.register('taxNumber')}
            />
          </Field>
        </div>
      </Card>

      <Card
        title="E-Rechnung"
        description="Wird nur für die XRechnung gebraucht, nicht für das PDF."
      >
        <div className="grid gap-4 sm:grid-cols-6">
          <Field
            label="Elektronische Adresse"
            htmlFor="electronicAddress"
            error={errors.electronicAddress?.message}
            hint="An diese Adresse richtet der Empfänger seine Antwort. Meist die eigene Rechnungs-E-Mail."
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
      </Card>

      <Card title="Bankverbindung" description="Erscheint als Zahlungsangabe auf der Rechnung">
        <div className="grid gap-4 sm:grid-cols-6">
          <Field
            label="Kontoinhaber"
            htmlFor="bankAccountHolder"
            error={errors.bankAccountHolder?.message}
            className="sm:col-span-4"
          >
            <Input
              id="bankAccountHolder"
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
                // Beim Verlassen des Feldes in Viererblöcke gruppieren —
                // so lässt sie sich gegen den Kontoauszug prüfen.
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
      </Card>

      <Card title="Rechnungsvorgaben">
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
      </Card>

      <FormActions
        status={
          generalError !== null ? (
            <StatusText tone="error">{generalError}</StatusText>
          ) : form.formState.isDirty ? (
            <StatusText tone="muted">Ungespeicherte Änderungen</StatusText>
          ) : saved ? (
            <StatusText tone="success">Gespeichert.</StatusText>
          ) : null
        }
      >
        <Button
          type="submit"
          disabled={!form.formState.isDirty}
          pending={save.isPending}
          pendingLabel="wird gespeichert …"
        >
          Speichern
        </Button>
      </FormActions>
    </form>
  );
}
