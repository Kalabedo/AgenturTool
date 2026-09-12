import { useState, type ReactNode } from 'react';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { useNavigate } from 'react-router-dom';
import {
  REBILL_CUSTOMER_STATE,
  formatCents,
  formatDateDe,
  toIsoDate,
  type InvoiceResponse,
  type RebillPreviewResponse,
} from '@agentur-tool/shared';
import { apiClient } from '../../lib/apiClient.js';
import { queryKeys } from '../../lib/queryKeys.js';
import { formErrorOf } from '../../lib/errorMessage.js';
import { Button } from '../../components/ui/Button.js';
import { Checkbox } from '../../components/ui/Checkbox.js';
import { Dialog } from '../../components/ui/Dialog.js';
import { ErrorNotice } from '../../components/ui/ErrorNotice.js';
import { LoadingNote } from '../../components/ui/LoadingNote.js';
import { useToast } from '../../components/ui/Toast.js';

/**
 * „Neue Rechnung auf Basis dieser Rechnung."
 *
 * Der Dialog beantwortet vor dem Klick die Frage, die sonst erst der Blick
 * in den fertigen Entwurf beantwortet: Was kommt mit, was wird neu, und was
 * ändert sich an den Kundenangaben. Die Antwort rechnet der Server
 * (`GET /invoices/:id/rebill-preview`) mit derselben Auflösung, die
 * anschließend auch anlegt — hier wird sie nur dargestellt. Eine zweite
 * Berechnung im Browser könnte etwas versprechen, das dann nicht eintritt.
 */

/** Ein Abschnitt des Dialogs: Überschrift und Liste darunter. */
function Section({
  title,
  tone = 'neutral',
  children,
}: {
  title: string;
  tone?: 'neutral' | 'attention';
  children: ReactNode;
}): JSX.Element {
  return (
    <section
      className={[
        'rounded-md border p-4',
        tone === 'attention'
          ? 'border-attention-border bg-attention-surface'
          : 'border-border bg-surface',
      ].join(' ')}
    >
      <h3
        className={[
          'text-sm font-semibold',
          tone === 'attention' ? 'text-attention-ink' : 'text-ink',
        ].join(' ')}
      >
        {title}
      </h3>
      <div className="mt-2 text-sm">{children}</div>
    </section>
  );
}

/** Eine Zeile „Bezeichnung … Wert" mit ruhiger Ausrichtung. */
function Line({ label, children }: { label: string; children: ReactNode }): JSX.Element {
  return (
    <div className="flex flex-wrap items-baseline justify-between gap-x-4 gap-y-0.5 py-0.5">
      <span className="text-ink-subtle">{label}</span>
      <span className="text-ink">{children}</span>
    </div>
  );
}

/**
 * Alt → Neu.
 *
 * Der alte Wert bleibt lesbar stehen statt durchgestrichen zu verschwinden:
 * Er ist die Angabe, gegen die der Benutzer prüft, ob der neue stimmt.
 */
function Change({ from, to }: { from: string; to: string }): JSX.Element {
  return (
    <span className="text-ink">
      <span className="text-ink-subtle">{from}</span>
      <span aria-label=" wird zu " className="px-1.5 text-ink-faint">
        →
      </span>
      {to}
    </span>
  );
}

