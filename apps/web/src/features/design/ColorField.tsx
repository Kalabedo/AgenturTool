import { Field } from '../../components/ui/Field.js';
import { Input } from '../../components/ui/Input.js';

interface ColorFieldProps {
  label: string;
  hint?: string;
  value: string;
  onChange: (value: string) => void;
  /** Der Wert, den das gewählte Design mitbringt. */
  fallback: string;
  /** Das Design benutzt diese Farbe nicht — Regler aus. */
  disabled?: boolean;
  error?: string;
}

/**
 * Eine Farbe, zweimal bedienbar.
 *
 * Der Farbwähler des Betriebssystems zum Suchen, das Textfeld zum Einsetzen
 * eines Wertes aus dem Gestaltungshandbuch. Beide schreiben in dasselbe
 * Feld, weil beides vorkommt: Wer eine Hausfarbe hat, kennt ihren Hex-Wert
 * und will ihn nicht im Farbkreis nachklicken.
 *
 * Das Textfeld ist der wahre Wert. `hexColorSchema` verlangt die Langform
 * (#1e293b) — der Farbwähler liefert ohnehin nur diese.
 */
export function ColorField({
  label,
  hint,
  value,
  onChange,
  fallback,
  disabled = false,
  error,
}: ColorFieldProps): JSX.Element {
  const showsReset = !disabled && value.toLowerCase() !== fallback.toLowerCase();

  return (
    <Field
      label={label}
      hint={disabled ? 'Dieses Design benutzt die Farbe nicht.' : hint}
      error={error}
    >
      <div className="flex items-center gap-2">
        {/*
         * Das native Feld bringt seinen eigenen Rahmen mit, der sich kaum
         * bändigen lässt — deshalb sitzt es in einem eigenen Kästchen und
         * wird selbst randlos gemacht.
         */}
        <span className="relative h-9 w-10 shrink-0 overflow-hidden rounded-md border border-border-strong">
          <input
            type="color"
            aria-label={`${label} auswählen`}
            value={value}
            disabled={disabled}
            onChange={(event) => onChange(event.target.value)}
            className="absolute -inset-2 h-[calc(100%+1rem)] w-[calc(100%+1rem)] cursor-pointer border-0 bg-transparent p-0 disabled:cursor-not-allowed"
          />
        </span>

        <Input
          value={value}
          disabled={disabled}
          spellCheck={false}
          onChange={(event) => onChange(event.target.value)}
          className="font-mono"
        />

        {showsReset && (
          <button
            type="button"
            onClick={() => onChange(fallback)}
            className="shrink-0 rounded px-2 py-1 text-xs text-ink-subtle underline underline-offset-2 hover:text-ink focus:outline-none focus-visible:ring-2 focus-visible:ring-focus"
          >
            Zurücksetzen
          </button>
        )}
      </div>
    </Field>
  );
}
