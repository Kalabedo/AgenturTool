/**
 * Die Klassen einer Registerkarte.
 *
 * Einstellungen und Zeiterfassung hatten dieselbe Leiste zweimal gebaut —
 * einmal mit `px-3`, einmal mit `px-4`, einmal mit dauerhaft fetter Schrift,
 * einmal nur im aktiven Zustand. Nebeneinander sieht man das nicht, beim
 * Wechsel zwischen beiden Seiten schon.
 */
export function tabClassName(active: boolean): string {
  return [
    '-mb-px whitespace-nowrap border-b-2 px-3 py-2 text-sm transition-colors',
    'focus:outline-none focus-visible:ring-2 focus-visible:ring-slate-300',
    active
      ? 'border-slate-900 font-medium text-slate-900'
      : 'border-transparent text-slate-500 hover:border-slate-300 hover:text-slate-800',
  ].join(' ');
}
