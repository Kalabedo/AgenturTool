import { NavLink, Outlet, useMatch } from 'react-router-dom';

const NAVIGATION = [
  { to: '/', label: 'Dashboard', end: true },
  { to: '/invoices', label: 'Rechnungen' },
  { to: '/customers', label: 'Kunden' },
  { to: '/settings/company', label: 'Einstellungen' },
];

export function AppLayout(): JSX.Element {
  /**
   * Der Rechnungseditor bekommt mehr Breite als der Rest der Anwendung.
   *
   * Er ist der einzige Bildschirm, der zwei Dinge gleichzeitig zeigen soll:
   * ein Formular mit einer breiten Positionstabelle und daneben ein
   * A4-Blatt. In 64rem geht das nicht aus — die Tabelle müsste waagerecht
   * scrollen, und gerade die Spalten mit Rabatt und Betrag verschwänden.
   * Alle übrigen Seiten bleiben schmal, weil lange Zeilen sich schlechter
   * lesen.
   */
  const wideLayout = useMatch('/invoices/:id') !== null;

  return (
    <div className="min-h-screen bg-slate-50">
      <header className="border-b border-slate-200 bg-white">
        <div
          className={`mx-auto flex items-center gap-8 px-6 py-4 ${
            wideLayout ? 'max-w-[104rem]' : 'max-w-5xl'
          }`}
        >
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

      <main className={`mx-auto px-6 py-8 ${wideLayout ? 'max-w-[104rem]' : 'max-w-5xl'}`}>
        <Outlet />
      </main>
    </div>
  );
}
