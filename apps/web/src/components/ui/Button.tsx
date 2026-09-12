import type { ButtonHTMLAttributes, ReactNode } from 'react';

type Variant = 'primary' | 'secondary' | 'danger' | 'ghost' | 'ghost-danger';
type Size = 'md' | 'sm';

interface ButtonProps extends ButtonHTMLAttributes<HTMLButtonElement> {
  variant?: Variant;
  size?: Size;
  /**
   * Läuft gerade. Der Knopf ist dann gesperrt und zeigt `pendingLabel` —
   * behält aber seine Breite, siehe unten.
   */
  pending?: boolean;
  pendingLabel?: ReactNode;
}

/**
 * Drei Stufen und zwei Ausnahmen.
 *
 * `primary` ist die eine Handlung, die eine Ansicht anbietet — höchstens
 * eine davon pro Bildschirm, sonst ist keine mehr hervorgehoben. `secondary`
 * ist alles, was daneben möglich ist. `danger` ist der Weg, der etwas
 * zerstört. `ghost` trägt keinen Rahmen und steht dort, wo ein umrandeter
 * Knopf eine Tabellenzeile oder eine Kopfzeile zerschneiden würde — er ist
 * eine Darstellungsform derselben Leiter, kein vierter Rang.
 */
const VARIANTS: Record<Variant, string> = {
  primary: 'bg-inverse text-on-inverse hover:bg-inverse-hover focus:ring-focus',
  secondary:
    'border border-border-strong bg-surface text-ink-muted hover:bg-surface-sunken focus:ring-focus',
  danger:
    'border border-danger-border bg-surface text-danger-ink hover:bg-danger-surface focus:ring-danger-border',
  ghost: 'text-ink-muted hover:bg-surface-raised hover:text-ink focus:ring-focus',
  'ghost-danger': 'text-danger-ink hover:bg-danger-surface focus:ring-danger-border',
};

/*
 * Die Höhe ist die eigentliche Größe.
 *
 * `md` misst mit `py-2 text-sm` genau so viel wie ein `Input` — nur deshalb
 * stehen Feld und Knopf in einer Zeile auf derselben Linie, statt um zwei
 * Pixel versetzt. `sm` ist für Handlungen in Tabellenzeilen und in
 * Leisten, wo ein Knopf in Feldhöhe die Zeile auseinanderzieht.
 */
const SIZES: Record<Size, string> = {
  md: 'px-4 py-2 text-sm',
  sm: 'px-2.5 py-1 text-sm',
};

export function buttonClassName(variant: Variant = 'primary', className = '', size: Size = 'md') {
  return [
    'inline-flex items-center justify-center whitespace-nowrap rounded-md font-medium',
    'transition-colors focus:outline-none focus:ring-2',
    'disabled:cursor-not-allowed disabled:opacity-50',
    SIZES[size],
    VARIANTS[variant],
    className,
  ].join(' ');
}

export function Button({
  variant = 'primary',
  size = 'md',
  className = '',
  type = 'button',
  pending = false,
  pendingLabel,
  disabled = false,
  children,
  ...props
}: ButtonProps): JSX.Element {
  const showsPendingLabel = pendingLabel !== undefined;

  return (
    <button
      type={type}
      className={buttonClassName(variant, className, size)}
      disabled={disabled || pending}
      aria-busy={pending || undefined}
      {...props}
    >
      {showsPendingLabel ? (
        /*
         * Beide Beschriftungen liegen übereinander in derselben Rasterzelle.
         * Der Knopf ist damit so breit wie die längere von beiden und bleibt
         * es, während er lädt — sonst schöbe „wird gespeichert …" die
         * Nachbarknöpfe zur Seite und beim Fertigwerden wieder zurück, und
         * ein Klick daneben träfe den falschen.
         */
        <span className="grid">
          <span className={['col-start-1 row-start-1', pending ? 'invisible' : ''].join(' ')}>
            {children}
          </span>
          <span
            aria-hidden={!pending}
            className={['col-start-1 row-start-1', pending ? '' : 'invisible'].join(' ')}
          >
            {pendingLabel}
          </span>
        </span>
      ) : (
        children
      )}
    </button>
  );
}
