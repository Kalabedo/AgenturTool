import type { ReactNode } from 'react';

interface FieldProps {
  label: string;
  htmlFor?: string;
  error?: string;
  hint?: string;
  required?: boolean;
  children: ReactNode;
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
  return (
    <div className={className}>
      <label htmlFor={htmlFor} className="block text-sm font-medium text-slate-700">
        {label}
        {required && <span className="ml-0.5 text-rose-600">*</span>}
      </label>
      <div className="mt-1">{children}</div>
      {/* Der Hinweis verschwindet, sobald ein Fehler dasteht — zwei Zeilen
          Text unter einem Feld lesen sich sonst wie ein Widerspruch. */}
      {error !== undefined ? (
        <p className="mt-1 text-sm text-rose-600">{error}</p>
      ) : hint !== undefined ? (
        <p className="mt-1 text-sm text-slate-500">{hint}</p>
      ) : null}
    </div>
  );
}
