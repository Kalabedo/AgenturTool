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
  children: ReactElement<FieldControlProps>;
  className?: string;
}

export function Field({
  label,
  htmlFor,
  error,
  hint,
  required = false,
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
    <div className={className}>
      <label htmlFor={htmlFor} className="block text-sm font-medium text-slate-700">
        {label}
        {required && (
          <span aria-hidden="true" className="ml-0.5 text-rose-600">
            *
          </span>
        )}
      </label>
      <div className="mt-1">{control}</div>
      {/* Der Hinweis verschwindet, sobald ein Fehler dasteht — zwei Zeilen
          Text unter einem Feld lesen sich sonst wie ein Widerspruch. */}
      {error !== undefined ? (
        <p id={messageId} className="mt-1 text-sm text-rose-600">
          {error}
        </p>
      ) : hint !== undefined ? (
        <p id={messageId} className="mt-1 text-sm text-slate-500">
          {hint}
        </p>
      ) : null}
    </div>
  );
}
