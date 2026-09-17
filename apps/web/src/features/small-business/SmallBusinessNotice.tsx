import { useQuery } from '@tanstack/react-query';
import { Link } from 'react-router-dom';
import { SMALL_BUSINESS_STATE, formatCents, type SmallBusinessStatus } from '@privatura/shared';
import { apiClient } from '../../lib/apiClient.js';
import { queryKeys } from '../../lib/queryKeys.js';

/**
 * Der Hinweis auf die Kleinunternehmergrenze (§ 19 UStG).
 *
 * Ein ruhiger Satz auf dem Dashboard, kein roter Zähler. Er erscheint, wenn
 * der Umsatz einen gut sichtbaren Anteil der Grenze erreicht hat, und
 * verschwindet von selbst wieder — bei einem Storno etwa.
 *
 * Was er **nicht** tut: das Steuerprofil wechseln. Ob und wann gewechselt
 * wird, entscheidet der Steuerberater; die Anwendung rechnet nach und sagt
 * Bescheid. Deshalb steht hier auch kein Knopf, der etwas umstellt.
 */
export function SmallBusinessNotice(): JSX.Element | null {
  const status = useQuery({
    queryKey: queryKeys.smallBusiness.status,
    queryFn: () => apiClient.get<SmallBusinessStatus>('/small-business/status'),
  });

  const data = status.data;
  // Kein Profil, kein Hinweis: Die Regelung geht denjenigen nichts an, der
  // sie nicht nutzt. Ein Fehler bleibt hier ebenfalls stumm — das Dashboard
  // meldet ihn bereits gesammelt, und zwei Meldungen wären nur lauter.
  if (data === undefined || !data.applicable) return null;

  const exceeded = data.current.state === SMALL_BUSINESS_STATE.UEBERSCHRITTEN;
  const previousExceeded = data.previous.state === SMALL_BUSINESS_STATE.UEBERSCHRITTEN;

  if (data.current.state === SMALL_BUSINESS_STATE.RUHIG && !previousExceeded) return null;

  return (
    <section className="rounded-lg border border-attention-border bg-attention-surface p-5">
      <h2 className="text-sm font-semibold text-attention-ink">
        {exceeded
          ? 'Die Kleinunternehmergrenze ist überschritten'
          : 'Die Kleinunternehmergrenze rückt näher'}
      </h2>

      <p className="mt-1 text-sm text-attention-ink">
        {data.current.year}: {formatCents(data.current.revenueCents)} von{' '}
        {formatCents(data.current.limitCents)}
        {exceeded ? '. ' : ` — noch ${formatCents(data.current.remainingCents)}. `}
        {exceeded
          ? 'Damit endet die Regelung im laufenden Jahr, nicht erst im Januar: Die nächste Rechnung trägt Umsatzsteuer.'
          : 'Wird die Grenze überschritten, endet die Regelung sofort im laufenden Jahr.'}
      </p>

      {previousExceeded && (
        <p className="mt-2 text-sm text-attention-ink">
          Auch der Vorjahresumsatz {data.previous.year} liegt mit{' '}
          {formatCents(data.previous.revenueCents)} über {formatCents(data.previous.limitCents)}.
        </p>
      )}

      <p className="mt-2 text-sm text-attention-ink">
        Ob und wann das Steuerprofil gewechselt wird, entscheidet der Steuerberater. Gezählt wird
        nach dem Rechnungsdatum.
      </p>

      <Link
        to="/statistics"
        className="mt-3 inline-block text-sm font-medium text-attention-ink underline"
      >
        Umsatz ansehen
      </Link>
    </section>
  );
}
