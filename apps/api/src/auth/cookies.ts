/**
 * Cookies lesen und schreiben, ohne zusätzliche Abhängigkeit.
 *
 * Es geht um genau ein Cookie. `cookie-parser` als Middleware einzuziehen,
 * hieße eine Abhängigkeit für zehn Zeilen zu pflegen — und eine, die auf
 * jedem Request läuft.
 */
export function readCookie(header: string | undefined, name: string): string | null {
  if (header === undefined) return null;

  for (const part of header.split(';')) {
    const separator = part.indexOf('=');
    if (separator === -1) continue;

    if (part.slice(0, separator).trim() === name) {
      return decodeURIComponent(part.slice(separator + 1).trim());
    }
  }
  return null;
}

export interface SessionCookieOptions {
  secure: boolean;
  maxAgeMs: number;
}

/**
 * Die Eigenschaften des Session-Cookies.
 *
 * `httpOnly`, damit kein Skript im Browser an das Token kommt; `sameSite:
 * lax`, damit es bei einer Anfrage von einer fremden Seite nicht mitgeschickt
 * wird (CSRF), normales Navigieren aber weiter funktioniert; `secure`, sobald
 * es HTTPS gibt.
 */
export function sessionCookieOptions(options: SessionCookieOptions): {
  httpOnly: true;
  sameSite: 'lax';
  secure: boolean;
  path: '/';
  maxAge: number;
} {
  return {
    httpOnly: true,
    sameSite: 'lax',
    secure: options.secure,
    path: '/',
    maxAge: options.maxAgeMs,
  };
}
