import { NavLink, Outlet } from 'react-router-dom';

import { tabClassName } from '../../components/ui/tabs.js';

const TABS = [
  { to: '/settings/company', label: 'Unternehmensdaten' },
  { to: '/settings/tax-profiles', label: 'Steuerprofile' },
  { to: '/settings/mail', label: 'E-Mail' },
  { to: '/settings/tax-advisor', label: 'Steuerberater-Export' },
  { to: '/settings/backup', label: 'Backup' },
];

export function SettingsLayout(): JSX.Element {
  return (
    <div className="space-y-6">
      <nav aria-label="Einstellungen" className="flex flex-wrap gap-1 border-b border-slate-200">
        {TABS.map((tab) => (
          <NavLink key={tab.to} to={tab.to} className={({ isActive }) => tabClassName(isActive)}>
            {tab.label}
          </NavLink>
        ))}
      </nav>
      <Outlet />
    </div>
  );
}
