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
        'w-full rounded-md border px-3 py-2 text-sm text-ink shadow-sm',
        'placeholder:text-ink-faint',
        'focus:outline-none focus:ring-2',
        invalid
          ? 'border-danger-border focus:border-danger-strong focus:ring-danger-border'
          : 'border-border-strong focus:border-border-strong focus:ring-focus',
        className,
      ].join(' ')}
      {...props}
    />
  );
});
