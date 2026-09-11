import { useEffect, useMemo, useState } from 'react';
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
import { useDocumentTitle } from '../../lib/useDocumentTitle.js';
import { formErrorOf, isNotFound } from '../../lib/errorMessage.js';
import { ErrorNotice } from '../../components/ui/ErrorNotice.js';
import { LoadingNote } from '../../components/ui/LoadingNote.js';
import { Button } from '../../components/ui/Button.js';
import { Card } from '../../components/ui/Card.js';
import { Field } from '../../components/ui/Field.js';
import { Input } from '../../components/ui/Input.js';
import { Select } from '../../components/ui/Select.js';
import { Textarea } from '../../components/ui/Textarea.js';
import { saveFile } from './saveFile.js';
import { InvoiceLifecycleCard } from './InvoiceLifecycleCard.js';
import { InvoiceItemsTable } from './InvoiceItemsTable.js';
import { InvoicePreview } from './InvoicePreview.js';
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
  const [showPreview, setShowPreview] = useState(true);

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

  const editable = invoice.data !== undefined && isEditable(invoice.data.status);

  /**
   * Was der E-Rechnung noch fehlt.
   *
   * Der Hook muss auch während des initialen Ladens aufgerufen werden, damit
   * React bei jedem Render dieselbe Anzahl Hooks sieht. Die Anfrage selbst
   * startet erst für eine geladene, ausgestellte Rechnung.
   */
  const einvoiceStatus = useQuery({
    queryKey: queryKeys.invoices.einvoiceStatus(invoiceId),
    queryFn: () =>
      apiClient.get<{ ready: boolean; problems: { field: string; message: string }[] }>(
        `/invoices/${invoiceId}/xml/status`,
      ),
    enabled: invoice.data !== undefined && !editable,
  });

  const downloadEinvoice = useMutation({
    mutationFn: () => apiClient.download(`/invoices/${invoiceId}/xml`, `Rechnung-${invoiceId}.xml`),
    onSuccess: saveFile,
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

  /**
   * Alle Formularwerte für die Vorschau.
   *
   * useWatch typisiert das Ergebnis als DeepPartial, weil ein Formular
   * grundsätzlich unvollständig sein darf. Unten wird es deshalb über die
   * geladenen Werte gelegt statt sie zu ersetzen — fehlt ein Feld, gilt der
   * gespeicherte Stand.
   */
  const watchedValues = useWatch({ control: form.control });

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

  /**
   * Das PDF zum aktuellen Stand.
   *
   * Bei einem Entwurf gehen die Werte aus dem Formular mit — auch die noch
   * nicht gespeicherten. Sonst müsste man vor jedem Blick auf den
   * Seitenumbruch erst speichern, und genau dafür ist der Blick da. Eine
   * ausgestellte Rechnung liefert der Server dagegen aus ihren eingefrorenen
   * Daten; ein Formularstand wäre dort bedeutungslos.
   */
  const downloadPdf = useMutation({
    mutationFn: (values: InvoiceFormValues) =>
      editable
        ? apiClient.downloadFromPost(
            '/invoices/preview/pdf',
            toInvoicePayload(values),
            'Rechnungsentwurf.pdf',
          )
        : apiClient.download(`/invoices/${invoiceId}/pdf`, `Rechnung-${invoiceId}.pdf`),
    onSuccess: saveFile,
  });

  /**
   * Ausstellen: Nummer, eingefrorene Daten, abgelegtes PDF.
   *
   * Ungespeicherte Änderungen werden vorher gespeichert. Das Backend
   * finalisiert, was in der Datenbank steht — ohne diesen Schritt bekäme man
   * eine Rechnung, die anders aussieht als das Formular davor.
   */
  const finalize = useMutation({
    mutationFn: async (values: InvoiceFormValues) => {
      if (form.formState.isDirty) {
        await apiClient.patch<InvoiceResponse>(`/invoices/${invoiceId}`, toInvoicePayload(values));
      }
      return apiClient.post<InvoiceResponse>(`/invoices/${invoiceId}/finalize`, {});
    },
    onSuccess: async (updated) => {
      queryClient.setQueryData(queryKeys.invoices.byId(invoiceId), updated);
      await queryClient.invalidateQueries({ queryKey: queryKeys.invoices.all });
      form.reset(toInvoiceFormValues(updated));
    },
  });

  const unfinalize = useMutation({
    mutationFn: () => apiClient.post<InvoiceResponse>(`/invoices/${invoiceId}/unfinalize`, {}),
    onSuccess: async (updated) => {
      queryClient.setQueryData(queryKeys.invoices.byId(invoiceId), updated);
      await queryClient.invalidateQueries({ queryKey: queryKeys.invoices.all });
      form.reset(toInvoiceFormValues(updated));
    },
  });

  const regeneratePdf = useMutation({
    mutationFn: () => apiClient.post<InvoiceResponse>(`/invoices/${invoiceId}/regenerate-pdf`, {}),
    onSuccess: (updated) => {
      queryClient.setQueryData(queryKeys.invoices.byId(invoiceId), updated);
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

  useDocumentTitle(invoice.data === undefined ? undefined : invoiceDisplayName(invoice.data));

  const isDirty = form.formState.isDirty;

  /**
   * Warnt, bevor ein Fenster mit ungespeicherten Änderungen zugeht.
   *
   * Der Browser bestimmt den Wortlaut selbst — eigener Text wird seit Jahren
   * ignoriert; was wir beitragen können, ist die Frage überhaupt zu stellen.
   * Innerhalb der Anwendung reicht der Hinweis „Ungespeicherte Änderungen"
   * neben den Knöpfen: Ein Wechsel auf eine andere Seite lässt sich mit dem
   * Zurück-Knopf beheben, ein geschlossenes Fenster nicht.
   */
  useEffect(() => {
    if (!isDirty) return;

    const warn = (event: BeforeUnloadEvent): void => event.preventDefault();
    window.addEventListener('beforeunload', warn);
    return () => window.removeEventListener('beforeunload', warn);
  }, [isDirty]);

  /**
   * Strg+S (bzw. Cmd+S) speichert.
   *
   * Wer eine Rechnung tippt, hat die Hände auf der Tastatur; der Griff zur
   * Maus für den Speichern-Knopf ist der einzige Bruch darin. Der Browser
   * würde sonst seinen Seite-speichern-Dialog öffnen — für diese Anwendung
   * sinnlos.
   */
  useEffect(() => {
    const onKeyDown = (event: KeyboardEvent): void => {
      if (event.key !== 's' || !(event.metaKey || event.ctrlKey)) return;
      event.preventDefault();

      if (invoice.data === undefined || !isEditable(invoice.data.status)) return;
      setSaved(false);
      void form.handleSubmit((values) => save.mutate(values))();
    };

    window.addEventListener('keydown', onKeyDown);
    return () => window.removeEventListener('keydown', onKeyDown);
  }, [form, invoice.data, save]);

  if (deleted || invoice.isLoading) {
    return <LoadingNote>Rechnung wird geladen …</LoadingNote>;
  }

  if (invoice.isError || invoice.data === undefined) {
    return isNotFound(invoice.error) ? (
      <div className="rounded-lg border border-slate-200 bg-white p-5">
        <p className="text-sm text-slate-700">Diese Rechnung wurde nicht gefunden.</p>
        <Link to="/invoices" className="mt-3 inline-block text-sm font-medium underline">
          Zurück zur Übersicht
        </Link>
      </div>
    ) : (
      <ErrorNotice
        error={invoice.error}
        title="Die Rechnung konnte nicht geladen werden."
        onRetry={() => void invoice.refetch()}
      />
    );
  }

  const data = invoice.data;

  const saveError = save.error instanceof ApiRequestError ? save.error : null;
  const saveMessage = formErrorOf(save.error);
  const finalizeMessage = formErrorOf(finalize.error);
  const downloadMessage = formErrorOf(downloadPdf.error);
  const finalizeError = finalize.error instanceof ApiRequestError ? finalize.error : null;
  const unfinalizeError = unfinalize.error instanceof ApiRequestError ? unfinalize.error : null;

  // Die Liste der fehlenden Pflichtangaben kommt als `details` aus der API —
  // dieselbe Liste, die `checkFinalizable` im geteilten Paket erzeugt.
  const finalizeProblems = finalizeError?.details ?? [];
  const fieldErrors = saveError?.fieldErrors();

  const errorFor = (field: string): string | undefined => fieldErrors?.[field];

  const previewValues: InvoiceFormValues = {
    ...toInvoiceFormValues(data),
    ...(watchedValues as Partial<InvoiceFormValues>),
    items: watchedItems ?? [],
  };

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
    <div
      className={
        showPreview
          ? 'grid items-start gap-6 2xl:grid-cols-[minmax(0,1fr)_36rem]'
          : // Ohne Vorschau bleibt das Formular auf Lesebreite, statt sich
            // über die volle Fensterbreite zu ziehen — mittig, weil die
            // Seite selbst schon auf 104rem aufgezogen ist und der Inhalt
            // sonst am linken Rand kleben würde.
            'mx-auto grid w-full max-w-5xl items-start gap-6'
      }
    >
      <form
        onSubmit={form.handleSubmit((values) => {
          setSaved(false);
          save.mutate(values);
        })}
        // Erst ab 2xl steht die Vorschau daneben. Darunter bekäme das
        // Formular sonst die volle Breite des breiten Layouts — ein
        // Eingabefeld über 1400 Pixel ist nicht großzügig, sondern unlesbar.
        className="mx-auto w-full min-w-0 max-w-5xl space-y-6 2xl:mx-0 2xl:max-w-none"
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
            <button
              type="button"
              className="ml-auto rounded border border-slate-300 px-3 py-1 text-sm text-slate-700 hover:bg-slate-50 focus:outline-none focus-visible:ring-2 focus-visible:ring-slate-300"
              onClick={() => setShowPreview((open) => !open)}
              aria-pressed={showPreview}
            >
              {showPreview ? 'Vorschau ausblenden' : 'Vorschau anzeigen'}
            </button>
          </div>
          <p className="mt-1 text-sm text-slate-500">
            Entwürfe bekommen erst beim Finalisieren eine Rechnungsnummer — so entstehen keine
            Lücken, wenn ein Entwurf verworfen wird.
          </p>
        </div>

        {!editable && (
          <div className="rounded-lg border border-amber-200 bg-amber-50 p-4">
            <p className="text-sm text-amber-900">
              Diese Rechnung ist ausgestellt und kann nicht mehr geändert werden. Für eine Korrektur
              wird sie storniert und neu ausgestellt.
            </p>
            <div className="mt-3 flex flex-wrap items-center gap-3">
              {data.canUnfinalize ? (
                <Button
                  variant="secondary"
                  disabled={unfinalize.isPending}
                  onClick={() => {
                    if (
                      window.confirm(
                        `Finalisierung von ${invoiceDisplayName(data)} zurücknehmen? ` +
                          'Die Nummer wird wieder freigegeben und das PDF gelöscht.',
                      )
                    ) {
                      unfinalize.mutate();
                    }
                  }}
                >
                  Finalisierung zurücknehmen
                </Button>
              ) : (
                <p className="text-sm text-amber-800">{data.unfinalizeBlocker}</p>
              )}
              {unfinalizeError !== null && (
                <span role="alert" className="text-sm text-rose-600">
                  {unfinalizeError.message}
                </span>
              )}
            </div>
          </div>
        )}

        {!editable && <InvoiceLifecycleCard invoice={data} />}

        {data.documentMissing && (
          <div className="rounded-lg border border-rose-200 bg-rose-50 p-4">
            <p className="text-sm text-rose-900">
              Zu dieser Rechnung fehlt die PDF-Datei. Sie lässt sich aus den gespeicherten Daten
              unverändert neu erzeugen.
            </p>
            <Button
              variant="secondary"
              className="mt-3"
              disabled={regeneratePdf.isPending}
              onClick={() => regeneratePdf.mutate()}
            >
              {regeneratePdf.isPending ? 'wird erzeugt …' : 'PDF neu erzeugen'}
            </Button>
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
              <Input
                id="customerNumber"
                disabled={!editable}
                {...form.register('customerNumber')}
              />
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
          <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
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
                <dd className="tabular-nums text-slate-900">
                  {formatCents(calculation.grossCents)}
                </dd>
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
          {editable && (
            <Button
              disabled={finalize.isPending}
              onClick={() => {
                if (
                  window.confirm(
                    'Rechnung ausstellen? Sie bekommt die nächste Rechnungsnummer und ist ' +
                      'danach nicht mehr änderbar.',
                  )
                ) {
                  finalize.mutate(form.getValues());
                }
              }}
            >
              {finalize.isPending ? 'wird ausgestellt …' : 'Rechnung ausstellen'}
            </Button>
          )}
          <Button
            variant="secondary"
            disabled={downloadPdf.isPending}
            onClick={() => downloadPdf.mutate(form.getValues())}
          >
            {downloadPdf.isPending ? 'PDF wird erzeugt …' : 'PDF herunterladen'}
          </Button>
          {!editable && (
            <Button
              variant="secondary"
              disabled={downloadEinvoice.isPending || einvoiceStatus.data?.ready === false}
              title={
                einvoiceStatus.data?.ready === false
                  ? 'Für die E-Rechnung fehlen noch Angaben.'
                  : undefined
              }
              onClick={() => downloadEinvoice.mutate()}
            >
              {downloadEinvoice.isPending ? 'XML wird erzeugt …' : 'XRechnung (XML)'}
            </Button>
          )}
          {downloadMessage !== null && (
            <span role="alert" className="text-sm text-rose-600">
              {downloadMessage}
            </span>
          )}
          {saved && !form.formState.isDirty && (
            <span role="status" className="text-sm text-emerald-700">
              Gespeichert.
            </span>
          )}
          {form.formState.isDirty && (
            <span className="text-sm text-slate-500">Ungespeicherte Änderungen</span>
          )}
          {saveMessage !== null && (
            <span role="alert" className="text-sm text-rose-600">
              {saveMessage}
            </span>
          )}

          {/*
            Ein Hinweis und keine Fehlermeldung: Die Rechnung ist gültig,
            sie lässt sich nur nicht als XRechnung ausgeben. Wer sie per
            PDF verschickt, hat hier nichts zu tun.
          */}
          {!editable && einvoiceStatus.data?.ready === false && (
            <div className="w-full rounded-lg border border-amber-200 bg-amber-50 p-4">
              <p className="text-sm font-medium text-amber-900">
                Diese Rechnung lässt sich noch nicht als XRechnung ausgeben:
              </p>
              <ul className="mt-2 list-disc space-y-1 pl-5 text-sm text-amber-800">
                {einvoiceStatus.data.problems.map((problem) => (
                  <li key={`${problem.field}-${problem.message}`}>{problem.message}</li>
                ))}
              </ul>
              <p className="mt-2 text-sm text-amber-800">
                Das PDF ist davon nicht betroffen. Die Angaben gelten ab der nächsten Rechnung —
                eine bereits ausgestellte trägt ihre eingefrorenen Daten.
              </p>
            </div>
          )}

          {finalizeProblems.length > 0 && (
            <div role="alert" className="w-full rounded-lg border border-rose-200 bg-rose-50 p-4">
              <p className="text-sm font-medium text-rose-900">
                Diese Angaben fehlen noch, damit die Rechnung ausgestellt werden kann:
              </p>
              <ul className="mt-2 list-disc space-y-1 pl-5 text-sm text-rose-800">
                {finalizeProblems.map((problem) => (
                  <li key={`${problem.field}-${problem.message}`}>{problem.message}</li>
                ))}
              </ul>
            </div>
          )}
          {finalizeMessage !== null && finalizeProblems.length === 0 && (
            <span role="alert" className="text-sm text-rose-600">
              {finalizeMessage}
            </span>
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

      {showPreview && (
        /*
         * Auf breiten Bildschirmen bleibt die Vorschau beim Scrollen stehen;
         * darunter rutscht sie unter das Formular. `max-h`/`overflow-y`
         * verhindern, dass eine mehrseitige Rechnung die Spalte länger macht
         * als das Fenster — dann käme man an das Ende des Formulars nicht
         * mehr heran.
         */
        <aside className="mx-auto w-full min-w-0 max-w-5xl 2xl:mx-0 2xl:sticky 2xl:top-6 2xl:max-h-[calc(100vh-3rem)] 2xl:overflow-y-auto">
          <h2 className="mb-2 text-base font-semibold text-slate-900">Vorschau</h2>
          <p className="mb-3 text-xs text-slate-500">
            Zeigt dasselbe Template, das später das PDF erzeugt. Der Seitenumbruch entsteht erst
            beim Export.
          </p>
          <InvoicePreview
            invoice={data}
            values={previewValues}
            taxProfiles={taxProfiles.data ?? []}
          />
        </aside>
      )}
    </div>
  );
}
