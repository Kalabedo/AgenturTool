import { useQuery } from '@tanstack/react-query';
import { formatCents, type SmallBusinessInvoiceWarning } from '@privatura/shared';
import { apiClient } from '../../lib/apiClient.js';
import { queryKeys } from '../../lib/queryKeys.js';

/**
 * Die Warnung im Ausstellen-Dialog: Diese Rechnung reißt die Grenze.
 *
 * Sie erscheint **vor** dem Ausstellen, weil es danach zu spät ist — die
 * Nummer ist gezogen, das Dokument eingefroren, und aus einer Rechnung ohne
 * ausgewiesene Steuer wird keine mit.
 *
 * Sie hält niemanden auf. Der Knopf bleibt, wo er ist, und tut, was er sagt:
 * Es kann gute Gründe geben, trotzdem auszustellen, und die Entscheidung
 * über den Profilwechsel gehört dem Steuerberater.
 */
export function SmallBusinessWarning({
  invoiceId,
  open,
}: {
  invoiceId: number;
  open: boolean;
}): JSX.Element | null {
  const warning = useQuery({
    queryKey: queryKeys.smallBusiness.warning(invoiceId),
    queryFn: () =>
      apiClient.get<SmallBusinessInvoiceWarning>(`/small-business/invoices/${invoiceId}/warning`),
    // Erst fragen, wenn der Dialog offen ist: Die Antwort gilt nur für
    // diesen Augenblick, und jede Rechnungsansicht hätte sie sonst geladen,
    // ohne sie je zu zeigen.
    enabled: open,
  });

  const data = warning.data;
  // Kein Kleinunternehmer, keine Überschreitung, kein Hinweis. Ein Fehler
  // bleibt stumm: Er darf das Ausstellen nicht verhindern.
  if (data === undefined || !data.applicable || !data.breaches) return null;

  return (
    <div className="rounded-lg border border-attention-border bg-attention-surface p-4">
      <p className="text-sm font-semibold text-attention-ink">
        Diese Rechnung überschreitet die Kleinunternehmergrenze
      </p>
      <p className="mt-1 text-sm text-attention-ink">
        Der Jahresumsatz stiege von {formatCents(data.revenueBeforeCents)} auf{' '}
        {formatCents(data.revenueAfterCents)} und läge damit{' '}
        {formatCents(data.exceedsByCents)} über der Grenze von{' '}
        {formatCents(data.limitCents)}.
      </p>
      <p className="mt-2 text-sm text-attention-ink">
        Die Regelung endet dann sofort im laufenden Jahr: Die nächste Rechnung trägt Umsatzsteuer.
        Ausstellen ist weiterhin möglich — der Wechsel des Steuerprofils gehört zum Steuerberater.
      </p>
    </div>
  );
}
