import { useState } from 'react';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { useNavigate } from 'react-router-dom';
import {
  BILLING_MODE_DESCRIPTIONS,
  BILLING_MODE_LABELS,
  BILLING_MODE_VALUES,
  formatCents,
  formatDecimalHours,
  type BillingMode,
  type InvoiceResponse,
  type TimeBillingPreview,
} from '@agentur-tool/shared';
import { ApiRequestError, apiClient } from '../../lib/apiClient.js';
import { queryKeys } from '../../lib/queryKeys.js';
import { Button } from '../../components/ui/Button.js';
import { Select } from '../../components/ui/Select.js';
import { formErrorOf } from '../../lib/errorMessage.js';

interface PreviewResponse extends TimeBillingPreview {
  mode: BillingMode;
  rateCents: number;
}

/**
 * „Rechnung erstellen" aus den offenen Zeiten eines Kunden.
 *
 * ## Erst zeigen, dann anlegen
 *
 * Der Knopf sagt vorher, was entsteht — „1 Position · 10,50 Std ·
 * 525,00 €". Wer auf einen Knopf drückt, der eine Rechnung erzeugt, soll
 * vorher wissen, was dabei herauskommt, und nicht erst danach im Entwurf
 * nachsehen.
 *
 * ## Die Abrechnungsart ist eingeklappt
 *
 * Die Vorgabe ist **eine Sammelzeile**, und sie stimmt fast immer. Die
 * Auswahl steht deshalb hinter „Anders aufteilen" und nicht als Pflichtfrage
 * vor jedem Klick. Was gewählt wird, merkt sich die Anwendung am Kunden —
 * dort ändert es sich selten bis nie.
 *
 * ## Ein Angebot, kein Zwang
 *
 * Daneben steht weiterhin „Abrechnen", das die Zeiten nur markiert und den
 * Nachweis erzeugt. Wer seine Rechnungen von Hand schreibt, benutzt diesen
 * Knopf einfach nicht.
 */
export function InvoiceFromTimeButton({
  customerId,
  disabled,
}: {
  customerId: number;
  disabled: boolean;
}): JSX.Element {
  const navigate = useNavigate();
  const queryClient = useQueryClient();
  const [mode, setMode] = useState<BillingMode | ''>('');
  const [showModes, setShowModes] = useState(false);

  const query = mode === '' ? '' : `?mode=${mode}`;

  const preview = useQuery({
    queryKey: [...queryKeys.timeEntries.openSummary, 'preview', customerId, mode],
    queryFn: () =>
      apiClient.get<PreviewResponse>(`/invoices/from-time-entries/${customerId}/preview${query}`),
  });

  const create = useMutation({
    mutationFn: () =>
      apiClient.post<InvoiceResponse>('/invoices/from-time-entries', {
        customerId,
        ...(mode === '' ? {} : { mode }),
      }),
    onSuccess: async (invoice) => {
      await queryClient.invalidateQueries({ queryKey: queryKeys.timeEntries.all });
      await queryClient.invalidateQueries({ queryKey: queryKeys.invoices.all });
      // Weiter in den Entwurf: Das ist der Beleg, an dem jetzt gearbeitet
      // wird — und er ist bearbeitbar wie jeder andere.
      navigate(`/invoices/${invoice.id}`);
    },
  });

  const message = formErrorOf(create.error) ?? previewMessage(preview.error);

  return (
    <div className="flex flex-col items-stretch gap-1 sm:items-end">
      <div className="flex flex-wrap items-center gap-2">
        <Button
          variant="secondary"
          disabled={disabled || create.isPending || preview.data === undefined}
          onClick={() => create.mutate()}
        >
          {create.isPending ? 'Wird erstellt …' : 'Rechnung erstellen'}
        </Button>
      </div>

      {preview.data !== undefined && (
        <span className="text-xs text-slate-500">
          {preview.data.itemCount === 1 ? '1 Position' : `${preview.data.itemCount} Positionen`} ·{' '}
          {formatDecimalHours(preview.data.durationMinutes)} Std ·{' '}
          {formatCents(preview.data.netCents)} netto
        </span>
      )}

      {showModes ? (
        <Select
          aria-label="Aufteilung der Positionen"
          className="text-xs"
          value={mode === '' ? (preview.data?.mode ?? '') : mode}
          onChange={(event) => setMode(event.target.value as BillingMode)}
        >
          {BILLING_MODE_VALUES.map((value) => (
            <option key={value} value={value} title={BILLING_MODE_DESCRIPTIONS[value]}>
              {BILLING_MODE_LABELS[value]}
            </option>
          ))}
        </Select>
      ) : (
        <button
          type="button"
          className="self-start text-xs text-slate-500 underline hover:text-slate-700 sm:self-end"
          onClick={() => setShowModes(true)}
        >
          Anders aufteilen
        </button>
      )}

      {message !== null && (
        <span role="alert" className="text-xs text-rose-600">
          {message}
        </span>
      )}
    </div>
  );
}

/**
 * Ein fehlgeschlagener Blick in die Zukunft ist kein Fehler, sondern eine
 * Auskunft: Meist fehlt der Stundensatz, und dann soll genau das dastehen.
 */
function previewMessage(error: unknown): string | null {
  return error instanceof ApiRequestError ? formErrorOf(error) : null;
}
