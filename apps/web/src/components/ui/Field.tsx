import { cloneElement, isValidElement, useId, type ReactElement } from 'react';

interface FieldControlProps {
  'aria-describedby'?: string;
  'aria-required'?: boolean;
}

interface FieldProps {
  label: string;
  htmlFor?: string;
  error?: string;
  hint?: string;
  required?: boolean;
  /**
   * Hält die Zeile unter dem Feld frei, auch wenn dort gerade nichts steht.
   *
   * Für Felder, deren Hinweis beim Tippen kommt und geht — ohne das
   * verschiebt sich bei jedem Zeichen alles darunter um eine Zeile.
   */
  reserveMessageSpace?: boolean;
  children: ReactElement<FieldControlProps>;
  className?: string;
}

export function Field({
  label,
  htmlFor,
  error,
  hint,
  required = false,
  reserveMessageSpace = false,
  children,
  className = '',
}: FieldProps): JSX.Element {
  const generatedId = useId();
  const messageId = `${htmlFor ?? generatedId}-message`;
  const hasMessage = error !== undefined || hint !== undefined;
  const control = isValidElement(children)
    ? cloneElement(children, {
        'aria-describedby': hasMessage
          ? [children.props['aria-describedby'], messageId].filter(Boolean).join(' ')
          : children.props['aria-describedby'],
        'aria-required': required || children.props['aria-required'] || undefined,
      })
    : children;

  return (
    // `min-w-0`, weil dieses div das Rasterelement ist: Ohne das Zurücksetzen
    // der automatischen Mindestbreite bestimmt der breiteste Inhalt — in
    // Safari die längste Option eines <select> — die Spaltenbreite.
    <div className={`min-w-0 ${className}`}>
      <label htmlFor={htmlFor} className="block text-sm font-medium text-ink-muted">
        {label}
        {required && (
          <span aria-hidden="true" className="ml-0.5 text-danger-strong">
            *
          </span>
        )}
      </label>
      <div className="mt-1">{control}</div>
      {/* Der Hinweis verschwindet, sobald ein Fehler dasteht — zwei Zeilen
          Text unter einem Feld lesen sich sonst wie ein Widerspruch. */}
      {error !== undefined ? (
        <p id={messageId} className="mt-1 text-sm text-danger-strong">
          {error}
        </p>
      ) : hint !== undefined ? (
        <p id={messageId} className="mt-1 text-sm text-ink-subtle">
          {hint}
        </p>
      ) : reserveMessageSpace ? (
        <p aria-hidden="true" className="mt-1 h-5 text-sm" />
      ) : null}
    </div>
  );
}
