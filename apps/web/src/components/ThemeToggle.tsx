import { SegmentedControl } from './ui/SegmentedControl.js';
import { useTheme, type ThemePreference } from './ThemeProvider.js';

const OPTIONS: readonly { value: ThemePreference; label: string }[] = [
  { value: 'light', label: 'Hell' },
  { value: 'dark', label: 'Dunkel' },
  { value: 'system', label: 'Auto' },
];

/**
 * Die Wahl des Erscheinungsbilds in der Kopfzeile.
 *
 * Drei beschriftete Felder und kein durchschaltender Symbolknopf: Bei drei
 * Zuständen sähe man dem Symbol nie an, was der nächste Klick bewirkt — und
 * „Automatisch" hat ohnehin kein naheliegendes Sinnbild.
 */
export function ThemeToggle(): JSX.Element {
  const { preference, setPreference } = useTheme();

  return (
    <SegmentedControl
      options={OPTIONS}
      value={preference}
      onChange={setPreference}
      label="Erscheinungsbild"
      className="text-xs"
    />
  );
}
