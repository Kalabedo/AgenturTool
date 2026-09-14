import { Link } from 'react-router-dom';
import { ONBOARDING_STATUS } from '@agentur-tool/shared';
import { Button } from '../../components/ui/Button.js';
import { useOnboardingState, useOnboardingStatusMutation } from './useOnboarding.js';

/**
 * Die Einrichtung als Liste, für alle, die den Ablauf weggeklickt haben.
 *
 * Das Gegenstück zum Ablauf und die Bedingung dafür, dass „Überspringen"
 * ein ehrliches Angebot ist: Wer abbricht, verliert nichts und sieht
 * weiterhin, was aussteht — aber als ruhige Liste an einer Stelle, an der
 * er ohnehin vorbeikommt, nicht als wiederkehrende Aufforderung.
 *
 * „Nicht mehr anzeigen" ist kein Beschwichtigen: Es setzt die Einrichtung
 * auf abgeschlossen. Was dann noch fehlt, meldet weiterhin der Hinweis über
 * unvollständige Unternehmensdaten — aber erst dann, wenn es wirklich im
 * Weg steht, nämlich beim Ausstellen einer Rechnung.
 */
export function OnboardingChecklist(): JSX.Element | null {
  const onboarding = useOnboardingState();
  const setStatus = useOnboardingStatusMutation();

  const state = onboarding.data;
  if (state === undefined || state.status === ONBOARDING_STATUS.DONE) return null;

  const open = state.steps.filter((step) => !step.done);
  // Nichts mehr offen: Dann ist die Liste kein Hinweis mehr, sondern nur
  // noch eine Reihe Haken. Sie verschwindet von selbst.
  if (open.length === 0) return null;

  return (
    <section className="rounded-lg border border-border bg-surface p-5">
      <div className="flex flex-wrap items-baseline gap-x-3 gap-y-1">
        <h2 className="text-base font-semibold text-ink">Einrichtung</h2>
        <p className="text-sm text-ink-subtle">
          {state.steps.length - open.length} von {state.steps.length} Schritten erledigt
        </p>
      </div>

      <ul className="mt-3 divide-y divide-border">
        {state.steps.map((step) => (
          <li key={step.id} className="flex items-baseline gap-3 py-2">
            <span
              aria-hidden="true"
              className={[
                'w-4 shrink-0 text-center text-sm',
                step.done ? 'text-success-ink' : 'text-ink-faint',
              ].join(' ')}
            >
              {step.done ? '✓' : '○'}
            </span>
            <span className="min-w-0">
              <span
                className={['block text-sm', step.done ? 'text-ink-subtle' : 'text-ink'].join(' ')}
              >
                {step.title}
                <span className="sr-only">{step.done ? ' — erledigt' : ' — offen'}</span>
              </span>
              {!step.done && (
                <span className="mt-0.5 block text-sm leading-snug text-ink-subtle">
                  {step.description}
                </span>
              )}
            </span>
            {!step.done && !step.required && (
              <span className="ml-auto shrink-0 text-xs text-ink-subtle">freiwillig</span>
            )}
          </li>
        ))}
      </ul>

      <div className="mt-4 flex flex-wrap items-center gap-3">
        <Link
          to="/onboarding"
          className="rounded-md bg-inverse px-4 py-2 text-sm font-medium text-on-inverse transition-colors hover:bg-inverse-hover focus:outline-none focus:ring-2 focus:ring-focus"
        >
          Einrichtung fortsetzen
        </Link>
        <Button
          variant="ghost"
          onClick={() => setStatus.mutate(ONBOARDING_STATUS.DONE)}
          disabled={setStatus.isPending}
        >
          Nicht mehr anzeigen
        </Button>
      </div>
    </section>
  );
}