function PreviewBody({
  preview,
  refresh,
  onRefreshChange,
}: {
  preview: RebillPreviewResponse;
  refresh: boolean;
  onRefreshChange: (value: boolean) => void;
}): JSX.Element {
  const hasCustomerChanges = preview.buyerChanges.length > 0 || preview.taxProfileChange !== null;
  const customerAvailable = preview.customerState === REBILL_CUSTOMER_STATE.AVAILABLE;

  return (
    <div className="space-y-4">
      <Section title="Wird übernommen">
        <Line label="Positionen">
          {preview.itemCount === 1 ? '1 Position' : `${preview.itemCount} Positionen`}
          <span className="ml-2 tabular-nums text-ink-subtle">
            {formatCents(preview.netCents)} netto
          </span>
        </Line>
        {preview.carriesNotes && <Line label="Rechnungstext">wird übernommen</Line>}
        {preview.carriesFooterNote && <Line label="Fußzeile">wird übernommen</Line>}
        {preview.itemCount === 0 && (
          <p className="mt-1 text-ink-subtle">
            Diese Rechnung hat keine Positionen — der Entwurf entsteht leer.
          </p>
        )}
      </Section>

      <Section title="Wird neu gesetzt">
        <Line label="Rechnungsdatum">{formatDateDe(toIsoDate(preview.invoiceDate))}</Line>
        <Line label="Leistungsdatum">{formatDateDe(toIsoDate(preview.serviceDate))}</Line>
        <Line label="Fällig">
          {formatDateDe(toIsoDate(preview.dueDate))}
          <span className="ml-2 text-ink-subtle">
            {preview.paymentTermDays} Tage
            {preview.paymentTermFromCustomer ? ' (Vorgabe des Kunden)' : ''}
          </span>
        </Line>
        <p className="mt-2 text-ink-subtle">
          Rechnungsnummer und Zahlungsvermerke entstehen nicht mit — der Entwurf bekommt seine
          Nummer erst beim Ausstellen.
        </p>
      </Section>

      {preview.customerState === REBILL_CUSTOMER_STATE.NONE && (
        <Section title="Kundenangaben">
          <p className="text-ink-subtle">
            Dieser Rechnung ist kein Kunde zugeordnet. Die Empfängerdaten werden unverändert
            übernommen.
          </p>
        </Section>
      )}

      {preview.customerState === REBILL_CUSTOMER_STATE.MISSING && (
        <Section title="Kundenangaben" tone="attention">
          <p className="text-attention-ink">
            Der zugeordnete Kunde existiert nicht mehr. Die Empfängerdaten der alten Rechnung werden
            unverändert übernommen.
          </p>
        </Section>
      )}

      {customerAvailable && (
        <Section
          title="Kundenangaben"
          tone={preview.taxProfileChange !== null && refresh ? 'attention' : 'neutral'}
        >
          {!hasCustomerChanges ? (
            <p className="text-ink-subtle">
              Die Angaben zu {preview.customerName} stimmen mit der alten Rechnung überein — es
              ändert sich nichts.
            </p>
          ) : (
            <>
              <Checkbox
                id="rebill-refresh"
                label="Aktuelle Kundenvorgaben übernehmen"
                hint={`Abgewählt entsteht der Entwurf mit den Angaben, die auf ${preview.sourceName} standen.`}
                checked={refresh}
                onChange={(event) => onRefreshChange(event.target.checked)}
              />

              <div
                className={[
                  'mt-3 border-t pt-3',
                  refresh ? 'border-border' : 'border-border opacity-50',
                ].join(' ')}
              >
                {preview.taxProfileChange !== null && (
                  <div className="mb-2 rounded border border-attention-border bg-attention-surface/60 px-3 py-2">
                    <p className="text-xs font-semibold uppercase tracking-wide text-attention-ink">
                      Steuerprofil
                    </p>
                    <p className="mt-0.5">
                      <Change
                        from={preview.taxProfileChange.from}
                        to={preview.taxProfileChange.to}
                      />
                    </p>
                    <p className="mt-1 text-attention-ink">
                      Das ändert den Steuerausweis und den Hinweistext auf dem Dokument.
                    </p>
                  </div>
                )}

                {preview.buyerChanges.map((change) => (
                  <Line key={change.label} label={change.label}>
                    <Change from={change.from} to={change.to} />
                  </Line>
                ))}
              </div>
            </>
          )}

          {preview.customerArchived && (
            <p className="mt-3 border-t border-border pt-3 text-attention-ink">
              Dieser Kunde ist archiviert.
            </p>
          )}
        </Section>
      )}
    </div>
  );
}

export function RebillDialog({
  invoiceId,
  invoiceName,
  open,
  onClose,
}: {
  invoiceId: number;
  invoiceName: string;
  open: boolean;
  onClose: () => void;
}): JSX.Element {
  const queryClient = useQueryClient();
  const navigate = useNavigate();
  const toast = useToast();
  const [refresh, setRefresh] = useState(true);

  const preview = useQuery({
    queryKey: queryKeys.invoices.rebillPreview(invoiceId),
    queryFn: () => apiClient.get<RebillPreviewResponse>(`/invoices/${invoiceId}/rebill-preview`),
    // Erst beim Öffnen fragen: Die Vorschau hängt am heutigen Datum und am
    // Stammdatenstand, und beides kann sich zwischen zwei Aufrufen ändern.
    enabled: open,
    staleTime: 0,
  });

  const create = useMutation({
    mutationFn: () =>
      apiClient.post<InvoiceResponse>(`/invoices/${invoiceId}/duplicate`, {
        refreshCustomerDefaults: refresh,
      }),
    onSuccess: async (created) => {
      await queryClient.invalidateQueries({ queryKey: queryKeys.invoices.all });
      onClose();
      navigate(`/invoices/${created.id}`);
      // Der neue Entwurf sieht aus wie die Rechnung, aus der er entstand.
      // Die Meldung hält fest, dass man jetzt im neuen steht.
      toast.success(`Neuer Entwurf auf Basis von ${invoiceName} angelegt.`);
    },
  });

  const createError = formErrorOf(create.error);

  return (
    <Dialog
      open={open}
      onClose={() => {
        if (!create.isPending) onClose();
      }}
      title="Neue Rechnung auf Basis dieser Rechnung"
      description={`Es entsteht ein neuer Entwurf. ${invoiceName} bleibt unverändert.`}
      footer={
        <>
          {createError !== null && (
            <span role="alert" className="mr-auto text-sm text-danger-strong">
              {createError}
            </span>
          )}
          <Button variant="secondary" onClick={onClose} disabled={create.isPending}>
            Abbrechen
          </Button>
          <Button
            onClick={() => create.mutate()}
            disabled={!preview.isSuccess}
            pending={create.isPending}
            pendingLabel="wird angelegt …"
          >
            Entwurf anlegen
          </Button>
        </>
      }
    >
      {preview.isLoading && <LoadingNote>Vorschau wird geladen …</LoadingNote>}

      {preview.isError && (
        <ErrorNotice
          error={preview.error}
          title="Die Vorschau konnte nicht geladen werden."
          onRetry={() => void preview.refetch()}
        />
      )}

      {preview.isSuccess && (
        <PreviewBody preview={preview.data} refresh={refresh} onRefreshChange={setRefresh} />
      )}
    </Dialog>
  );
}
