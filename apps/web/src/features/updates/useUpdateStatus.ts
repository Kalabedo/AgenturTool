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
 * Gefragt wird selten: Der Hauptprozess prüft höchstens einmal am Tag; ein
 * Abstand von fünf Minuten genügt, damit das Banner nach einer Prüfung im
 * Hintergrund von selbst auftaucht.
 */
export function useUpdateStatus(): UseQueryResult<UpdateStatus> {
  return useQuery({
    queryKey: queryKeys.appUpdate,
    queryFn: () => apiClient.get<UpdateStatus>('/app/update'),
    refetchInterval: 5 * 60 * 1000,
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
 * Öffnet das Paket im Browser des Rechners.
 *
 * Kein `<a href>`: Die Adresse steht im Hauptprozess, und das Fenster soll
 * sie weder kennen noch selbst ansteuern müssen — jede Anfrage nach außen
 * würde dort ohnehin abgewiesen.
 */
export function useDownloadUpdate() {
  return useMutation({
    mutationFn: () => apiClient.post<{ opened: true }>('/app/update/download', {}),
  });
}

/**
 * Soll das Banner erscheinen?
 *
 * Als eigene Funktion, weil daran zwei Zusagen hängen: Ein Update wird
 * gemeldet, und eine weggeklickte Meldung bleibt weg — bis zur nächsten
 * Fassung. Beides lässt sich so prüfen, ohne eine Seite zu rendern.
 */
export function shouldShowBanner(
  status: UpdateStatus | undefined,
  dismissedVersion: string | null,
): boolean {
  if (status === undefined) return false;
  if (status.state !== 'verfuegbar' || status.available === null) return false;
  return status.available.version !== dismissedVersion;
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
