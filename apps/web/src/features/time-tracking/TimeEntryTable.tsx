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
    <div className="overflow-x-auto rounded-lg border border-slate-200 bg-white">
      <table className="w-full min-w-[44rem] text-sm">
        <caption className="sr-only">Erfasste Zeiten, gruppiert nach Tag</caption>
        <thead className="border-b border-slate-200 bg-slate-50 text-left text-xs uppercase tracking-wide text-slate-500">
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
          <tbody key={day.date} className="divide-y divide-slate-100 border-b border-slate-200">
            <tr className="bg-slate-50/70">
              <th
                scope="colgroup"
                colSpan={2}
                className="px-4 py-2 text-left text-sm font-semibold text-slate-900"
              >
                {formatDayDe(day.date as IsoDate)}
                {isWeekend(day.date as IsoDate) && (
                  <span className="ml-2 rounded bg-amber-100 px-1.5 py-0.5 text-xs font-normal text-amber-800">
                    Wochenende
                  </span>
                )}
              </th>
              <td className="px-4 py-2 text-right text-xs uppercase tracking-wide text-slate-500">
                Tag
              </td>
              <td className="px-4 py-2 text-right text-sm font-semibold tabular-nums text-slate-900">
                {formatDuration(day.durationMinutes)}
              </td>
              <td colSpan={(showBilledAt ? 1 : 0) + (editable ? 1 : 0) + 1} />
            </tr>

            {day.entries.map((entry) => (
              <tr
                key={entry.id}
                className={entry.id === editingId ? 'bg-slate-100' : 'hover:bg-slate-50'}
              >
                <td className="px-4 py-2.5 text-right tabular-nums text-slate-600">
                  {formatTimeOfDay(entry.startMinutes)}
                </td>
                <td className="px-4 py-2.5 text-right tabular-nums text-slate-600">
                  {formatTimeOfDay(entry.endMinutes)}
                </td>
                <td className="px-4 py-2.5 text-right tabular-nums text-slate-400">
                  {entry.breakMinutes === 0 ? '—' : formatDuration(entry.breakMinutes)}
                </td>
                <td className="px-4 py-2.5 text-right font-medium tabular-nums text-slate-900">
                  {formatDuration(entry.durationMinutes)}
                </td>
                <td className="px-4 py-2.5 text-slate-600">
                  {entry.description ?? <span className="text-slate-300">—</span>}
                </td>
                {showBilledAt && (
                  <td className="whitespace-nowrap px-4 py-2.5 text-slate-500">
                    {entry.billedAt === null
                      ? '—'
                      : formatDateDe(entry.billedAt.slice(0, 10) as IsoDate)}
                  </td>
                )}
                {editable && (
                  <td className="whitespace-nowrap px-4 py-2.5 text-right">
                    {onEdit !== undefined && (
                      <button
                        type="button"
                        className="rounded text-sm text-slate-600 hover:underline focus:outline-none focus:ring-2 focus:ring-slate-300"
                        onClick={() => onEdit(entry)}
                      >
                        Bearbeiten
                      </button>
                    )}
                    {onDelete !== undefined && (
                      <button
                        type="button"
                        className="ml-3 rounded text-sm text-rose-700 hover:underline focus:outline-none focus:ring-2 focus:ring-rose-300"
                        disabled={isDeleting}
                        onClick={() => onDelete(entry)}
                      >
                        Löschen
                      </button>
                    )}
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
