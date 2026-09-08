import type { ReactNode } from 'react';

interface CardProps {
  title?: string;
  description?: string;
  children: ReactNode;
  className?: string;
}

export function Card({ title, description, children, className = '' }: CardProps): JSX.Element {
  return (
    <section className={`rounded-lg border border-slate-200 bg-white p-5 ${className}`}>
      {title !== undefined && (
        <header className="mb-4">
          <h2 className="text-base font-semibold text-slate-900">{title}</h2>
          {description !== undefined && (
            <p className="mt-0.5 text-sm text-slate-500">{description}</p>
          )}
        </header>
      )}
      {children}
    </section>
  );
}
