import {
  formatDateDe,
  formatDayDe,
  formatDuration,
  formatTimeOfDay,
  groupTimeEntriesByDay,
  isWeekend,
  type IsoDate,
  type TimeEntryResponse,
} from '@agentur-tool/shared';
import { Badge } from '../../components/ui/Badge.js';
import { Button } from '../../components/ui/Button.js';

interface TimeEntryTableProps {
  entries: readonly TimeEntryResponse[];
  editingId: number | null;
  /** Fehlt, wenn die Liste nur zum Ansehen da ist — im Archiv. */
  onEdit?: (entry: TimeEntryResponse) => void;
  onDelete?: (entry: TimeEntryResponse) => void;
  isDeleting?: boolean;
  /** Zeigt je Zeile, wann abgerechnet wurde — nur im Archiv sinnvoll. */
  showBilledAt?: boolean;
}

/**
 * Die erfassten Zeiten, nach Tag gruppiert.
 *
 * Eine Tabelle mit Tagesköpfen statt einer flachen Liste: Ohne sie steht
 * das Datum in jeder Zeile wieder da, und ein Tag mit drei Einträgen ist
 * nicht von drei einzelnen Tagen zu unterscheiden. Der Kopf trägt die
 * Tagessumme, weil das die Zahl ist, gegen die man einen Tag prüft.
 *
 * Neueste zuerst: Beim Nachtragen soll der eben gespeicherte Eintrag oben
 * stehen und nicht ans Ende einer langen Liste rutschen. Innerhalb eines
 * Tages bleibt es chronologisch — ein Tag liest sich vorwärts.
 */
export function TimeEntryTable({
  entries,
  editingId,
  onEdit,
  onDelete,
  isDeleting = false,
  showBilledAt = false,
}: TimeEntryTableProps): JSX.Element {
  const days = groupTimeEntriesByDay(entries);
  const editable = onEdit !== undefined || onDelete !== undefined;

  return (
    <div className="overflow-x-auto rounded-lg border border-border bg-surface">
      <table className="w-full min-w-[44rem] text-sm">
        <caption className="sr-only">Erfasste Zeiten, gruppiert nach Tag</caption>
        <thead className="border-b border-border bg-surface-sunken text-left text-xs uppercase tracking-wide text-ink-subtle">
          <tr>
            <th className="px-4 py-2 text-right font-medium">Beginn</th>
            <th className="px-4 py-2 text-right font-medium">Ende</th>
            <th className="px-4 py-2 text-right font-medium">Pause</th>
            <th className="px-4 py-2 text-right font-medium">Dauer</th>
            <th className="px-4 py-2 font-medium">Tätigkeit</th>
            {showBilledAt && <th className="px-4 py-2 font-medium">Abgerechnet</th>}
            {editable && (
              <th className="px-4 py-2">
                <span className="sr-only">Aktionen</span>
              </th>
            )}
          </tr>
        </thead>

        {days.map((day) => (
          <tbody key={day.date} className="divide-y divide-border border-b border-border">
            <tr className="bg-surface-sunken/70">
              <th
                scope="colgroup"
                colSpan={2}
                className="px-4 py-2 text-left text-sm font-semibold text-ink"
              >
                {formatDayDe(day.date as IsoDate)}
                {isWeekend(day.date as IsoDate) && (
                  <Badge tone="warning" className="ml-2 font-normal">
                    Wochenende
                  </Badge>
                )}
              </th>
              <td className="px-4 py-2 text-right text-xs uppercase tracking-wide text-ink-subtle">
                Tag
              </td>
              <td className="px-4 py-2 text-right text-sm font-semibold tabular-nums text-ink">
                {formatDuration(day.durationMinutes)}
              </td>
              <td colSpan={(showBilledAt ? 1 : 0) + (editable ? 1 : 0) + 1} />
            </tr>

            {day.entries.map((entry) => (
              <tr
                key={entry.id}
                className={entry.id === editingId ? 'bg-surface-raised' : 'hover:bg-surface-hover'}
              >
                <td className="px-4 py-2.5 text-right tabular-nums text-ink-muted">
                  {formatTimeOfDay(entry.startMinutes)}
                </td>
                <td className="px-4 py-2.5 text-right tabular-nums text-ink-muted">
                  {formatTimeOfDay(entry.endMinutes)}
                </td>
                <td className="px-4 py-2.5 text-right tabular-nums text-ink-faint">
                  {entry.breakMinutes === 0 ? '—' : formatDuration(entry.breakMinutes)}
                </td>
                <td className="px-4 py-2.5 text-right font-medium tabular-nums text-ink">
                  {formatDuration(entry.durationMinutes)}
                </td>
                <td className="px-4 py-2.5 text-ink-muted">
                  {entry.description ?? <span className="text-ink-faint">—</span>}
                </td>
                {showBilledAt && (
                  <td className="whitespace-nowrap px-4 py-2.5 text-ink-subtle">
                    {entry.billedAt === null
                      ? '—'
                      : formatDateDe(entry.billedAt.slice(0, 10) as IsoDate)}
                  </td>
                )}
                {editable && (
                  <td className="whitespace-nowrap px-2 py-1.5 text-right">
                    {/* Dieselben stillen Knöpfe wie in der Rechnungsliste:
                        gleiche Größe, gleicher Abstand, gleiche Reihenfolge —
                        das Zerstörende zuletzt. */}
                    <div className="flex justify-end gap-1">
                      {onEdit !== undefined && (
                        <Button variant="ghost" size="sm" onClick={() => onEdit(entry)}>
                          Bearbeiten
                        </Button>
                      )}
                      {onDelete !== undefined && (
                        <Button
                          variant="ghost-danger"
                          size="sm"
                          disabled={isDeleting}
                          onClick={() => onDelete(entry)}
                        >
                          Löschen
                        </Button>
                      )}
                    </div>
                  </td>
                )}
              </tr>
            ))}
          </tbody>
        ))}
      </table>
    </div>
  );
}
