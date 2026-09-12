interface SegmentedControlProps<T extends string> {
  options: readonly { value: T; label: string }[];
  value: T;
  onChange: (value: T) => void;
  /** Wofür gefiltert wird — für Screenreader, sichtbar steht es daneben. */
  label: string;
  className?: string;
}

/**
 * Eine Reihe sich ausschließender Filter.
 *
 * Rechnungsliste und Kundenliste hatten dieselbe Leiste zweimal gebaut, mit
 * leicht verschiedenen Abständen. Ein Bauteil, damit „Alle | Entwürfe | …"
 * überall gleich aussieht und gleich hoch ist wie das Suchfeld daneben.
 *
 * `p-0.5` außen und `py-1` innen ergeben zusammen die Höhe eines `Input`:
 * In einer Zeile mit dem Suchfeld stehen beide auf derselben Linie.
 */
export function SegmentedControl<T extends string>({
  options,
  value,
  onChange,
  label,
  className = '',
}: SegmentedControlProps<T>): JSX.Element {
  return (
    <div
      role="group"
      aria-label={label}
      className={`flex max-w-full overflow-x-auto rounded-md border border-slate-300 bg-white p-0.5 ${className}`}
    >
      {options.map((option) => {
        const active = option.value === value;
        return (
          <button
            key={option.value}
            type="button"
            aria-pressed={active}
            onClick={() => onChange(option.value)}
            className={[
              'whitespace-nowrap rounded px-3 py-1.5 text-sm transition-colors',
              'focus:outline-none focus-visible:ring-2 focus-visible:ring-slate-300',
              active ? 'bg-slate-900 text-white' : 'text-slate-600 hover:bg-slate-50',
            ].join(' ')}
          >
            {option.label}
          </button>
        );
      })}
    </div>
  );
}
