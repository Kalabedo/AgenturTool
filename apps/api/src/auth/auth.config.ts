import { Injectable } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';

/**
 * Einstellungen der Anmeldung.
 *
 * `AUTH_ENABLED` ist der Schalter aus D1: Lokal läuft die Anwendung ohne
 * Anmeldung, im Netz mit. Beides ist derselbe Code — das Auth-Modul ist von
 * Anfang an vorhanden und wird nicht nachträglich eingebaut, wenn es eilig
 * ist.
 */
@Injectable()
export class AuthConfig {
  readonly enabled: boolean;
  readonly cookieName = 'agentur_session';
  readonly sessionTtlDays: number;

  /**
   * Ob das Cookie nur über HTTPS gesendet wird.
   *
   * Voreinstellung: an, sobald die Anmeldung an ist. Hinter Tailscale läuft
   * HTTPS über `tailscale cert`; wer die Anwendung im Klartext betreibt,
   * muss das ausdrücklich abschalten und weiß dann, was er tut.
   */
  readonly cookieSecure: boolean;

  /** Versuche je Absender und Zeitfenster, bevor der Login sperrt. */
  readonly maxLoginAttempts: number;
  readonly loginWindowMs: number;

  constructor(config: ConfigService) {
    this.enabled = config.get<string>('AUTH_ENABLED') === 'true';
    this.sessionTtlDays = Number(config.get<string>('SESSION_TTL_DAYS') ?? 30);
    this.cookieSecure = config.get<string>('COOKIE_SECURE') !== 'false' && this.enabled;
    this.maxLoginAttempts = Number(config.get<string>('LOGIN_MAX_ATTEMPTS') ?? 10);
    this.loginWindowMs = Number(config.get<string>('LOGIN_WINDOW_MINUTES') ?? 15) * 60_000;
  }
}
