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
        'w-full rounded-md border px-3 py-2 text-sm text-ink shadow-sm',
        'placeholder:text-ink-faint',
        'focus:outline-none focus:ring-2 focus:ring-offset-0',
        invalid
          ? 'border-danger-border focus:border-danger-strong focus:ring-danger-border'
          : 'border-border-strong focus:border-border-strong focus:ring-focus',
        className,
      ].join(' ')}
      {...props}
    />
  );
});
