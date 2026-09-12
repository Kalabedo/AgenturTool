import { useState, type ReactNode } from 'react';
import { useMutation, useQueryClient } from '@tanstack/react-query';
import { Link, useNavigate } from 'react-router-dom';
import {
  DOCUMENT_TYPE,
  INVOICE_STATUS,
  formatDateDe,
  invoiceDisplayName,
  isCancellable,
  toIsoDate,
  type InvoiceResponse,
} from '@agentur-tool/shared';
import { ApiRequestError, apiClient } from '../../lib/apiClient.js';
import { queryKeys } from '../../lib/queryKeys.js';
import { Button } from '../../components/ui/Button.js';
import { Card } from '../../components/ui/Card.js';
import { ConfirmDialog } from '../../components/ui/ConfirmDialog.js';
import { Field } from '../../components/ui/Field.js';
import { StatusText } from '../../components/ui/StatusText.js';
import { useToast } from '../../components/ui/Toast.js';
import { Input } from '../../components/ui/Input.js';
import { SendMailDialog } from '../mail/SendMailDialog.js';
import { RebillDialog } from './RebillDialog.js';

/**
 * Was mit einer ausgestellten Rechnung noch geschieht: bezahlt, versendet,
 * storniert, dupliziert.
 *
 * Als eigene Karte und nicht im Formular, weil es kein Bearbeiten ist: Die
 * Rechnung selbst ist unveränderlich, hier stehen nur die Vermerke daneben
 * und die beiden Wege, die ein neues Dokument erzeugen.
 *
 * Die Karte trägt drei Gruppen, und die Reihenfolge ist die des Vorgangs:
 * Zahlung, Versand, und darunter — abgesetzt — die beiden Wege, die ein
 * neues Dokument erzeugen. Ohne diese Gliederung stünden sechs Knöpfe
 * gleichrangig nebeneinander, und der gefährlichste („Stornieren") sähe aus
 * wie der nächste Arbeitsschritt.
 */

/** Eine beschriftete Gruppe innerhalb der Karte. */
function Section({ title, children }: { title: string; children: ReactNode }): JSX.Element {
  return (
    <section>
      <h3 className="text-xs font-semibold uppercase tracking-wide text-slate-500">{title}</h3>
      <div className="mt-2">{children}</div>
    </section>
  );
}

