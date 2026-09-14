import type { OnboardingStepId, OnboardingStepState } from '@agentur-tool/shared';

interface OnboardingProgressProps {
  steps: readonly OnboardingStepState[];
  current: OnboardingStepId | null;
  onSelect: (step: OnboardingStepId) => void;
}

/**
 * Der Fortschritt als Leiste über dem Ablauf.
 *
 * Jeder Schritt ist anklickbar, auch der noch nicht erreichte. Ein Ablauf,
 * der einen festhält, bis man ihm der Reihe nach genügt hat, behandelt
 * erwachsene Menschen wie ein Formular des Einwohnermeldeamts — und wer
 * seine IBAN gerade nicht zur Hand hat, soll trotzdem weiterkommen.
 *
 * Die Haken sind kein Schmuck: Sie zeigen den abgeleiteten Zustand der
 * Daten. Wer einen Schritt überspringt, sieht ihn offen stehen, und wer
 * später in den Einstellungen etwas löscht, sieht ihn wieder aufgehen.
 */
export function OnboardingProgress({
  steps,
  current,
  onSelect,
}: OnboardingProgressProps): JSX.Element {
  return (
    <nav aria-label="Fortschritt der Einrichtung">
      <ol className="flex flex-wrap gap-x-2 gap-y-1">
        {steps.map((step, index) => {
          const active = step.id === current;

          return (
            <li key={step.id}>
              <button
                type="button"
                onClick={() => onSelect(step.id)}
                aria-current={active ? 'step' : undefined}
                className={[
                  'flex items-center gap-2 rounded-md px-2.5 py-1.5 text-sm transition-colors',
                  'focus:outline-none focus-visible:ring-2 focus-visible:ring-focus',
                  active
                    ? 'bg-surface-raised font-medium text-ink'
                    : 'text-ink-muted hover:bg-surface-hover hover:text-ink',
                ].join(' ')}
              >
                {/*
                 * Zahl und Haken teilen sich denselben Kreis: Die Leiste
                 * darf nicht um ein paar Pixel wandern, wenn ein Schritt
                 * fertig wird.
                 */}
                <span
                  aria-hidden="true"
                  className={[
                    'flex h-5 w-5 shrink-0 items-center justify-center rounded-full text-xs tabular-nums',
                    step.done
                      ? 'bg-success-surface text-success-ink'
                      : 'border border-border-strong text-ink-subtle',
                  ].join(' ')}
                >
                  {step.done ? '✓' : index + 1}
                </span>
                <span className="whitespace-nowrap">{step.title}</span>
                <span className="sr-only">{step.done ? ' — erledigt' : ' — offen'}</span>
              </button>
            </li>
          );
        })}
      </ol>
    </nav>
  );
}
