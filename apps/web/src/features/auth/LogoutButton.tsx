import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import type { AuthSessionResponse } from '@agentur-tool/shared';
import { apiClient } from '../../lib/apiClient.js';
import { queryKeys } from '../../lib/queryKeys.js';

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
      <span className="text-sm text-slate-500">{user.email}</span>
      <button
        type="button"
        className="rounded-md px-3 py-1.5 text-sm text-slate-600 transition-colors hover:bg-slate-50 hover:text-slate-900"
        onClick={() => logout.mutate()}
        disabled={logout.isPending}
      >
        Abmelden
      </button>
    </div>
  );
}
