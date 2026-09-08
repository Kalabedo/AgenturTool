import type { ReactNode } from 'react';

interface EmptyStateProps {
  title: string;
  description?: string;
  action?: ReactNode;
}

export function EmptyState({ title, description, action }: EmptyStateProps): JSX.Element {
  return (
    <div className="rounded-lg border border-dashed border-slate-300 bg-white px-6 py-12 text-center">
      <p className="text-sm font-medium text-slate-900">{title}</p>
      {description !== undefined && <p className="mt-1 text-sm text-slate-500">{description}</p>}
      {action !== undefined && <div className="mt-4">{action}</div>}
    </div>
  );
}
