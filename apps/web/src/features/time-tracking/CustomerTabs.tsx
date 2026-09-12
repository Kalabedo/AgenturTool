import { formatDuration, type TimeEntryOpenSummary } from '@agentur-tool/shared';

interface CustomerTabsProps {
  customers: readonly TimeEntryOpenSummary[];
  activeId: number | null;
  onSelect: (customerId: number) => void;
}

/**
 * Die Kunden mit offenen Zeiten.
 *
 * Eine Reiterleiste und kein Auswahlfeld: Sie beantwortet nebenbei die
 * Frage, die man sonst durch Durchklicken beantworten müsste — wo liegt
 * noch unabgerechnete Arbeit und wie viel. Ein Dropdown zeigt immer nur
 * den gewählten Eintrag; hier stehen alle Summen nebeneinander.
 *
 * Kunden ohne offene Zeiten stehen nicht darin. Der Reiter verschwindet
 * beim Abrechnen, und das ist die Absicht: Die Leiste ist die Liste dessen,
 * was noch zu tun ist, nicht die Liste aller Kunden.
 */
export function CustomerTabs({ customers, activeId, onSelect }: CustomerTabsProps): JSX.Element {
  return (
    <div
      role="tablist"
      aria-label="Kunden mit offenen Zeiten"
      className="-mx-1 flex gap-1 overflow-x-auto px-1 pb-1"
    >
      {customers.map((customer) => {
        const active = customer.customerId === activeId;
        return (
          <button
            key={customer.customerId}
            type="button"
            role="tab"
            aria-selected={active}
            onClick={() => onSelect(customer.customerId)}
            className={[
              'flex shrink-0 flex-col items-start gap-0.5 rounded-lg border px-3 py-2 text-left',
              'transition-colors focus:outline-none focus:ring-2 focus:ring-focus',
              active
                ? 'border-ink bg-inverse text-on-inverse'
                : 'border-border bg-surface text-ink-muted hover:border-border-strong hover:bg-surface-sunken',
            ].join(' ')}
          >
            <span className="text-sm font-medium">{customer.customerName}</span>
            <span
              className={[
                'text-xs tabular-nums',
                active ? 'text-ink-faint' : 'text-ink-subtle',
              ].join(' ')}
            >
              {formatDuration(customer.durationMinutes)} h · {customer.entryCount}{' '}
              {customer.entryCount === 1 ? 'Eintrag' : 'Einträge'}
            </span>
          </button>
        );
      })}
    </div>
  );
}
