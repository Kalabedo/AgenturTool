import { useState } from 'react';
import { useQuery } from '@tanstack/react-query';
import { Link } from 'react-router-dom';
import {
  defaultPeriods,
  formatCents,
  formatDecimalHours,
  todayIso,
  type RevenueBucket,
  type StatisticsResponse,
} from '@privatura/shared';
import { apiClient } from '../../lib/apiClient.js';
import { queryKeys } from '../../lib/queryKeys.js';
import { useDocumentTitle } from '../../lib/useDocumentTitle.js';
import { Card } from '../../components/ui/Card.js';
import { EmptyState } from '../../components/ui/EmptyState.js';
import { ErrorNotice } from '../../components/ui/ErrorNotice.js';
import { Field } from '../../components/ui/Field.js';
import { Input } from '../../components/ui/Input.js';
import { LoadingNote } from '../../components/ui/LoadingNote.js';
import { PageHeader } from '../../components/ui/PageHeader.js';
import { tabClassName } from '../../components/ui/tabs.js';

/**
 * Die kleine Auswertung.
 *
 * Bewusst wenige Zahlen — TODO: „kein komplexes
 * Business-Intelligence-Dashboard". Was hier steht, beantwortet drei Fragen:
 * Was habe ich umgesetzt, was steht noch aus, und wie viel Arbeit liegt
 * unabgerechnet herum.
 *
 * Der Umsatz zählt nach dem Rechnungsdatum. Das steht auch auf der Seite:
 * Wer nach vereinnahmten Entgelten versteuert, soll die Grundlage kennen,
 * statt sie sich zu erschließen.
 */
