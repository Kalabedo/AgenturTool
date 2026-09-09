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
import { Field } from '../../components/ui/Field.js';
import { Input } from '../../components/ui/Input.js';

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

  const duplicate = useMutation({
    mutationFn: () => apiClient.post<InvoiceResponse>(`/invoices/${invoice.id}/duplicate`, {}),
    onSuccess: async (created) => {
      await queryClient.invalidateQueries({ queryKey: queryKeys.invoices.all });
      navigate(`/invoices/${created.id}`);
    },
  });

  const cancel = useMutation({
    mutationFn: () => apiClient.post<InvoiceResponse>(`/invoices/${invoice.id}/cancel`, {}),
    onSuccess: async (cancellation) => {
      await queryClient.invalidateQueries({ queryKey: queryKeys.invoices.all });
      // Weiter zum Storno: Das ist der Beleg, der jetzt zählt.
      navigate(`/invoices/${cancellation.id}`);
    },
  });

  const error = [payment.error, sent.error, duplicate.error, cancel.error].find(
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
            <Button
              variant="secondary"
              disabled={duplicate.isPending}
              onClick={() => duplicate.mutate()}
            >
              Duplizieren
            </Button>
          )}
          {isCancellable(invoice) && (
            <Button
              variant="danger"
              disabled={cancel.isPending}
              onClick={() => {
                if (
                  window.confirm(
                    `${invoiceDisplayName(invoice)} stornieren? Es entsteht ein eigenes ` +
                      'Storno-Dokument mit nächster Rechnungsnummer; die Rechnung selbst ' +
                      'bleibt unverändert.',
                  )
                ) {
                  cancel.mutate();
                }
              }}
            >
              {cancel.isPending ? 'Storno wird erstellt …' : 'Stornieren'}
            </Button>
          )}
        </div>

        {error !== undefined && (
          <p role="alert" className="text-sm text-rose-600">
            {error.message}
          </p>
        )}
      </div>
    </Card>
  );
}
