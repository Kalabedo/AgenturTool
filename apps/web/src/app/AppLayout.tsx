import { NavLink, Outlet } from 'react-router-dom';

const NAVIGATION = [
  { to: '/', label: 'Dashboard', end: true },
  { to: '/invoices', label: 'Rechnungen' },
  { to: '/customers', label: 'Kunden' },
  { to: '/settings/company', label: 'Einstellungen' },
];

export function AppLayout(): JSX.Element {
  return (
    <div className="min-h-screen bg-slate-50">
      <header className="border-b border-slate-200 bg-white">
        <div className="mx-auto flex max-w-5xl items-center gap-8 px-6 py-4">
          <span className="text-base font-semibold tracking-tight text-slate-900">AgenturTool</span>
          <nav className="flex items-center gap-1">
            {NAVIGATION.map((item) => (
              <NavLink
                key={item.to}
                to={item.to}
                end={item.end}
                className={({ isActive }) =>
                  [
                    'rounded-md px-3 py-1.5 text-sm transition-colors',
                    isActive
                      ? 'bg-slate-100 font-medium text-slate-900'
                      : 'text-slate-600 hover:bg-slate-50 hover:text-slate-900',
                  ].join(' ')
                }
              >
                {item.label}
              </NavLink>
            ))}
          </nav>
        </div>
      </header>

      <main className="mx-auto max-w-5xl px-6 py-8">
        <Outlet />
      </main>
    </div>
  );
}
