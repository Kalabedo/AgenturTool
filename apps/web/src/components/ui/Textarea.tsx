import { forwardRef, type TextareaHTMLAttributes } from 'react';

interface TextareaProps extends TextareaHTMLAttributes<HTMLTextAreaElement> {
  invalid?: boolean;
}

export const Textarea = forwardRef<HTMLTextAreaElement, TextareaProps>(function Textarea(
  { invalid = false, className = '', rows = 3, ...props },
  ref,
) {
  return (
    <textarea
      ref={ref}
      rows={rows}
      aria-invalid={invalid || undefined}
      className={[
        'w-full rounded-md border px-3 py-2 text-sm text-slate-900 shadow-sm',
        'placeholder:text-slate-400',
        'focus:outline-none focus:ring-2',
        invalid
          ? 'border-rose-400 focus:border-rose-500 focus:ring-rose-200'
          : 'border-slate-300 focus:border-slate-500 focus:ring-slate-200',
        className,
      ].join(' ')}
      {...props}
    />
  );
});
