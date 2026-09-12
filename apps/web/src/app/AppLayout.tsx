import type { ReactNode } from 'react';
import { Link, NavLink, Outlet, useMatch } from 'react-router-dom';

import { ThemeToggle } from '../components/ThemeToggle.js';
import { LogoutButton } from '../features/auth/LogoutButton.js';

const NAVIGATION = [
  { to: '/', label: 'Dashboard', end: true },
  { to: '/invoices', label: 'Rechnungen' },
  { to: '/customers', label: 'Kunden' },
  { to: '/time-tracking', label: 'Zeiterfassung' },
  { to: '/design', label: 'Design' },
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
  const invoiceEditor = useMatch('/invoices/:id') !== null;
  /*
   * Der Designer hat denselben Bedarf: links die Regler, rechts ein
   * A4-Blatt. `useMatch` ist ein Hook und muss deshalb unbedingt aufgerufen
   * werden — die Bedingung steht hinterher, nicht davor.
   */
  const designer = useMatch('/design') !== null;
  const wideLayout = invoiceEditor || designer;

  /**
   * Die Zeiterfassung liegt dazwischen. Ihr Erfassungsformular stellt fünf
   * Felder nebeneinander — Datum, Kunde, Beginn, Ende, Pause — und darunter
   * steht eine Tabelle mit sieben Spalten. In 64rem wird jedes davon so
   * schmal, dass in den Auswahlfeldern neben dem Aufklapp-Pfeil kaum noch
   * Text Platz hat. Sie braucht aber auch keine 104rem, weil nichts
   * daneben steht.
   */
  const mediumLayout = useMatch('/time-tracking') !== null;

  const contentWidth = wideLayout ? 'max-w-[104rem]' : mediumLayout ? 'max-w-7xl' : 'max-w-5xl';

  return (
    <div className="min-h-screen bg-surface-sunken">
      {/* Erst mit der Tastatur sichtbar: Wer sich durch die Seite tabbt, soll
          die Navigation überspringen können, statt sie auf jeder Seite erneut
          durchlaufen zu müssen. */}
      <a
        href="#inhalt"
        className="sr-only focus:not-sr-only focus:absolute focus:left-4 focus:top-4 focus:z-50 focus:rounded-md focus:bg-inverse focus:px-4 focus:py-2 focus:text-sm focus:font-medium focus:text-on-inverse"
      >
        Zum Inhalt springen
      </a>

      <header className="border-b border-border bg-surface">
        {/* Die Kopfzeile behält über alle Routen dieselbe Geometrie. Ihre
            Breite an den jeweiligen Seiteninhalt zu koppeln ließ Logo und
            Navigation beim Wechsel zur breiteren Zeiterfassung springen. */}
        <div className="mx-auto flex max-w-[104rem] flex-wrap items-center gap-x-8 gap-y-2 px-4 py-4 sm:px-6">
          <Link to="/" className="text-base font-semibold tracking-tight text-ink">
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
                    'focus:outline-none focus-visible:ring-2 focus-visible:ring-focus',
                    isActive
                      ? 'bg-surface-raised font-medium text-ink'
                      : 'text-ink-muted hover:bg-surface-sunken hover:text-ink',
                  ].join(' ')
                }
              >
                {item.label}
              </NavLink>
            ))}
          </nav>
          <div className="ml-auto flex items-center gap-3">
            <ThemeToggle />
            <LogoutButton />
          </div>
        </div>
      </header>

      <main id="inhalt" className={`mx-auto px-4 py-8 sm:px-6 ${contentWidth}`}>
        {error ?? <Outlet />}
      </main>
    </div>
  );
}
