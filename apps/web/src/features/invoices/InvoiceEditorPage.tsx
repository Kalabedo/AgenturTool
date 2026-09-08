import { useMemo, useState } from 'react';
import { useFieldArray, useForm, useWatch } from 'react-hook-form';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { Link, useNavigate, useParams } from 'react-router-dom';
import {
  CUSTOMER_ARCHIVE_FILTER,
  INVOICE_STATUS_LABELS,
  formatCents,
  formatBasisPoints,
  invoiceDisplayName,
  isEditable,
  type CustomerResponse,
  type InvoiceResponse,
  type TaxProfileResponse,
} from '@agentur-tool/shared';
import { ApiRequestError, apiClient } from '../../lib/apiClient.js';
import { queryKeys } from '../../lib/queryKeys.js';
import { Button } from '../../components/ui/Button.js';
import { Card } from '../../components/ui/Card.js';
import { Field } from '../../components/ui/Field.js';
import { Input } from '../../components/ui/Input.js';
import { Select } from '../../components/ui/Select.js';
import { Textarea } from '../../components/ui/Textarea.js';
import { InvoiceItemsTable } from './InvoiceItemsTable.js';
import { useInvoiceTotals } from './useInvoiceTotals.js';
import {
  toInvoiceFormValues,
  toInvoicePayload,
  type InvoiceFormValues,
} from './invoiceFormValues.js';

