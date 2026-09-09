import { z } from 'zod';

/**
 * Anmeldung (Abschnitt 16, D18).
 *
 * Zwei Schichten tragen unabhängig voneinander: das Netz (Tailscale) und
 * die Anwendung (dieser Login). Der Login ist auch dann sinnvoll, wenn der
 * Dienst nur im Tailnet hängt — ein verlorenes oder entwendetes Gerät ist
 * sonst ein offener Zugang zu allen Rechnungsdaten.
 */

export const loginInputSchema = z.object({
  email: z.string().trim().min(1, 'Bitte die E-Mail-Adresse angeben.').max(200),
  password: z.string().min(1, 'Bitte das Passwort angeben.').max(1000),
});
export type LoginPayload = z.output<typeof loginInputSchema>;

export interface AuthUser {
  id: number;
  email: string;
  displayName: string | null;
}

/**
 * Antwort auf „wer bin ich".
 *
 * `enabled` sagt der Oberfläche, ob es überhaupt eine Anmeldung gibt: Lokal
 * läuft die Anwendung ohne (D1), und dann soll auch kein Anmeldeformular
 * erscheinen. Ohne dieses Feld müsste das Frontend aus einem 401 raten.
 */
export interface AuthSessionResponse {
  enabled: boolean;
  /** Ob mindestens ein Benutzer angelegt wurde; verhindert eine Login-Sackgasse. */
  hasUser: boolean;
  user: AuthUser | null;
}

/** Mindestlänge für das Passwort — kurz genug zum Merken, lang genug gegen Raten. */
export const PASSWORD_MIN_LENGTH = 12;

export const passwordSchema = z
  .string()
  .min(PASSWORD_MIN_LENGTH, `Das Passwort braucht mindestens ${PASSWORD_MIN_LENGTH} Zeichen.`)
  .max(1000);
