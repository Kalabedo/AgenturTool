import { NavLink, Outlet } from 'react-router-dom';

const TABS = [
  { to: '/settings/company', label: 'Unternehmensdaten' },
  { to: '/settings/tax-profiles', label: 'Steuerprofile' },
  { to: '/settings/tax-advisor', label: 'Steuerberater-Export' },
  { to: '/settings/backup', label: 'Backup' },
];

export function SettingsLayout(): JSX.Element {
  return (
    <div className="space-y-6">
      <nav aria-label="Einstellungen" className="flex flex-wrap gap-1 border-b border-slate-200">
        {TABS.map((tab) => (
          <NavLink
            key={tab.to}
            to={tab.to}
            className={({ isActive }) =>
              [
                '-mb-px border-b-2 px-3 py-2 text-sm transition-colors',
                'focus:outline-none focus-visible:ring-2 focus-visible:ring-slate-300',
                isActive
                  ? 'border-slate-900 font-medium text-slate-900'
                  : 'border-transparent text-slate-500 hover:border-slate-300 hover:text-slate-800',
              ].join(' ')
            }
          >
            {tab.label}
          </NavLink>
        ))}
      </nav>
      <Outlet />
    </div>
  );
}
