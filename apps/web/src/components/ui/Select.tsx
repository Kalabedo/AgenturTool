import { forwardRef, type SelectHTMLAttributes } from 'react';

interface SelectProps extends SelectHTMLAttributes<HTMLSelectElement> {
  invalid?: boolean;
}

export const Select = forwardRef<HTMLSelectElement, SelectProps>(function Select(
  { invalid = false, className = '', children, ...props },
  ref,
) {
  return (
    <select
      ref={ref}
      aria-invalid={invalid || undefined}
      className={[
        // `min-w-0` gegen Safari: Ein <select> hat dort eine Mindestbreite in
        // Höhe seiner längsten Option. Ohne das Zurücksetzen wächst das Feld
        // über seine Rasterspalte hinaus und schiebt die Nachbarn zusammen —
        // in Firefox fällt das nicht auf, weil es die Breite dort schrumpft.
        'w-full min-w-0 rounded-md border bg-surface px-3 py-2 text-sm text-ink shadow-sm',
        'focus:outline-none focus:ring-2',
        invalid
          ? 'border-danger-border focus:border-danger-strong focus:ring-danger-border'
          : 'border-border-strong focus:border-border-strong focus:ring-focus',
        className,
      ].join(' ')}
      {...props}
    >
      {children}
    </select>
  );
});
