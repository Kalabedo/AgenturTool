import { NavLink, Outlet } from 'react-router-dom';

const TABS = [
  { to: '/settings/company', label: 'Unternehmensdaten' },
  { to: '/settings/tax-profiles', label: 'Steuerprofile' },
];

export function SettingsLayout(): JSX.Element {
  return (
    <div className="space-y-6">
      <nav className="flex gap-1 border-b border-slate-200">
        {TABS.map((tab) => (
          <NavLink
            key={tab.to}
            to={tab.to}
            className={({ isActive }) =>
              [
                '-mb-px border-b-2 px-3 py-2 text-sm transition-colors',
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
