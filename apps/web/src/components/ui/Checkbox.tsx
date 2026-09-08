import { forwardRef, type InputHTMLAttributes } from 'react';

interface CheckboxProps extends InputHTMLAttributes<HTMLInputElement> {
  label: string;
  hint?: string;
}

export const Checkbox = forwardRef<HTMLInputElement, CheckboxProps>(function Checkbox(
  { label, hint, className = '', id, ...props },
  ref,
) {
  return (
    <div className={`flex gap-2.5 ${className}`}>
      <input
        ref={ref}
        id={id}
        type="checkbox"
        className="mt-0.5 h-4 w-4 shrink-0 rounded border-slate-300 text-slate-900 focus:ring-2 focus:ring-slate-200"
        {...props}
      />
      <div className="min-w-0">
        <label htmlFor={id} className="block text-sm text-slate-700">
          {label}
        </label>
        {hint !== undefined && <p className="mt-0.5 text-sm text-slate-500">{hint}</p>}
      </div>
    </div>
  );
});
