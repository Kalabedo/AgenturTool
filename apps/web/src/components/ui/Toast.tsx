import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useMemo,
  useRef,
  useState,
  type ReactNode,
} from 'react';

type Tone = 'success' | 'error' | 'info';

interface ToastOptions {
  /** Ein Weg zurück oder weiter, direkt in der Meldung. */
  action?: { label: string; onClick: () => void };
  /** Millisekunden bis zum Verschwinden; `null` bleibt stehen. */
  duration?: number | null;
}

interface ToastEntry extends ToastOptions {
  id: number;
  message: string;
  tone: Tone;
}

interface ToastApi {
  success: (message: string, options?: ToastOptions) => void;
  error: (message: string, options?: ToastOptions) => void;
  info: (message: string, options?: ToastOptions) => void;
}

/**
 * Kurze Rückmeldungen am unteren Rand.
 *
 * Sie sind das Gegenstück zu `StatusText`, nicht dessen Ersatz: Ein
 * „Gespeichert." gehört neben den Knopf, den man gerade gedrückt hat — dort
 * schaut man ohnehin hin, und es darf stehen bleiben, solange es stimmt. Eine
 * Meldung hier unten ist für das, was sich **nicht** dort zeigen kann:
 *
 * - Die Seite ist weg. Wer einen Kunden löscht, landet in der Liste; ohne
 *   diese Meldung wäre der einzige Beleg, dass etwas geschah, eine Zeile, die
 *   fehlt.
 * - Das Ergebnis liegt außerhalb des Fensters — eine heruntergeladene Datei
 *   erscheint im Download-Ordner, nicht auf dem Bildschirm.
 * - Die Handlung hinterlässt keine sichtbare Spur, etwa ein vermerkter
 *   Zahlungseingang in einem Feld, das ohnehin schon ausgefüllt aussah.
 *
 * Alles andere bleibt inline. Zwei Rückmeldungen für dieselbe Handlung sind
 * nicht doppelt so deutlich, sondern halb so glaubwürdig.
 */
const ToastContext = createContext<ToastApi | null>(null);

const DEFAULT_DURATION = 5000;
/** Mit einem Knopf darin braucht die Meldung Zeit, gelesen zu werden. */
const DURATION_WITH_ACTION = 9000;
/** Mehr als drei übereinander liest ohnehin niemand. */
const MAX_VISIBLE = 3;

export function useToast(): ToastApi {
  const api = useContext(ToastContext);
  if (api === null) {
    throw new Error('useToast braucht einen ToastProvider darüber.');
  }
  return api;
}

export function ToastProvider({ children }: { children: ReactNode }): JSX.Element {
  const [toasts, setToasts] = useState<ToastEntry[]>([]);
  const nextId = useRef(0);

  const dismiss = useCallback((id: number): void => {
    setToasts((current) => current.filter((toast) => toast.id !== id));
  }, []);

  const push = useCallback((message: string, tone: Tone, options?: ToastOptions): void => {
    const id = nextId.current;
    nextId.current += 1;
    setToasts((current) => [...current, { id, message, tone, ...options }].slice(-MAX_VISIBLE));
  }, []);

  // Fest verdrahtet statt bei jedem Render neu: Der Wert steckt in einem
  // Kontext, und ein neues Objekt ließe jede Komponente darunter neu rendern,
  // die ihn liest.
  const api = useMemo<ToastApi>(
    () => ({
      success: (message, options) => push(message, 'success', options),
      error: (message, options) => push(message, 'error', options),
      info: (message, options) => push(message, 'info', options),
    }),
    [push],
  );

  const politeToasts = toasts.filter((toast) => toast.tone !== 'error');
  const assertiveToasts = toasts.filter((toast) => toast.tone === 'error');

  return (
    <ToastContext.Provider value={api}>
      {children}

      {/*
       * Zwei Bereiche, weil ein Screenreader beides verschieden behandeln
       * soll: Ein „Kunde gelöscht." wartet, bis gerade nichts gesprochen wird
       * (`polite`), ein Fehler unterbricht (`assertive`). Ein einzelner
       * Bereich könnte nur eines von beidem.
       *
       * `fixed` und `pointer-events-none`: Die Meldungen stehen über der
       * Seite, verschieben dort nichts und fangen keine Klicks ab — nur die
       * Meldung selbst nimmt wieder welche an.
       */}
      <div className="pointer-events-none fixed inset-x-4 bottom-4 z-50 flex flex-col items-center sm:left-6 sm:right-auto sm:items-start">
        {/* Beide Bereiche stehen immer im Dokument, auch leer: Ein
            Live-Bereich, der erst mit seiner Meldung entsteht, wird von
            Screenreadern nicht vorgelesen. */}
        <div
          aria-live="polite"
          className="flex w-full flex-col items-center gap-2 empty:hidden sm:items-start"
        >
          {politeToasts.map((toast) => (
            <ToastItem key={toast.id} toast={toast} onDismiss={dismiss} />
          ))}
        </div>
        <div
          aria-live="assertive"
          className="mt-2 flex w-full flex-col items-center gap-2 empty:mt-0 empty:hidden sm:items-start"
        >
          {assertiveToasts.map((toast) => (
            <ToastItem key={toast.id} toast={toast} onDismiss={dismiss} />
          ))}
        </div>
      </div>
    </ToastContext.Provider>
  );
}

