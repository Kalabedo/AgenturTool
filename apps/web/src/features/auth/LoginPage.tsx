import { useState } from 'react';
import { useMutation, useQueryClient } from '@tanstack/react-query';
import type { AuthSessionResponse } from '@agentur-tool/shared';
import { ApiRequestError, apiClient } from '../../lib/apiClient.js';
import { queryKeys } from '../../lib/queryKeys.js';
import { Button } from '../../components/ui/Button.js';
import { Field } from '../../components/ui/Field.js';
import { Input } from '../../components/ui/Input.js';

/**
 * Die Anmeldung.
 *
 * Bewusst ohne „Passwort vergessen" und ohne Registrierung: Es gibt einen
 * Benutzer, und sein Passwort wird auf dem Server gesetzt (`pnpm user:set`).
 * Ein Zurücksetzen per E-Mail bräuchte einen Mailversand — und wäre ein
 * zweiter Weg hinein, den niemand bewacht.
 */
export function LoginPage(): JSX.Element {
  const queryClient = useQueryClient();
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');

  const login = useMutation({
    mutationFn: () => apiClient.post<AuthSessionResponse>('/auth/login', { email, password }),
    onSuccess: (session) => {
      queryClient.setQueryData(queryKeys.authSession, session);
      // Alles neu laden: Was vor der Anmeldung im Zwischenspeicher lag,
      // waren Fehlantworten.
      void queryClient.invalidateQueries();
    },
  });

  const error = login.error instanceof ApiRequestError ? login.error : null;

  return (
    <div className="flex min-h-screen items-center justify-center bg-slate-50 px-6">
      <form
        className="w-full max-w-sm space-y-5 rounded-lg border border-slate-200 bg-white p-6"
        onSubmit={(event) => {
          event.preventDefault();
          login.mutate();
        }}
      >
        <div>
          <h1 className="text-lg font-semibold text-slate-900">AgenturTool</h1>
          <p className="mt-1 text-sm text-slate-500">Bitte anmelden.</p>
        </div>

        <Field label="E-Mail" htmlFor="email">
          <Input
            id="email"
            type="email"
            autoComplete="username"
            value={email}
            onChange={(event) => setEmail(event.target.value)}
            required
          />
        </Field>

        <Field label="Passwort" htmlFor="password">
          <Input
            id="password"
            type="password"
            autoComplete="current-password"
            value={password}
            onChange={(event) => setPassword(event.target.value)}
            required
          />
        </Field>

        {error !== null && (
          <p role="alert" className="text-sm text-rose-600">
            {error.message}
          </p>
        )}

        <Button type="submit" className="w-full" disabled={login.isPending}>
          {login.isPending ? 'wird geprüft …' : 'Anmelden'}
        </Button>
      </form>
    </div>
  );
}
