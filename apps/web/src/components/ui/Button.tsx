import type { ButtonHTMLAttributes } from 'react';

type Variant = 'primary' | 'secondary' | 'danger';

interface ButtonProps extends ButtonHTMLAttributes<HTMLButtonElement> {
  variant?: Variant;
}

const VARIANTS: Record<Variant, string> = {
  primary: 'bg-slate-900 text-white hover:bg-slate-800 focus:ring-slate-300',
  secondary:
    'border border-slate-300 bg-white text-slate-700 hover:bg-slate-50 focus:ring-slate-200',
  danger: 'border border-rose-300 bg-white text-rose-700 hover:bg-rose-50 focus:ring-rose-200',
};

/** Dieselbe Optik für echte Links — ohne einen Button in einen Link zu verschachteln. */
export function buttonClassName(variant: Variant = 'primary', className = ''): string {
  return [
    'inline-flex items-center justify-center whitespace-nowrap rounded-md px-4 py-2 text-sm font-medium',
    'transition-colors focus:outline-none focus:ring-2',
    'disabled:cursor-not-allowed disabled:opacity-50',
    VARIANTS[variant],
    className,
  ].join(' ');
}

export function Button({
  variant = 'primary',
  className = '',
  type = 'button',
  ...props
}: ButtonProps): JSX.Element {
  return <button type={type} className={buttonClassName(variant, className)} {...props} />;
}
