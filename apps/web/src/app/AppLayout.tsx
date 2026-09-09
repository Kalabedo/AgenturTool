import type { ReactNode } from 'react';
import { Link, NavLink, Outlet, useMatch } from 'react-router-dom';

import { LogoutButton } from '../features/auth/LogoutButton.js';

const NAVIGATION = [
  { to: '/', label: 'Dashboard', end: true },
  { to: '/invoices', label: 'Rechnungen' },
  { to: '/customers', label: 'Kunden' },
  { to: '/time-tracking', label: 'Zeiterfassung' },
  { to: '/settings/company', label: 'Einstellungen' },
];

/**
 * @param error Wird anstelle der Route gezeigt, wenn der Router einen Fehler
 *   auffängt. Kopfzeile und Navigation bleiben dabei stehen — eine Fehlerseite
 *   ohne Ausweg wäre eine Sackgasse.
 */
export function AppLayout({ error }: { error?: ReactNode }): JSX.Element {
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

  /**
   * Die Zeiterfassung liegt dazwischen. Ihr Erfassungsformular stellt fünf
   * Felder nebeneinander — Datum, Kunde, Beginn, Ende, Pause — und darunter
   * steht eine Tabelle mit sieben Spalten. In 64rem wird jedes davon so
   * schmal, dass in den Auswahlfeldern neben dem Aufklapp-Pfeil kaum noch
   * Text Platz hat. Sie braucht aber auch keine 104rem, weil nichts
   * daneben steht.
   */
  const mediumLayout = useMatch('/time-tracking') !== null;

  const width = wideLayout ? 'max-w-[104rem]' : mediumLayout ? 'max-w-7xl' : 'max-w-5xl';

  return (
    <div className="min-h-screen bg-slate-50">
      {/* Erst mit der Tastatur sichtbar: Wer sich durch die Seite tabbt, soll
          die Navigation überspringen können, statt sie auf jeder Seite erneut
          durchlaufen zu müssen. */}
      <a
        href="#inhalt"
        className="sr-only focus:not-sr-only focus:absolute focus:left-4 focus:top-4 focus:z-50 focus:rounded-md focus:bg-slate-900 focus:px-4 focus:py-2 focus:text-sm focus:font-medium focus:text-white"
      >
        Zum Inhalt springen
      </a>

      <header className="border-b border-slate-200 bg-white">
        <div
          className={`mx-auto flex flex-wrap items-center gap-x-8 gap-y-2 px-4 py-4 sm:px-6 ${width}`}
        >
          <Link to="/" className="text-base font-semibold tracking-tight text-slate-900">
            AgenturTool
          </Link>
          {/* Auf schmalen Bildschirmen darf die Navigation waagerecht
              scrollen, statt die Kopfzeile in vier Zeilen zu zerlegen. */}
          <nav
            aria-label="Hauptnavigation"
            className="-mx-1 flex max-w-full items-center gap-1 overflow-x-auto px-1"
          >
            {NAVIGATION.map((item) => (
              <NavLink
                key={item.to}
                to={item.to}
                end={item.end}
                className={({ isActive }) =>
                  [
                    'whitespace-nowrap rounded-md px-3 py-1.5 text-sm transition-colors',
                    'focus:outline-none focus-visible:ring-2 focus-visible:ring-slate-300',
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
          <LogoutButton />
        </div>
      </header>

      <main id="inhalt" className={`mx-auto px-4 py-8 sm:px-6 ${width}`}>
        {error ?? <Outlet />}
      </main>
    </div>
  );
}