/*
 * Die Punkte stehen auf der umgekehrten Fläche und nicht auf der Seite —
 * sie brauchen deshalb keine Marken, sondern müssen gegen `bg-inverse`
 * bestehen. Die 400er-Töne tun das in beiden Modi: hell genug für das
 * dunkle Schiefer, satt genug für das helle.
 */
const DOTS: Record<Tone, string> = {
  success: 'bg-emerald-400',
  error: 'bg-rose-400',
  info: 'bg-sky-400',
};

function ToastItem({
  toast,
  onDismiss,
}: {
  toast: ToastEntry;
  onDismiss: (id: number) => void;
}): JSX.Element {
  const [paused, setPaused] = useState(false);
  const duration =
    toast.duration === undefined
      ? toast.action === undefined
        ? DEFAULT_DURATION
        : DURATION_WITH_ACTION
      : toast.duration;

  useEffect(() => {
    if (duration === null || paused) return;
    const timer = window.setTimeout(() => onDismiss(toast.id), duration);
    return () => window.clearTimeout(timer);
    // `paused` startet die Frist neu, sobald der Zeiger die Meldung verlässt.
    // Das ist gewollt: Wer hinschaut, soll nicht bestraft werden, indem die
    // Meldung in dem Moment verschwindet, in dem er zum Knopf greift.
  }, [duration, paused, toast.id, onDismiss]);

  return (
    <div
      // Eine Meldung, auf der der Zeiger steht oder in der der Fokus liegt,
      // läuft nicht davon.
      onMouseEnter={() => setPaused(true)}
      onMouseLeave={() => setPaused(false)}
      onFocus={() => setPaused(true)}
      onBlur={() => setPaused(false)}
      className={[
        'toast-enter pointer-events-auto flex w-full max-w-md items-start gap-3',
        'rounded-lg bg-inverse px-4 py-3 text-sm text-on-inverse shadow-lg',
      ].join(' ')}
    >
      <span
        aria-hidden="true"
        className={`mt-1.5 h-2 w-2 shrink-0 rounded-full ${DOTS[toast.tone]}`}
      />

      <p className="min-w-0 flex-1">{toast.message}</p>

      {toast.action !== undefined && (
        <button
          type="button"
          onClick={() => {
            toast.action?.onClick();
            onDismiss(toast.id);
          }}
          className="shrink-0 rounded font-medium text-on-inverse underline underline-offset-2 hover:opacity-80 focus:outline-none focus-visible:ring-2 focus-visible:ring-focus"
        >
          {toast.action.label}
        </button>
      )}

      <button
        type="button"
        onClick={() => onDismiss(toast.id)}
        aria-label="Meldung schließen"
        className="-my-1 -mr-1.5 shrink-0 rounded px-1.5 py-1 text-on-inverse opacity-70 hover:opacity-100 focus:outline-none focus-visible:ring-2 focus-visible:ring-focus"
      >
        <span aria-hidden="true">✕</span>
      </button>
    </div>
  );
}
