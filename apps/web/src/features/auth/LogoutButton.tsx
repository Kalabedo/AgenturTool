import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import type { AuthSessionResponse } from '@privatura/shared';
import { apiClient } from '../../lib/apiClient.js';
import { queryKeys } from '../../lib/queryKeys.js';
import { Button } from '../../components/ui/Button.js';

/**
 * Abmelden — samt der E-Mail-Adresse, unter der man gerade arbeitet.
 *
 * Ist die Anmeldung abgeschaltet (lokaler Betrieb), zeigt die Kopfzeile
 * nichts davon: Ein Knopf, der nichts abmelden kann, verwirrt nur.
 */
export function LogoutButton(): JSX.Element | null {
  const queryClient = useQueryClient();
  const session = useQuery({
    queryKey: queryKeys.authSession,
    queryFn: () => apiClient.get<AuthSessionResponse>('/auth/session'),
    retry: false,
    staleTime: 60_000,
  });

  const logout = useMutation({
    mutationFn: () => apiClient.post<void>('/auth/logout', {}),
    onSuccess: () => {
      // Den ganzen Zwischenspeicher leeren, nicht nur die Sitzung: Sonst
      // bliebe nach dem Abmelden sichtbar, was der nächste Benutzer am
      // Bildschirm nicht sehen soll.
      queryClient.clear();
      void queryClient.invalidateQueries({ queryKey: queryKeys.authSession });
    },
  });

  const user = session.data?.user;
  if (session.data?.enabled !== true || user === null || user === undefined) return null;

  return (
    <div className="ml-auto flex items-center gap-3">
      <span className="text-sm text-ink-subtle">{user.email}</span>
      <Button variant="ghost" size="sm" onClick={() => logout.mutate()} disabled={logout.isPending}>
        Abmelden
      </Button>
    </div>
  );
}
