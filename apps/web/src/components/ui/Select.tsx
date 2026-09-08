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
        'w-full rounded-md border bg-white px-3 py-2 text-sm text-slate-900 shadow-sm',
        'focus:outline-none focus:ring-2',
        invalid
          ? 'border-rose-400 focus:border-rose-500 focus:ring-rose-200'
          : 'border-slate-300 focus:border-slate-500 focus:ring-slate-200',
        className,
      ].join(' ')}
      {...props}
    >
      {children}
    </select>
  );
});