export function InvoiceLifecycleCard({ invoice }: { invoice: InvoiceResponse }): JSX.Element {
  const queryClient = useQueryClient();
  const navigate = useNavigate();
  const toast = useToast();
  const [paidAt, setPaidAt] = useState(invoice.paidAt ?? '');
  const [rebillOpen, setRebillOpen] = useState(false);
  const [mailOpen, setMailOpen] = useState(false);
  const [confirmCancel, setConfirmCancel] = useState(false);

  const applyUpdate = async (updated: InvoiceResponse): Promise<void> => {
    queryClient.setQueryData(queryKeys.invoices.byId(invoice.id), updated);
    await queryClient.invalidateQueries({ queryKey: queryKeys.invoices.all });
  };

  /*
   * Vermerken und Entfernen sehen auf dem Bildschirm fast gleich aus: Im
   * Feld steht danach dasselbe Datum, das man eben eingetippt hat. Erst die
   * Meldung sagt, dass der Vermerk beim Server angekommen ist.
   */
  const payment = useMutation({
    mutationFn: (value: string | null) =>
      apiClient.post<InvoiceResponse>(`/invoices/${invoice.id}/payment`, { paidAt: value }),
    onSuccess: async (updated) => {
      await applyUpdate(updated);
      toast.success(
        updated.paidAt === null ? 'Der Zahlungsvermerk wurde entfernt.' : 'Zahlung vermerkt.',
      );
    },
  });

  const sent = useMutation({
    mutationFn: (value: string | null) =>
      apiClient.post<InvoiceResponse>(`/invoices/${invoice.id}/sent`, { sentAt: value }),
    onSuccess: async (updated) => {
      await applyUpdate(updated);
      toast.success(
        updated.sentAt === null
          ? 'Der Versandvermerk wurde zurückgenommen.'
          : 'Als versendet vermerkt.',
      );
    },
  });

  const cancel = useMutation({
    mutationFn: () => apiClient.post<InvoiceResponse>(`/invoices/${invoice.id}/cancel`, {}),
    onSuccess: async (cancellation) => {
      await queryClient.invalidateQueries({ queryKey: queryKeys.invoices.all });
      // Weiter zum Storno: Das ist der Beleg, der jetzt zählt.
      navigate(`/invoices/${cancellation.id}`);
      // Nach dem Sprung sieht man ein fremdes Dokument. Die Meldung sagt,
      // woher es kommt.
      toast.success(
        `${invoiceDisplayName(invoice)} wurde storniert — hier steht jetzt das Storno-Dokument.`,
      );
    },
  });

  const error = [payment.error, sent.error, cancel.error].find(
    (candidate): candidate is ApiRequestError => candidate instanceof ApiRequestError,
  );

  const isCancellation = invoice.documentType === DOCUMENT_TYPE.CANCELLATION;
  const isCancelled = invoice.status === INVOICE_STATUS.CANCELLED;

  return (
    <Card title="Vorgang">
      <div className="space-y-5">
        {invoice.cancelsInvoiceId !== null && (
          <p className="text-sm text-slate-600">
            Dieses Dokument hebt{' '}
            <Link className="underline" to={`/invoices/${invoice.cancelsInvoiceId}`}>
              die zugehörige Rechnung
            </Link>{' '}
            auf.
          </p>
        )}
        {invoice.cancelledByInvoiceId !== null && (
          <p className="text-sm text-slate-600">
            Diese Rechnung wurde storniert —{' '}
            <Link className="underline" to={`/invoices/${invoice.cancelledByInvoiceId}`}>
              zum Storno-Dokument
            </Link>
            .
          </p>
        )}

        {!isCancellation && (
          <Section title="Zahlung">
            {/* Das Feld trägt seinen Hinweis nicht selbst: `Field` setzt ihn
                unter den Eingabekasten, und in einer Zeile mit Knöpfen
                schöbe er diese um seine Höhe nach unten. Hier steht er unter
                der ganzen Zeile und bleibt über `aria-describedby` trotzdem
                mit dem Feld verbunden. */}
            <div className="flex flex-wrap items-end gap-3">
              <Field label="Bezahlt am" htmlFor="paidAt" className="w-44 shrink-0">
                <Input
                  id="paidAt"
                  type="date"
                  aria-describedby="paidAt-hint"
                  value={paidAt}
                  onChange={(event) => setPaidAt(event.target.value)}
                  disabled={isCancelled}
                />
              </Field>
              <Button
                variant="secondary"
                disabled={payment.isPending || paidAt === '' || isCancelled}
                onClick={() => payment.mutate(paidAt)}
              >
                Zahlung vermerken
              </Button>
              {invoice.paidAt !== null && (
                <Button
                  variant="secondary"
                  disabled={payment.isPending}
                  onClick={() => {
                    setPaidAt('');
                    payment.mutate(null);
                  }}
                >
                  Zahlung entfernen
                </Button>
              )}
            </div>
            <p id="paidAt-hint" className="mt-2 text-sm text-slate-500">
              Leer lassen heißt: noch offen.
            </p>
          </Section>
        )}

        <Section title="Versand">
          <div className="flex flex-wrap items-center gap-3">
            <Button onClick={() => setMailOpen(true)}>Per E-Mail senden</Button>
            {invoice.sentAt !== null && (
              <span className="text-sm text-slate-600">
                Versendet am {formatDateDe(toIsoDate(invoice.sentAt.slice(0, 10)))}
              </span>
            )}
          </div>

          {/* Der Vermerk von Hand steht bewusst kleiner und darunter: Er ist
              der Weg für die Rechnung, die per Post ging oder aus einem
              anderen Programm heraus verschickt wurde — nicht der übliche. */}
          <p className="mt-3 text-sm text-slate-500">
            {invoice.sentAt === null ? 'Anders verschickt? ' : 'Versehentlich vermerkt? '}
            <button
              type="button"
              className="underline hover:text-slate-800 disabled:no-underline disabled:opacity-50"
              disabled={sent.isPending}
              onClick={() => sent.mutate(null)}
            >
              {invoice.sentAt === null ? 'Als versendet markieren' : 'Versand zurücknehmen'}
            </button>
          </p>
        </Section>

        <div className="flex flex-wrap items-center gap-3 border-t border-slate-200 pt-5">
          {!isCancellation && (
            <Button variant="secondary" onClick={() => setRebillOpen(true)}>
              Neue Rechnung auf Basis dieser Rechnung
            </Button>
          )}
          {isCancellable(invoice) && (
            <Button
              variant="danger"
              className="ml-auto"
              pending={cancel.isPending}
              pendingLabel="Storno wird erstellt …"
              onClick={() => setConfirmCancel(true)}
            >
              Stornieren
            </Button>
          )}
        </div>

        {error !== undefined && <StatusText tone="error">{error.message}</StatusText>}
      </div>

      {/* Erst beim Öffnen eingehängt, damit der Dialog jedes Mal mit der
          vorbelegten Auswahl beginnt statt mit der vom letzten Mal. */}
      {mailOpen && (
        <SendMailDialog
          source={{ kind: 'INVOICE', invoiceId: invoice.id }}
          title={`${invoiceDisplayName(invoice)} per E-Mail senden`}
          description="Betreff und Text kommen aus der Vorlage und lassen sich hier ändern."
          open
          onClose={() => setMailOpen(false)}
        />
      )}

      {rebillOpen && (
        <RebillDialog
          invoiceId={invoice.id}
          invoiceName={invoiceDisplayName(invoice)}
          open
          onClose={() => setRebillOpen(false)}
        />
      )}

      <ConfirmDialog
        open={confirmCancel}
        title="Rechnung stornieren"
        description={`Für ${invoiceDisplayName(invoice)} entsteht ein eigenes Storno-Dokument mit der nächsten Rechnungsnummer. Die Rechnung selbst bleibt unverändert.`}
        confirmLabel="Stornieren"
        pendingLabel="Storno wird erstellt …"
        tone="danger"
        isPending={cancel.isPending}
        onConfirm={() => {
          setConfirmCancel(false);
          cancel.mutate();
        }}
        onClose={() => setConfirmCancel(false)}
      />
    </Card>
  );
}
