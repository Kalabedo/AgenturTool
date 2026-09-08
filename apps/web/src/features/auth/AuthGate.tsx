import { useEffect } from 'react';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import type { AuthSessionResponse } from '@agentur-tool/shared';
import { SESSION_EXPIRED_EVENT, apiClient } from '../../lib/apiClient.js';
import { queryKeys } from '../../lib/queryKeys.js';
import { LoginPage } from './LoginPage.js';

/**
 * Entscheidet, ob die Anwendung oder das Anmeldeformular erscheint.
 *
 * Die Frage beantwortet der Server (`/api/auth/session`), nicht das
 * Frontend: Lokal ist die Anmeldung aus, dann soll auch kein Formular
 * kommen. Aus einem 401 zu raten wäre unzuverlässig — es gäbe einen
 * Augenblick, in dem die Anwendung schon sichtbar ist und ihre Daten nicht.
 */
export function AuthGate({ children }: { children: JSX.Element }): JSX.Element {
  const queryClient = useQueryClient();
  const session = useQuery({
    queryKey: queryKeys.authSession,
    queryFn: () => apiClient.get<AuthSessionResponse>('/auth/session'),
    // Ohne Wiederholung: Ein Fehler hier heißt „Server nicht erreichbar",
    // und dann hilft ein zweiter Versuch derselben Sekunde nicht.
    retry: false,
    staleTime: 60_000,
  });

  useEffect(() => {
    // Läuft die Sitzung im laufenden Betrieb ab, meldet der HTTP-Client das
    // über ein Fensterereignis. Wir fragen dann nach — der Server sagt uns,
    // ob wirklich abgemeldet oder nur eine einzelne Anfrage unglücklich war.
    const onExpired = (): void => {
      void queryClient.invalidateQueries({ queryKey: queryKeys.authSession });
    };
    window.addEventListener(SESSION_EXPIRED_EVENT, onExpired);
    return () => window.removeEventListener(SESSION_EXPIRED_EVENT, onExpired);
  }, [queryClient]);

  if (session.isLoading) {
    return <div className="p-6 text-sm text-slate-500">Wird geladen …</div>;
  }

  if (session.data?.enabled === true && session.data.user === null) {
    return <LoginPage />;
  }

  return children;
}