export function InvoiceEditorPage(): JSX.Element {
  const { id } = useParams<{ id: string }>();
  const invoiceId = Number(id);
  const navigate = useNavigate();
  const queryClient = useQueryClient();
  const [saved, setSaved] = useState(false);
  const [deleted, setDeleted] = useState(false);

  const invoice = useQuery({
    queryKey: queryKeys.invoices.byId(invoiceId),
    queryFn: () => apiClient.get<InvoiceResponse>(`/invoices/${invoiceId}`),
    enabled: Number.isInteger(invoiceId) && !deleted,
  });

  const customers = useQuery({
    queryKey: queryKeys.customers.list('', CUSTOMER_ARCHIVE_FILTER.ACTIVE),
    queryFn: () => apiClient.get<CustomerResponse[]>('/customers?archived=active'),
  });

  const taxProfiles = useQuery({
    queryKey: queryKeys.taxProfiles.list(false),
    queryFn: () => apiClient.get<TaxProfileResponse[]>('/tax-profiles?includeArchived=false'),
  });

  /**
   * Die Formularwerte müssen eine stabile Referenz behalten.
   *
   * `values` setzt das Formular zurück, sobald sich die Referenz ändert.
   * Ohne dieses useMemo entstünde bei jedem Render ein neues Objekt, das
   * Formular würde fortlaufend zurückgesetzt, und gerade getippte Werte
   * gingen verloren — bei einer neu hinzugefügten Position sichtbar daran,
   * dass ihr Betrag auf 0,00 € stehen blieb.
   */
  const formValues = useMemo(
    () => (invoice.data === undefined ? undefined : toInvoiceFormValues(invoice.data)),
    [invoice.data],
  );

  const form = useForm<InvoiceFormValues>({
    // Die Validierung läuft serverseitig über dasselbe Schema; die Antwort
    // liefert Feldfehler zurück. Ein Resolver hier müsste die Formularwerte
    // erst in die Payload-Form bringen, was den Nutzen nicht aufwiegt.
    defaultValues: formValues,
    values: formValues,
    // Ein Hintergrund-Refetch darf nicht überschreiben, was gerade getippt wird.
    resetOptions: { keepDirtyValues: true },
  });

  const fieldArray = useFieldArray({ control: form.control, name: 'items' });

  // useWatch statt form.watch: Es abonniert gezielt und liefert bei jeder
  // Eingabe neue Werte, statt das Array der Feldliste weiterzureichen.
  const watchedItems = useWatch({ control: form.control, name: 'items' });
  const calculation = useInvoiceTotals(watchedItems ?? []);

  const save = useMutation({
    mutationFn: (values: InvoiceFormValues) =>
      apiClient.patch<InvoiceResponse>(`/invoices/${invoiceId}`, toInvoicePayload(values)),
    onSuccess: async (updated) => {
      queryClient.setQueryData(queryKeys.invoices.byId(invoiceId), updated);
      await queryClient.invalidateQueries({ queryKey: queryKeys.invoices.all });
      form.reset(toInvoiceFormValues(updated));
      setSaved(true);
    },
  });

  const refreshCustomer = useMutation({
    mutationFn: () =>
      apiClient.post<InvoiceResponse>(`/invoices/${invoiceId}/refresh-customer`, {}),
    onSuccess: (updated) => {
      queryClient.setQueryData(queryKeys.invoices.byId(invoiceId), updated);
      form.reset(toInvoiceFormValues(updated));
    },
  });

  const remove = useMutation({
    mutationFn: () => apiClient.delete<void>(`/invoices/${invoiceId}`),
    onSuccess: async () => {
      setDeleted(true);
      queryClient.removeQueries({ queryKey: queryKeys.invoices.byId(invoiceId) });
      await queryClient.invalidateQueries({ queryKey: queryKeys.invoices.all });
      navigate('/invoices', { replace: true });
    },
  });

  if (deleted || invoice.isLoading) {
    return <p className="text-sm text-slate-500">Rechnung wird geladen …</p>;
  }

  if (invoice.isError || invoice.data === undefined) {
    return (
      <div className="rounded-lg border border-rose-200 bg-rose-50 p-5">
        <p className="text-sm text-rose-800">Diese Rechnung wurde nicht gefunden.</p>
        <Link to="/invoices" className="mt-3 inline-block text-sm font-medium underline">
          Zurück zur Übersicht
        </Link>
      </div>
    );
  }

  const data = invoice.data;
  const editable = isEditable(data.status);
  const saveError = save.error instanceof ApiRequestError ? save.error : null;
  const fieldErrors = saveError?.fieldErrors();

  const errorFor = (field: string): string | undefined => fieldErrors?.[field];

  /** Übernimmt Adresse, Steuerprofil und Kundennummer aus dem gewählten Kunden. */
  const applyCustomer = (customerId: string): void => {
    const customer = customers.data?.find((entry) => String(entry.id) === customerId);
    if (customer === undefined) return;

    form.setValue('companyName', customer.companyName, { shouldDirty: true });
    form.setValue('contactName', customer.contactName ?? '', { shouldDirty: true });
    form.setValue('addressLine', customer.addressLine ?? '', { shouldDirty: true });
    form.setValue('street', customer.street, { shouldDirty: true });
    form.setValue('postalCode', customer.postalCode, { shouldDirty: true });
    form.setValue('city', customer.city, { shouldDirty: true });
    form.setValue('country', customer.country, { shouldDirty: true });
    form.setValue('email', customer.email ?? '', { shouldDirty: true });
    form.setValue('vatId', customer.vatId ?? '', { shouldDirty: true });
    form.setValue('customerNumber', customer.customerNumber ?? '', { shouldDirty: true });

    if (customer.defaultTaxProfileId !== null) {
      form.setValue('taxProfileId', String(customer.defaultTaxProfileId), { shouldDirty: true });
    }
  };

  return (
    <form
      onSubmit={form.handleSubmit((values) => {
        setSaved(false);
        save.mutate(values);
      })}
      className="space-y-6"
      noValidate
    >
      <div>
        <Link to="/invoices" className="text-sm text-slate-500 hover:underline">
          ← Rechnungen
        </Link>
        <div className="mt-1 flex flex-wrap items-center gap-3">
          <h1 className="text-xl font-semibold text-slate-900">{invoiceDisplayName(data)}</h1>
          <span className="rounded bg-slate-100 px-2 py-0.5 text-xs text-slate-600">
            {INVOICE_STATUS_LABELS[data.status]}
          </span>
        </div>
        <p className="mt-1 text-sm text-slate-500">
          Entwürfe bekommen erst beim Finalisieren eine Rechnungsnummer — so entstehen keine Lücken,
          wenn ein Entwurf verworfen wird.
        </p>
      </div>

      {!editable && (
        <div className="rounded-lg border border-amber-200 bg-amber-50 p-4">
          <p className="text-sm text-amber-900">
            Diese Rechnung ist finalisiert und kann nicht mehr geändert werden.
          </p>
        </div>
      )}

      <Card title="Empfänger">
        <div className="grid gap-4 sm:grid-cols-6">
          <Field
            label="Kunde"
            htmlFor="customerId"
            error={errorFor('customerId')}
            className="sm:col-span-4"
          >
            <Select
              id="customerId"
              disabled={!editable}
              {...form.register('customerId', {
                onChange: (event) => applyCustomer((event.target as HTMLSelectElement).value),
              })}
            >
              <option value="">Kein Kunde ausgewählt</option>
              {(customers.data ?? []).map((customer) => (
                <option key={customer.id} value={customer.id}>
                  {customer.companyName}
                  {customer.customerNumber === null ? '' : ` (${customer.customerNumber})`}
                </option>
              ))}
            </Select>
          </Field>

          <div className="flex items-end sm:col-span-2">
            {data.customerId !== null && editable && (
              <Button
                variant="secondary"
                onClick={() => refreshCustomer.mutate()}
                disabled={refreshCustomer.isPending}
              >
                Kundendaten neu übernehmen
              </Button>
            )}
          </div>

          <Field
            label="Firma oder Name"
            htmlFor="companyName"
            required
            error={errorFor('buyerData.companyName')}
            className="sm:col-span-4"
          >
            <Input id="companyName" disabled={!editable} {...form.register('companyName')} />
          </Field>
          <Field label="Kundennummer" htmlFor="customerNumber" className="sm:col-span-2">
            <Input id="customerNumber" disabled={!editable} {...form.register('customerNumber')} />
          </Field>

          <Field label="Ansprechpartner" htmlFor="contactName" className="sm:col-span-3">
            <Input id="contactName" disabled={!editable} {...form.register('contactName')} />
          </Field>
          <Field label="Adresszusatz" htmlFor="addressLine" className="sm:col-span-3">
            <Input id="addressLine" disabled={!editable} {...form.register('addressLine')} />
          </Field>

          <Field label="Straße und Hausnummer" htmlFor="street" className="sm:col-span-6">
            <Input id="street" disabled={!editable} {...form.register('street')} />
          </Field>
          <Field label="PLZ" htmlFor="postalCode" className="sm:col-span-2">
            <Input id="postalCode" disabled={!editable} {...form.register('postalCode')} />
          </Field>
          <Field label="Ort" htmlFor="city" className="sm:col-span-4">
            <Input id="city" disabled={!editable} {...form.register('city')} />
          </Field>
          <Field label="Land" htmlFor="country" className="sm:col-span-3">
            <Input id="country" disabled={!editable} {...form.register('country')} />
          </Field>
          <Field label="USt-IdNr." htmlFor="vatId" className="sm:col-span-3">
            <Input id="vatId" disabled={!editable} {...form.register('vatId')} />
          </Field>
        </div>
      </Card>

      <Card title="Rechnungsdaten">
        <div className="grid gap-4 sm:grid-cols-4">
          <Field
            label="Rechnungsdatum"
            htmlFor="invoiceDate"
            required
            error={errorFor('invoiceDate')}
          >
            <Input
              id="invoiceDate"
              type="date"
              disabled={!editable}
              {...form.register('invoiceDate')}
            />
          </Field>
          <Field
            label="Leistungsdatum"
            htmlFor="serviceDate"
            required
            error={errorFor('serviceDate')}
          >
            <Input
              id="serviceDate"
              type="date"
              disabled={!editable}
              {...form.register('serviceDate')}
            />
          </Field>
          <Field
            label="Leistung bis"
            htmlFor="serviceDateTo"
            error={errorFor('serviceDateTo')}
            hint="optional"
          >
            <Input
              id="serviceDateTo"
              type="date"
              disabled={!editable}
              {...form.register('serviceDateTo')}
            />
          </Field>
          <Field label="Fällig am" htmlFor="dueDate" required error={errorFor('dueDate')}>
            <Input id="dueDate" type="date" disabled={!editable} {...form.register('dueDate')} />
          </Field>

          <Field
            label="Steuerprofil"
            htmlFor="taxProfileId"
            error={errorFor('taxProfileId')}
            hint="Setzt den Vorschlag für neue Positionen"
            className="sm:col-span-2"
          >
            <Select id="taxProfileId" disabled={!editable} {...form.register('taxProfileId')}>
              <option value="">Kein Profil</option>
              {(taxProfiles.data ?? []).map((profile) => (
                <option key={profile.id} value={profile.id}>
                  {profile.name}
                </option>
              ))}
            </Select>
          </Field>
        </div>
      </Card>

      <div>
        <h2 className="mb-2 text-base font-semibold text-slate-900">Positionen</h2>
        <InvoiceItemsTable
          form={form as never}
          fieldArray={fieldArray}
          calculation={calculation}
          fieldErrors={fieldErrors}
        />
      </div>

      <div className="flex justify-end">
        <div className="w-full max-w-sm rounded-lg border border-slate-200 bg-white p-5">
          <dl className="space-y-1 text-sm">
            <div className="flex justify-between">
              <dt className="text-slate-600">Nettobetrag</dt>
              <dd className="tabular-nums text-slate-900">{formatCents(calculation.netCents)}</dd>
            </div>
            {calculation.taxGroups.map((group) => (
              <div key={group.rateBasisPoints} className="flex justify-between">
                <dt className="text-slate-600">
                  {formatBasisPoints(group.rateBasisPoints)} von {formatCents(group.netCents)}
                </dt>
                <dd className="tabular-nums text-slate-900">{formatCents(group.taxCents)}</dd>
              </div>
            ))}
            <div className="flex justify-between border-t border-slate-200 pt-2 text-base font-semibold">
              <dt className="text-slate-900">Rechnungsbetrag</dt>
              <dd className="tabular-nums text-slate-900">{formatCents(calculation.grossCents)}</dd>
            </div>
          </dl>
          {calculation.totalDiscountCents !== 0 && (
            <p className="mt-2 text-xs text-slate-500">
              enthaltene Rabatte: {formatCents(calculation.totalDiscountCents)}
            </p>
          )}
        </div>
      </div>

      <Card title="Hinweise">
        <div className="space-y-4">
          <Field label="Anmerkungen" htmlFor="notes" hint="Erscheint unter den Positionen">
            <Textarea id="notes" disabled={!editable} {...form.register('notes')} />
          </Field>
          <Field label="Fußzeile" htmlFor="footerNote" hint="Erscheint am Ende der Rechnung">
            <Textarea
              id="footerNote"
              rows={2}
              disabled={!editable}
              {...form.register('footerNote')}
            />
          </Field>
          <Field
            label="Interne Notiz"
            htmlFor="internalNotes"
            hint="Nur für dich — erscheint nicht auf der Rechnung"
          >
            <Textarea id="internalNotes" rows={2} {...form.register('internalNotes')} />
          </Field>
        </div>
      </Card>

      <div className="flex flex-wrap items-center gap-3">
        {editable && (
          <Button type="submit" disabled={save.isPending}>
            {save.isPending ? 'wird gespeichert …' : 'Speichern'}
          </Button>
        )}
        {saved && !form.formState.isDirty && (
          <span className="text-sm text-emerald-700">Gespeichert.</span>
        )}
        {form.formState.isDirty && (
          <span className="text-sm text-slate-500">Ungespeicherte Änderungen</span>
        )}
        {saveError !== null && Object.keys(fieldErrors ?? {}).length === 0 && (
          <span className="text-sm text-rose-600">{saveError.message}</span>
        )}
        {saveError !== null && Object.keys(fieldErrors ?? {}).length > 0 && (
          <span className="text-sm text-rose-600">Bitte die markierten Felder prüfen.</span>
        )}

        {editable && (
          <Button
            variant="danger"
            className="ml-auto"
            disabled={remove.isPending}
            onClick={() => {
              if (
                window.confirm('Diesen Entwurf löschen? Das lässt sich nicht rückgängig machen.')
              ) {
                remove.mutate();
              }
            }}
          >
            Entwurf löschen
          </Button>
        )}
      </div>
    </form>
  );
}
