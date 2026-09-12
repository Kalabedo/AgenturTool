import { useState } from 'react';
import { useMutation, useQueryClient } from '@tanstack/react-query';
import { Link, useNavigate } from 'react-router-dom';
import {
  DOCUMENT_TYPE,
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
 */
export function InvoiceLifecycleCard({ invoice }: { invoice: InvoiceResponse }): JSX.Element {
  const queryClient = useQueryClient();
  const navigate = useNavigate();
  const [paidAt, setPaidAt] = useState(invoice.paidAt ?? '');
  const [rebillOpen, setRebillOpen] = useState(false);
  const [mailOpen, setMailOpen] = useState(false);
  const [confirmCancel, setConfirmCancel] = useState(false);

  const applyUpdate = async (updated: InvoiceResponse): Promise<void> => {
    queryClient.setQueryData(queryKeys.invoices.byId(invoice.id), updated);
    await queryClient.invalidateQueries({ queryKey: queryKeys.invoices.all });
  };

  const payment = useMutation({
    mutationFn: (value: string | null) =>
      apiClient.post<InvoiceResponse>(`/invoices/${invoice.id}/payment`, { paidAt: value }),
    onSuccess: applyUpdate,
  });

  const sent = useMutation({
    mutationFn: (value: string | null) =>
      apiClient.post<InvoiceResponse>(`/invoices/${invoice.id}/sent`, { sentAt: value }),
    onSuccess: applyUpdate,
  });

  const cancel = useMutation({
    mutationFn: () => apiClient.post<InvoiceResponse>(`/invoices/${invoice.id}/cancel`, {}),
    onSuccess: async (cancellation) => {
      await queryClient.invalidateQueries({ queryKey: queryKeys.invoices.all });
      // Weiter zum Storno: Das ist der Beleg, der jetzt zählt.
      navigate(`/invoices/${cancellation.id}`);
    },
  });

  const error = [payment.error, sent.error, cancel.error].find(
    (candidate): candidate is ApiRequestError => candidate instanceof ApiRequestError,
  );

  const isCancellation = invoice.documentType === DOCUMENT_TYPE.CANCELLATION;

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
          <div className="flex flex-wrap items-end gap-3">
            <Field label="Bezahlt am" htmlFor="paidAt" hint="leer lassen heißt: noch offen">
              <Input
                id="paidAt"
                type="date"
                value={paidAt}
                onChange={(event) => setPaidAt(event.target.value)}
                disabled={invoice.status === 'CANCELLED'}
              />
            </Field>
            <Button
              variant="secondary"
              disabled={payment.isPending || paidAt === '' || invoice.status === 'CANCELLED'}
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
        )}

        <div className="flex flex-wrap items-center gap-3">
          {/* Der Versand steht vor dem Vermerk: Der übliche Weg ist, die
              Rechnung von hier aus zu verschicken — das Häkchen daneben ist
              für die Rechnung, die per Post ging. */}
          <Button onClick={() => setMailOpen(true)}>Per E-Mail senden</Button>

          {invoice.sentAt === null ? (
            <Button variant="secondary" disabled={sent.isPending} onClick={() => sent.mutate(null)}>
              Als versendet markieren
            </Button>
          ) : (
            <>
              <span className="text-sm text-slate-600">
                Versendet am {formatDateDe(toIsoDate(invoice.sentAt.slice(0, 10)))}
              </span>
              <Button
                variant="secondary"
                disabled={sent.isPending}
                onClick={() => sent.mutate(null)}
              >
                Versand zurücknehmen
              </Button>
            </>
          )}
        </div>

        <div className="flex flex-wrap items-center gap-3 border-t border-slate-200 pt-4">
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
