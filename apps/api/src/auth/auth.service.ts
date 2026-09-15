import crypto from 'node:crypto';
import { Injectable, Logger } from '@nestjs/common';
import { hash as argonHash, verify as argonVerify, Algorithm } from '@node-rs/argon2';
import type { AuthUser, LoginPayload } from '@privatura/shared';
import { ApiError } from '../common/api-error';
import { PrismaService } from '../common/prisma.service';
import { AuthConfig } from './auth.config';

/**
 * Ein Hash, gegen den geprüft wird, wenn es den Benutzer gar nicht gibt.
 *
 * Ohne ihn wäre eine unbekannte E-Mail-Adresse messbar schneller beantwortet
 * als ein falsches Passwort — und damit ließe sich herausfinden, welche
 * Adresse existiert. Der Wert ist der argon2id-Hash einer Zeichenkette, die
 * niemand als Passwort hat.
 */
const DUMMY_HASH =
  '$argon2id$v=19$m=19456,t=2,p=1$c29tZS1jb25zdGFudC1zYWx0$KqzMbPWQGDrLdN+DiBBqZDLc9ZmTeaomYuFqQBbaCms';

/** argon2id mit den Voreinstellungen der Bibliothek (19 MiB, 2 Durchläufe). */
const ARGON_OPTIONS = { algorithm: Algorithm.Argon2id } as const;

interface AttemptWindow {
  count: number;
  firstAt: number;
}

/**
 * Anmeldung, Sitzungen, Passwörter (Abschnitt 16).
 *
 * Serverseitige Sitzungen statt JWT: Ein Widerruf muss sofort wirken. Bei
 * einem JWT hieße „abmelden" entweder warten, bis es abläuft, oder eine
 * Sperrliste führen — und eine Sperrliste ist eine Sitzungstabelle mit
 * zusätzlichen Schritten.
 *
 * In der Datenbank steht nie das Token selbst, sondern sein SHA-256. Wer die
 * Datenbank liest — Backup, Kopie, Fehlersuche —, kann sich damit nicht
 * anmelden.
 */
@Injectable()
export class AuthService {
  private readonly logger = new Logger(AuthService.name);

  /**
   * Fehlversuche je Absender, im Speicher.
   *
   * Bewusst keine Tabelle und kein Redis: Es gibt einen Benutzer und einen
   * Prozess. Nach einem Neustart ist die Zählung weg — das ist die
   * Schwäche dieser Lösung und bei einem Dienst, der nur im Tailnet hängt,
   * hinnehmbar.
   */
  private readonly attempts = new Map<string, AttemptWindow>();

  constructor(
    private readonly prisma: PrismaService,
    private readonly config: AuthConfig,
  ) {}

  async hashPassword(password: string): Promise<string> {
    return argonHash(password, ARGON_OPTIONS);
  }

  /**
   * Meldet an und liefert das Session-Token im Klartext — einmalig, für das
   * Cookie. Danach existiert nur noch sein Hash.
   */
  async login(payload: LoginPayload, origin: string): Promise<{ token: string; user: AuthUser }> {
    this.assertNotRateLimited(origin);

    const user = await this.prisma.user.findUnique({
      where: { email: payload.email.toLowerCase() },
    });

    // Immer prüfen, auch ohne Benutzer: gleiche Antwortzeit, gleiche Meldung.
    const valid = await argonVerify(user?.passwordHash ?? DUMMY_HASH, payload.password).catch(
      () => false,
    );

    if (user === null || !valid) {
      this.recordFailure(origin);
      // Eine Meldung für beide Fälle. „Benutzer unbekannt" verrät, welche
      // Adressen existieren.
      throw ApiError.invalidCredentials('E-Mail-Adresse oder Passwort stimmen nicht.');
    }

    this.attempts.delete(origin);

    const token = crypto.randomBytes(32).toString('base64url');
    const expiresAt = new Date(Date.now() + this.config.sessionTtlDays * 24 * 60 * 60 * 1000);

    await this.prisma.$transaction([
      this.prisma.session.create({
        data: { tokenHash: hashToken(token), userId: user.id, expiresAt },
      }),
      // Abgelaufene Sitzungen bei dieser Gelegenheit wegräumen — ein
      // eigener Aufräumlauf wäre für eine Tabelle mit einer Handvoll Zeilen
      // zu viel Apparat.
      this.prisma.session.deleteMany({ where: { expiresAt: { lt: new Date() } } }),
      this.prisma.user.update({ where: { id: user.id }, data: { lastLoginAt: new Date() } }),
    ]);

    this.logger.log(`Anmeldung: ${user.email}`);
    return { token, user: toAuthUser(user) };
  }

  async logout(token: string | null): Promise<void> {
    if (token === null) return;
    await this.prisma.session.deleteMany({ where: { tokenHash: hashToken(token) } });
  }

  /** Der angemeldete Benutzer zu einem Token, oder `null`. */
  async userForToken(token: string | null): Promise<AuthUser | null> {
    if (token === null) return null;

    const session = await this.prisma.session.findUnique({
      where: { tokenHash: hashToken(token) },
      include: { user: true },
    });

    if (session === null) return null;
    if (session.expiresAt.getTime() <= Date.now()) {
      // Abgelaufen heißt weg: Eine Sitzung, die nicht mehr gilt, soll auch
      // nicht mehr in der Tabelle stehen.
      await this.prisma.session.delete({ where: { id: session.id } }).catch(() => undefined);
      return null;
    }

    return toAuthUser(session.user);
  }

  /** Ob überhaupt ein Benutzer angelegt ist — sonst wäre die Anmeldung eine Sackgasse. */
  async hasUser(): Promise<boolean> {
    return (await this.prisma.user.count()) > 0;
  }

  private assertNotRateLimited(origin: string): void {
    const window = this.attempts.get(origin);
    if (window === undefined) return;

    if (Date.now() - window.firstAt > this.config.loginWindowMs) {
      this.attempts.delete(origin);
      return;
    }

    if (window.count >= this.config.maxLoginAttempts) {
      const minutes = Math.ceil(this.config.loginWindowMs / 60_000);
      throw ApiError.tooManyAttempts(
        `Zu viele Anmeldeversuche. Bitte in einigen Minuten erneut versuchen (Fenster: ${minutes} Minuten).`,
      );
    }
  }

  private recordFailure(origin: string): void {
    const window = this.attempts.get(origin);

    if (window === undefined || Date.now() - window.firstAt > this.config.loginWindowMs) {
      this.attempts.set(origin, { count: 1, firstAt: Date.now() });
      return;
    }
    window.count += 1;
  }
}

function toAuthUser(user: { id: number; email: string; displayName: string | null }): AuthUser {
  return { id: user.id, email: user.email, displayName: user.displayName };
}

export function hashToken(token: string): string {
  return crypto.createHash('sha256').update(token).digest('hex');
}
