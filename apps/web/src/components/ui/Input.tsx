import { forwardRef, type InputHTMLAttributes } from 'react';

interface InputProps extends InputHTMLAttributes<HTMLInputElement> {
  invalid?: boolean;
}

export const Input = forwardRef<HTMLInputElement, InputProps>(function Input(
  { invalid = false, className = '', ...props },
  ref,
) {
  return (
    <input
      ref={ref}
      aria-invalid={invalid || undefined}
      className={[
        'w-full rounded-md border px-3 py-2 text-sm text-slate-900 shadow-sm',
        'placeholder:text-slate-400',
        'focus:outline-none focus:ring-2 focus:ring-offset-0',
        invalid
          ? 'border-rose-400 focus:border-rose-500 focus:ring-rose-200'
          : 'border-slate-300 focus:border-slate-500 focus:ring-slate-200',
        className,
      ].join(' ')}
      {...props}
    />
  );
});
