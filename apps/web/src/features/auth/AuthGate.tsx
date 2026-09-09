import { useEffect } from 'react';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import type { AuthSessionResponse } from '@agentur-tool/shared';
import { SESSION_EXPIRED_EVENT, apiClient } from '../../lib/apiClient.js';
import { queryKeys } from '../../lib/queryKeys.js';
import { LoginPage } from './LoginPage.js';
import { Button } from '../../components/ui/Button.js';
import { ErrorNotice } from '../../components/ui/ErrorNotice.js';

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
    return (
      <div className="flex min-h-screen items-center justify-center bg-slate-50 p-6">
        <p aria-live="polite" className="text-sm text-slate-500">
          AgenturTool wird geladen …
        </p>
      </div>
    );
  }

  if (session.isError) {
    return (
      <div className="flex min-h-screen items-center justify-center bg-slate-50 p-6">
        <div className="w-full max-w-md space-y-4">
          <ErrorNotice error={session.error} title="AgenturTool ist gerade nicht erreichbar." />
          <Button variant="secondary" onClick={() => void session.refetch()}>
            Erneut verbinden
          </Button>
        </div>
      </div>
    );
  }

  if (session.data?.enabled === true && session.data.user === null) {
    return <LoginPage hasUser={session.data.hasUser} />;
  }

  return children;
}