export function StatisticsPage(): JSX.Element {
  useDocumentTitle('Auswertung');

  const periods = defaultPeriods(todayIso());
  const [period, setPeriod] = useState({
    from: periods[0]?.from ?? '',
    to: periods[0]?.to ?? '',
  });

  const query = `from=${period.from}&to=${period.to}`;
  const statistics = useQuery({
    queryKey: queryKeys.statistics.summary(query),
    queryFn: () => apiClient.get<StatisticsResponse>(`/statistics?${query}`),
    enabled: period.from !== '' && period.to !== '',
  });

  const data = statistics.data;

  return (
    <div className="space-y-6">
      <PageHeader title="Auswertung" description="Umsatz, offene Posten und Stunden" />

      <Card title="Zeitraum" description="Gezählt wird nach dem Rechnungsdatum.">
        <div className="flex flex-wrap gap-2">
          {periods.map((preset) => {
            const active = preset.from === period.from && preset.to === period.to;
            return (
              <button
                key={preset.label}
                type="button"
                className={tabClassName(active)}
                aria-pressed={active}
                onClick={() => setPeriod({ from: preset.from, to: preset.to })}
              >
                {preset.label}
              </button>
            );
          })}
        </div>

        <div className="mt-4 grid gap-4 sm:grid-cols-2">
          <Field label="Von" htmlFor="from">
            <Input
              id="from"
              type="date"
              value={period.from}
              onChange={(event) =>
                setPeriod((current) => ({ ...current, from: event.target.value }))
              }
            />
          </Field>
          <Field label="Bis" htmlFor="to">
            <Input
              id="to"
              type="date"
              value={period.to}
              onChange={(event) => setPeriod((current) => ({ ...current, to: event.target.value }))}
            />
          </Field>
        </div>
      </Card>

      {statistics.isError && (
        <ErrorNotice
          error={statistics.error}
          title="Die Auswertung konnte nicht geladen werden."
          onRetry={() => void statistics.refetch()}
        />
      )}

      {statistics.isPending && <LoadingNote />}

      {data !== undefined && (
        <>
          <div className="grid gap-4 sm:grid-cols-3">
            <Tile label="Umsatz netto" value={formatCents(data.totalNetCents)} />
            <Tile label="Umsatz brutto" value={formatCents(data.totalGrossCents)} />
            <Tile label="Belege" value={String(data.totalCount)} hint="Rechnungen und Stornos" />
          </div>

          <Card title="Offene Posten" description="Unabhängig vom gewählten Zeitraum.">
            <dl className="grid gap-4 sm:grid-cols-2">
              <Amount
                label="Offen"
                hint={`${String(data.openItems.openCount)} Rechnungen`}
                value={formatCents(data.openItems.openGrossCents)}
              />
              <Amount
                label="Davon überfällig"
                hint={`${String(data.openItems.overdueCount)} Rechnungen`}
                value={formatCents(data.openItems.overdueGrossCents)}
                tone={data.openItems.overdueCount > 0 ? 'attention' : 'neutral'}
              />
            </dl>
          </Card>

          <Card title="Stunden" description="Aus der Zeiterfassung, über den gesamten Bestand.">
            <dl className="grid gap-4 sm:grid-cols-2">
              <Amount
                label="Abgerechnet"
                value={`${formatDecimalHours(data.hours.billedMinutes)} h`}
              />
              <Amount label="Offen" value={`${formatDecimalHours(data.hours.openMinutes)} h`} />
            </dl>

            {data.hours.openEstimatedCents === null ? (
              <p className="mt-4 text-sm text-ink-subtle">
                Für eine Schätzung des offenen Betrags fehlt der Standard-Stundensatz.{' '}
                <Link to="/settings/company" className="underline">
                  In den Unternehmensdaten ergänzen
                </Link>
                .
              </p>
            ) : (
              <p className="mt-4 text-sm text-ink-subtle">
                Die offenen Stunden entsprächen etwa{' '}
                <span className="font-medium text-ink tabular-nums">
                  {formatCents(data.hours.openEstimatedCents)}
                </span>{' '}
                zum heutigen Satz von {formatCents(data.hours.hourlyRateCents ?? 0)} je Stunde. Der
                endgültige Betrag entsteht erst auf der Rechnung.
              </p>
            )}
          </Card>

          <Card title="Umsatz je Monat">
            <BucketTable buckets={data.byMonth} />
          </Card>

          <Card title="Umsatz je Quartal">
            <BucketTable buckets={data.byQuarter} />
          </Card>

          <Card title="Umsatz je Kunde">
            {data.byCustomer.length === 0 ? (
              <EmptyState title="Keine Belege im Zeitraum" />
            ) : (
              <table className="w-full text-sm">
                <thead>
                  <tr className="border-b border-border text-left text-ink-subtle">
                    <th scope="col" className="pb-2 font-medium">
                      Kunde
                    </th>
                    <th scope="col" className="pb-2 text-right font-medium">
                      Belege
                    </th>
                    <th scope="col" className="pb-2 text-right font-medium">
                      Netto
                    </th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-border">
                  {data.byCustomer.map((entry) => (
                    <tr key={`${String(entry.customerId ?? 0)}-${entry.customerName}`}>
                      <td className="py-2 text-ink">{entry.customerName}</td>
                      <td className="py-2 text-right tabular-nums text-ink-muted">{entry.count}</td>
                      <td className="py-2 text-right tabular-nums text-ink">
                        {formatCents(entry.netCents)}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            )}
          </Card>
        </>
      )}
    </div>
  );
}

function Tile({
  label,
  value,
  hint,
}: {
  label: string;
  value: string;
  hint?: string;
}): JSX.Element {
  return (
    <div className="rounded-lg border border-border bg-surface p-5">
      <p className="text-sm text-ink-muted">{label}</p>
      <p className="mt-1 text-2xl font-semibold tabular-nums text-ink">{value}</p>
      {hint !== undefined && <p className="mt-0.5 text-sm text-ink-subtle">{hint}</p>}
    </div>
  );
}

function Amount({
  label,
  value,
  hint,
  tone = 'neutral',
}: {
  label: string;
  value: string;
  hint?: string;
  tone?: 'neutral' | 'attention';
}): JSX.Element {
  return (
    <div>
      <dt className="text-sm text-ink-muted">{label}</dt>
      <dd
        className={[
          'mt-0.5 text-xl font-semibold tabular-nums',
          tone === 'attention' ? 'text-attention-ink' : 'text-ink',
        ].join(' ')}
      >
        {value}
      </dd>
      {hint !== undefined && <p className="text-sm text-ink-subtle">{hint}</p>}
    </div>
  );
}

function BucketTable({ buckets }: { buckets: RevenueBucket[] }): JSX.Element {
  if (buckets.length === 0) return <EmptyState title="Keine Belege im Zeitraum" />;

  return (
    <table className="w-full text-sm">
      <thead>
        <tr className="border-b border-border text-left text-ink-subtle">
          <th scope="col" className="pb-2 font-medium">
            Zeitraum
          </th>
          <th scope="col" className="pb-2 text-right font-medium">
            Belege
          </th>
          <th scope="col" className="pb-2 text-right font-medium">
            Netto
          </th>
          <th scope="col" className="pb-2 text-right font-medium">
            Brutto
          </th>
        </tr>
      </thead>
      <tbody className="divide-y divide-border">
        {buckets.map((entry) => (
          <tr key={entry.key}>
            <td className="py-2 text-ink">{entry.label}</td>
            <td className="py-2 text-right tabular-nums text-ink-muted">{entry.count}</td>
            <td className="py-2 text-right tabular-nums text-ink">{formatCents(entry.netCents)}</td>
            <td className="py-2 text-right tabular-nums text-ink-muted">
              {formatCents(entry.grossCents)}
            </td>
          </tr>
        ))}
      </tbody>
    </table>
  );
}
