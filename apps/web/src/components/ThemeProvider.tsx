import { createContext, useCallback, useContext, useEffect, useMemo, useState } from 'react';
import type { ReactNode } from 'react';

/**
 * Hell, Dunkel oder dem Betriebssystem folgen.
 *
 * Drei Zustände und nicht zwei: „Automatisch" ist etwas anderes als „zufällig
 * gerade hell". Wer abends auf Dunkel umstellt, will das Fenster morgens
 * wieder hell haben, ohne daran zu denken.
 */
export type ThemePreference = 'light' | 'dark' | 'system';

/** Was am Ende wirklich angezeigt wird. */
export type ResolvedTheme = 'light' | 'dark';

const STORAGE_KEY = 'privatura.theme';

interface ThemeApi {
  preference: ThemePreference;
  resolved: ResolvedTheme;
  setPreference: (preference: ThemePreference) => void;
}

const ThemeContext = createContext<ThemeApi | null>(null);

function isPreference(value: unknown): value is ThemePreference {
  return value === 'light' || value === 'dark' || value === 'system';
}

/**
 * Die gespeicherte Vorliebe, oder „Automatisch".
 *
 * In try/catch, weil der Zugriff selbst werfen kann — ein frisches
 * Electron-Profil oder eine Browsereinstellung, die Seitendaten sperrt.
 * Eine Anwendung, die deshalb gar nicht startet, wäre der schlechtere Tausch.
 */
function storedPreference(): ThemePreference {
  try {
    const raw = window.localStorage.getItem(STORAGE_KEY);
    return isPreference(raw) ? raw : 'system';
  } catch {
    return 'system';
  }
}

function systemPrefersDark(): boolean {
  return window.matchMedia('(prefers-color-scheme: dark)').matches;
}

/**
 * Sagt dem Hauptprozess Bescheid, welcher Modus gilt.
 *
 * Electron legt die Hintergrundfarbe eines Fensters bei seiner Erzeugung
 * fest und kann sie später nicht mehr ändern. Damit der nächste Start nicht
 * weiß aufblitzt, muss die Vorliebe schon vor dem Öffnen bekannt sein — sie
 * wandert deshalb in die Fensterdatei.
 *
 * Der Weg führt über die lokale API und nicht über IPC: Das Fenster lädt die
 * Oberfläche ohnehin über HTTP vom eigenen Server, eine Brücke gibt es
 * nicht. Im reinen Browserbetrieb (`pnpm dev`) kennt der Server die
 * Fähigkeit nicht und antwortet mit 404 — das ist kein Fehler, sondern der
 * Normalfall, und wird deshalb verschluckt.
 */
function tellHost(preference: ThemePreference): void {
  void fetch('/api/app/theme', {
    method: 'PUT',
    headers: { 'content-type': 'application/json' },
    body: JSON.stringify({ preference }),
  }).catch(() => undefined);
}

export function ThemeProvider({ children }: { children: ReactNode }): JSX.Element {
  const [preference, setPreferenceState] = useState<ThemePreference>(storedPreference);
  const [systemDark, setSystemDark] = useState<boolean>(systemPrefersDark);

  /*
   * Der Lauscher bleibt immer angehängt, auch wenn gerade Hell oder Dunkel
   * fest eingestellt ist. Sonst wirkte das Umschalten auf „Automatisch"
   * erst beim nächsten Systemwechsel.
   */
  useEffect(() => {
    const query = window.matchMedia('(prefers-color-scheme: dark)');
    const onChange = (event: MediaQueryListEvent): void => setSystemDark(event.matches);
    query.addEventListener('change', onChange);
    return () => query.removeEventListener('change', onChange);
  }, []);

  const resolved: ResolvedTheme =
    preference === 'system' ? (systemDark ? 'dark' : 'light') : preference;

  useEffect(() => {
    document.documentElement.dataset.theme = resolved;

    // Die Farbe der Browserleiste auf dem Telefon soll zur Kopfzeile passen.
    const meta = document.querySelector('meta[name="theme-color"]');
    if (meta !== null) {
      meta.setAttribute('content', resolved === 'dark' ? '#18191b' : '#ffffff');
    }
  }, [resolved]);

  const setPreference = useCallback((next: ThemePreference) => {
    setPreferenceState(next);
    try {
      window.localStorage.setItem(STORAGE_KEY, next);
    } catch {
      // Ohne Speicher gilt die Wahl für diese Sitzung. Besser als ein Absturz.
    }
    tellHost(next);
  }, []);

  const api = useMemo<ThemeApi>(
    () => ({ preference, resolved, setPreference }),
    [preference, resolved, setPreference],
  );

  return <ThemeContext.Provider value={api}>{children}</ThemeContext.Provider>;
}

export function useTheme(): ThemeApi {
  const context = useContext(ThemeContext);
  if (context === null) {
    throw new Error('useTheme braucht einen ThemeProvider darüber.');
  }
  return context;
}
