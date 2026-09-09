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
    this.enabled = booleanSetting(config, 'AUTH_ENABLED', false);
    this.sessionTtlDays = integerSetting(config, 'SESSION_TTL_DAYS', 30, 1, 365);
    this.cookieSecure = booleanSetting(config, 'COOKIE_SECURE', this.enabled) && this.enabled;
    this.maxLoginAttempts = integerSetting(config, 'LOGIN_MAX_ATTEMPTS', 10, 1, 100);
    this.loginWindowMs = integerSetting(config, 'LOGIN_WINDOW_MINUTES', 15, 1, 24 * 60) * 60_000;
  }
}

function booleanSetting(config: ConfigService, key: string, fallback: boolean): boolean {
  const value = config.get<string>(key);
  if (value === undefined || value === '') return fallback;
  if (value === 'true') return true;
  if (value === 'false') return false;
  throw new Error(`${key} muss "true" oder "false" sein (erhalten: ${value}).`);
}

function integerSetting(
  config: ConfigService,
  key: string,
  fallback: number,
  minimum: number,
  maximum: number,
): number {
  const raw = config.get<string>(key);
  if (raw === undefined || raw === '') return fallback;
  const value = Number(raw);
  if (!Number.isInteger(value) || value < minimum || value > maximum) {
    throw new Error(`${key} muss eine ganze Zahl zwischen ${minimum} und ${maximum} sein.`);
  }
  return value;
}
