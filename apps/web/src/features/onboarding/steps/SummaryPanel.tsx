import {
  COMPANY_FIELD_LABELS,
  type OnboardingStateResponse,
  type OnboardingStepId,
} from '@privatura/shared';
import { stepForProblemField } from '../onboardingFields.js';

interface SummaryPanelProps {
  state: OnboardingStateResponse;
  onGoToStep: (step: OnboardingStepId) => void;
}

/** Ein Punkt der Liste — mit Weg dorthin, wo er sich beheben lässt. */
function Gap({
  text,
  step,
  onGoToStep,
}: {
  text: string;
  step: OnboardingStepId | null;
  onGoToStep: (step: OnboardingStepId) => void;
}): JSX.Element {
  return (
    <li className="flex flex-wrap items-baseline gap-x-2 gap-y-0.5 py-1.5">
      <span className="text-sm text-ink">{text}</span>
      {step !== null && (
        <button
          type="button"
          onClick={() => onGoToStep(step)}
          className="rounded text-sm text-ink-subtle underline underline-offset-2 hover:text-ink focus:outline-none focus-visible:ring-2 focus-visible:ring-focus"
        >
          hinspringen
        </button>
      )}
    </li>
  );
}

function Section({
  title,
  description,
  emptyText,
  children,
  complete,
}: {
  title: string;
  description: string;
  emptyText: string;
  complete: boolean;
  children: React.ReactNode;
}): JSX.Element {
  return (
    <section>
      <h3 className="flex items-baseline gap-2 text-sm font-semibold text-ink">
        {title}
        <span
          aria-hidden="true"
          className={complete ? 'text-sm text-success-ink' : 'text-sm text-attention-ink'}
        >
          {complete ? '✓' : '•'}
        </span>
      </h3>
      <p className="mt-0.5 text-sm text-ink-subtle">{description}</p>
      {complete ? (
        <p className="mt-2 text-sm text-success-ink">{emptyText}</p>
      ) : (
        <ul className="mt-2 divide-y divide-border">{children}</ul>
      )}
    </section>
  );
}

/**
 * Der Abschluss: was jetzt schon geht und was noch fehlt.
 *
 * Zwei Listen und nicht eine, weil es zwei verschiedene Sachverhalte sind.
 * Die erste verhindert etwas — ohne diese Angaben lässt sich keine Rechnung
 * ausstellen, § 14 UStG. Die zweite verhindert nichts: Eine Rechnung ohne
 * IBAN im XML ist eine gültige Rechnung, sie lässt sich nur nicht als
 * XRechnung ausgeben. Beides in einen Topf zu werfen erzeugte entweder
 * falsche Dringlichkeit oder falsche Sorglosigkeit.
 *
 * Was am Kunden hängt — Leitweg-ID und seine elektronische Adresse — kann
 * hier nicht stehen, weil es noch keinen Kunden gibt. Der Satz am Ende sagt
 * das, statt eine vollständige Liste vorzutäuschen.
 */
export function SummaryPanel({ state, onGoToStep }: SummaryPanelProps): JSX.Element {
  const invoiceReady = state.missingForInvoice.length === 0;
  const einvoiceReady = state.missingForEinvoice.length === 0;

  return (
    <div className="space-y-6">
      <Section
        title="Rechnung als PDF"
        description="Was § 14 UStG verlangt. Ohne diese Angaben lehnt das Ausstellen ab."
        emptyText="Vollständig — du kannst Rechnungen ausstellen."
        complete={invoiceReady}
      >
        {state.missingForInvoice.map((field) => (
          <Gap
            key={field}
            text={COMPANY_FIELD_LABELS[field] ?? field}
            step={stepForProblemField(field)}
            onGoToStep={onGoToStep}
          />
        ))}
      </Section>

      <Section
        title="XRechnung"
        description="Zusätzlich für den strukturierten Datensatz. Rechnungen als PDF gehen auch ohne."
        emptyText="Vollständig — deine Stammdaten genügen für die XRechnung."
        complete={einvoiceReady}
      >
        {state.missingForEinvoice.map((problem) => (
          <Gap
            key={problem.field}
            text={problem.message}
            step={stepForProblemField(problem.field)}
            onGoToStep={onGoToStep}
          />
        ))}
      </Section>

      <p className="text-sm text-ink-subtle">
        Was am einzelnen Kunden hängt — seine elektronische Adresse und, bei Behörden, die
        Leitweg-ID — steht hier noch nicht. Danach fragt die Anwendung beim Anlegen des Kunden und
        weist vor dem Export darauf hin.
      </p>
    </div>
  );
}
