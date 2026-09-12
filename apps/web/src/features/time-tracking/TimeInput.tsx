import { forwardRef, useState, type ChangeEvent, type FocusEvent, type KeyboardEvent } from 'react';
import {
  TIME_GRID_MINUTES,
  formatTimeOfDay,
  parseTimeInput,
  snapToGrid,
} from '@agentur-tool/shared';
import { Input } from '../../components/ui/Input.js';

interface TimeInputProps {
  id: string;
  value: string;
  onChange: (value: string) => void;
  onBlur?: () => void;
  invalid?: boolean;
  placeholder?: string;
  autoFocus?: boolean;
}

/**
 * Ein Feld für eine Uhrzeit, gebaut fürs Tippen.
 *
 * Ersetzt die Auswahlliste mit 96 Einträgen: Wer eine Woche nachträgt,
 * scrollt nicht durch hundert Uhrzeiten, er tippt „930". Die Umwandlung
 * passiert beim Verlassen des Feldes, nicht bei jedem Tastendruck — sonst
 * würde „9" mitten im Tippen zu „09:00" und die zweite Ziffer landete an
 * der falschen Stelle.
 *
 * ## Warum kein `<input type="time">`
 *
 * Das native Feld sieht in jedem Browser anders aus, ignoriert `step` bei
 * getippten Werten und zerfällt auf macOS in drei Segmente, durch die man
 * sich einzeln pfeilen muss. Für ein Feld, das pro Eintrag zweimal
 * ausgefüllt wird, ist das der schlechtere Handel.
 *
 * ## Das Viertelstundenraster
 *
 * Abgerundet wird sichtbar und sofort: „09:07" steht nach dem Verlassen
 * des Feldes als „09:00" da, mit einem Hinweis daneben. Der Server rundet
 * ohnehin ab (`snapToGrid`) — die Oberfläche zeigt es nur vorher, damit
 * niemand eine Zeit abschickt und eine andere gespeichert bekommt.
 */
export const TimeInput = forwardRef<HTMLInputElement, TimeInputProps>(function TimeInput(
  { id, value, onChange, onBlur, invalid = false, placeholder = 'z. B. 9 oder 9:30', autoFocus },
  ref,
) {
  // Während getippt wird, gilt der rohe Text; erst beim Verlassen wird
  // daraus eine Uhrzeit. Ohne diesen Zwischenspeicher könnte man das Feld
  // nicht leeren, ohne dass die letzte gültige Zeit zurückspringt.
  const [draft, setDraft] = useState<string | null>(null);

  const handleChange = (event: ChangeEvent<HTMLInputElement>): void => {
    setDraft(event.target.value);
    onChange(event.target.value);
  };

  /**
   * Macht aus dem getippten Text eine Uhrzeit.
   *
   * Unlesbares bleibt stehen, wie es getippt wurde: Es rot zu umranden und
   * den Text zu behalten ist ehrlicher, als still eine Zeit zu erfinden,
   * die nie jemand eingegeben hat.
   */
  const normalize = (raw: string): void => {
    setDraft(null);

    const minutes = parseTimeInput(raw);
    if (minutes !== null) onChange(formatTimeOfDay(snapToGrid(minutes)));
  };

  const handleBlur = (event: FocusEvent<HTMLInputElement>): void => {
    normalize(event.target.value);
    onBlur?.();
  };

  /**
   * Enter schickt das Formular ab, ohne vorher das Feld zu verlassen.
   *
   * Ohne dieses Umschreiben stünde beim Absenden noch „1730" im Feld,
   * während gespeichert würde, was daraus wird — sichtbar wäre also etwas
   * anderes als gespeichert. Genau die Überraschung, die die Umwandlung
   * beim Verlassen vermeiden soll.
   */
  const handleKeyDown = (event: KeyboardEvent<HTMLInputElement>): void => {
    if (event.key === 'Enter') normalize(event.currentTarget.value);
  };

  return (
    <Input
      ref={ref}
      id={id}
      type="text"
      inputMode="numeric"
      autoComplete="off"
      autoFocus={autoFocus}
      placeholder={placeholder}
      invalid={invalid}
      className="tabular-nums"
      value={draft ?? value}
      onChange={handleChange}
      onBlur={handleBlur}
      onKeyDown={handleKeyDown}
    />
  );
});

/**
 * Der Hinweis unter einem Zeitfeld, solange die Eingabe nicht aufs Raster passt.
 *
 * Zeigt, was gespeichert würde — die Warnung kommt vor dem Speichern und
 * nicht als Überraschung in der Monatssumme.
 */
export function gridHintFor(value: string): string | undefined {
  const minutes = parseTimeInput(value);
  if (minutes === null || minutes % TIME_GRID_MINUTES === 0) return undefined;
  // Kurz genug für eine Zeile: Der Hinweis erscheint und verschwindet beim
  // Tippen, und in der schmalen Spalte brach der lange Satz auf zwei Zeilen
  // um — das Formular wuchs dann bei jedem Zeichen. Dass in Viertelstunden
  // erfasst wird, steht ohnehin über dem Formular.
  return `Wird zu ${formatTimeOfDay(snapToGrid(minutes))} gerundet.`;
}
