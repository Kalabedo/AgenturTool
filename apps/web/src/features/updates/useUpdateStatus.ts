import { useMutation, useQuery, useQueryClient, type UseQueryResult } from '@tanstack/react-query';
import type { UpdateStatus } from '@agentur-tool/shared';
import { apiClient } from '../../lib/apiClient.js';
import { queryKeys } from '../../lib/queryKeys.js';

/**
 * Der Updatezustand, wie ihn der Hauptprozess führt.
 *
 * Die Oberfläche fragt nichts nach draußen — sie fragt den eigenen Server,
 * und der reicht durch, was der Hauptprozess zuletzt gesehen hat (D41,
 * D43). Deshalb ist das hier eine gewöhnliche Abfrage auf der
 * Rückschleife und kostet nichts.
 *
 * Der Abstand richtet sich nach dem Zustand: Während eines Downloads jede
 * Sekunde, damit der Balken läuft; sonst alle fünf Minuten, damit ein
 * Update, das der Hauptprozess im Hintergrund gefunden hat, von selbst im
 * Banner auftaucht.
 */
export function useUpdateStatus(): UseQueryResult<UpdateStatus> {
  return useQuery({
    queryKey: queryKeys.appUpdate,
    queryFn: () => apiClient.get<UpdateStatus>('/app/update'),
    refetchInterval: (query) => {
      const state = query.state.data?.state;
      return state === 'laedt' || state === 'prueft' || state === 'installiert'
        ? 1_000
        : 5 * 60 * 1000;
    },
    // Ein fehlgeschlagener Abruf ist keine Meldung wert: Die Anwendung
    // funktioniert auch ohne zu wissen, ob es eine neue Fassung gibt.
    retry: false,
  });
}

/** „Jetzt nach Updates suchen" — fragt den Feed, ohne auf den Tag zu warten. */
export function useCheckForUpdate() {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: () => apiClient.post<UpdateStatus>('/app/update/check', {}),
    onSuccess: (status) => {
      queryClient.setQueryData(queryKeys.appUpdate, status);
    },
  });
}

/** Die Einstellung „selbsttätig prüfen". */
export function useUpdateSettings() {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: (automatic: boolean) =>
      apiClient.put<UpdateStatus>('/app/update/settings', { automatic }),
    onSuccess: (status) => {
      queryClient.setQueryData(queryKeys.appUpdate, status);
    },
  });
}

/**
 * Startet den Download im Hauptprozess.
 *
 * Die Antwort kommt sofort — mit dem Zustand `laedt`. Der Fortschritt
 * kommt danach über `useUpdateStatus`, das währenddessen jede Sekunde
 * nachfragt.
 */
export function useDownloadUpdate() {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: () => apiClient.post<UpdateStatus>('/app/update/download', {}),
    onSuccess: (status) => {
      queryClient.setQueryData(queryKeys.appUpdate, status);
    },
  });
}

/** Bricht einen laufenden Download ab. */
export function useCancelDownload() {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: () => apiClient.post<UpdateStatus>('/app/update/download/cancel', {}),
    onSuccess: (status) => {
      queryClient.setQueryData(queryKeys.appUpdate, status);
    },
  });
}

/**
 * Sichern, installieren, neu starten.
 *
 * Die Anfrage bleibt im Erfolgsfall ohne Antwort: Die Anwendung beendet
 * sich mitten darin und kommt als neue Fassung wieder. Ein Abbruch der
 * Verbindung ist hier deshalb kein Fehler, sondern das erwartete Ende —
 * die Oberfläche zeigt währenddessen „wird installiert" und wartet auf den
 * Neustart.
 */
export function useInstallUpdate() {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: () => apiClient.post<UpdateStatus>('/app/update/install', {}),
    onSuccess: (status) => {
      queryClient.setQueryData(queryKeys.appUpdate, status);
    },
  });
}

/** Zeigt das geladene Paket im Dateimanager. */
export function useRevealDownload() {
  return useMutation({
    mutationFn: () => apiClient.post<{ revealed: true }>('/app/update/reveal', {}),
  });
}

/**
 * Öffnet das Paket im Browser des Rechners.
 *
 * Kein `<a href>`: Die Adresse steht im Hauptprozess, und das Fenster soll
 * sie weder kennen noch selbst ansteuern müssen — jede Anfrage nach außen
 * würde dort ohnehin abgewiesen.
 */
export function useOpenDownload() {
  return useMutation({
    mutationFn: () => apiClient.post<{ opened: true }>('/app/update/open', {}),
  });
}

/**
 * Soll das Banner erscheinen, und wofür?
 *
 * Als eigene Funktion, weil daran die Zusagen des ganzen Wegs hängen: Ein
 * Update wird gemeldet; ein laufender Download bleibt sichtbar; ein
 * geladenes Paket fragt nach der Installation; und eine weggeklickte
 * Meldung bleibt weg — bis zur nächsten Fassung. Alles davon lässt sich so
 * prüfen, ohne eine Seite zu rendern.
 *
 * Weggeklickt wird nur der Hinweis „es gibt etwas Neues". Ein Download,
 * den jemand angestoßen hat, verschwindet nicht aus der Anzeige, und ein
 * geladenes Paket fragt nach dem nächsten Start wieder — es liegt ja da.
 */
export type BannerMode = 'kein' | 'verfuegbar' | 'laedt' | 'bereit' | 'installiert' | 'fehler';

export function bannerMode(
  status: UpdateStatus | undefined,
  dismissedVersion: string | null,
): BannerMode {
  if (status === undefined) return 'kein';

  switch (status.state) {
    case 'laedt':
      return 'laedt';
    case 'installiert':
      return 'installiert';
    case 'bereit':
      return status.ready === null ? 'kein' : 'bereit';
    case 'verfuegbar':
      if (status.available === null) return 'kein';
      return status.available.version === dismissedVersion ? 'kein' : 'verfuegbar';
    case 'fehler':
      // Ein Fehlschlag beim Laden oder Installieren gehört ins Banner: Dort
      // stand gerade noch der Fortschritt. Eine gescheiterte Prüfung dagegen
      // bleibt in den Einstellungen — sie hat niemand ausgelöst.
      return status.available !== null && status.available.version !== dismissedVersion
        ? 'fehler'
        : 'kein';
    default:
      return 'kein';
  }
}

/** Erscheint das Banner überhaupt? */
export function shouldShowBanner(
  status: UpdateStatus | undefined,
  dismissedVersion: string | null,
): boolean {
  return bannerMode(status, dismissedVersion) !== 'kein';
}

const DISMISS_KEY = 'agentur-tool.update-dismissed';

/**
 * Die zuletzt weggeklickte Fassung.
 *
 * Im Browser und nicht auf dem Server: „Nicht jetzt" ist eine Aussage über
 * diesen Moment an diesem Gerät, kein Geschäftsdatum. In try/catch, weil
 * ein frisches Electron-Profil oder eine gesperrte Seitendatenablage den
 * Zugriff selbst werfen lässt.
 */
export function readDismissedVersion(): string | null {
  try {
    return window.localStorage.getItem(DISMISS_KEY);
  } catch {
    return null;
  }
}

export function writeDismissedVersion(version: string): void {
  try {
    window.localStorage.setItem(DISMISS_KEY, version);
  } catch {
    // Dann erscheint das Banner beim nächsten Start wieder. Kein Grund,
    // deshalb etwas zu melden.
  }
}
