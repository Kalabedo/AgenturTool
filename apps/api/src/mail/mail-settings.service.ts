import path from 'node:path';
import { Inject, Injectable, Optional } from '@nestjs/common';
import {
  MAIL_SECURITY,
  MAIL_TRANSPORT,
  type MailSecurity,
  type MailSettingsPayload,
  type MailSettingsResponse,
  type MailTransport,
} from '@privatura/shared';
import type { MailSettings } from '@prisma/client';
import { StorageConfig } from '../common/config.service';
import { PrismaService } from '../common/prisma.service';
import { FileKeySecretStore, SECRET_STORE_HOST, type SecretStore } from './secret-store';

/** Die Einrichtung, wie der Versand sie braucht — mit entschlüsseltem Passwort. */
export interface ResolvedMailSettings {
  transport: MailTransport;
  fromName: string | null;
  fromAddress: string;
  replyTo: string | null;
  bccSelf: boolean;
  host: string;
  port: number;
  security: MailSecurity;
  username: string | null;
  password: string | null;
}

const SINGLETON = { id: 1 } as const;

/**
 * Einrichtung des Versandwegs.
 *
 * Zwei Dinge macht dieser Dienst, die über das Lesen und Schreiben einer
 * Zeile hinausgehen:
 *
 * 1. **Das Passwort geht nie hinaus.** Die Antwort trägt zwei Wahrheitswerte
 *    statt des Werts: ob eines hinterlegt ist und ob es sich hier lesen
 *    lässt. Alles andere wäre ein Passwort, das durch einen Browser läuft,
 *    damit es jemand ansehen kann, der es schon kennt.
 * 2. **Er beantwortet „kann losgehen?" an einer Stelle.** `problems` ist
 *    dieselbe Liste für die Einstellungsmaske und für den Versanddialog.
 *    Zwei Auslegungen desselben Zustands führten dazu, dass die eine Maske
 *    grün zeigt und die andere den Knopf sperrt.
 */
@Injectable()
export class MailSettingsService {
  private readonly store: SecretStore;

  constructor(
    private readonly prisma: PrismaService,
    storage: StorageConfig,
    @Optional() @Inject(SECRET_STORE_HOST) hostStore: SecretStore | null = null,
  ) {
    this.store = hostStore ?? new FileKeySecretStore(path.join(storage.dataDir, 'mail.key'));
  }

  /** Die gespeicherte Zeile; legt den Singleton beim ersten Zugriff an. */
  async row(): Promise<MailSettings> {
    return this.prisma.mailSettings.upsert({
      where: SINGLETON,
      update: {},
      create: SINGLETON,
    });
  }

  async get(): Promise<MailSettingsResponse> {
    return this.toResponse(await this.row());
  }

  async update(payload: MailSettingsPayload): Promise<MailSettingsResponse> {
    const existing = await this.row();

    const updated = await this.prisma.mailSettings.update({
      where: SINGLETON,
      data: {
        transport: payload.transport,
        fromName: payload.fromName,
        fromAddress: payload.fromAddress,
        replyTo: payload.replyTo,
        bccSelf: payload.bccSelf,
        host: payload.host,
        port: payload.port,
        security: payload.security,
        username: payload.username,
        passwordSecret: this.nextSecret(existing.passwordSecret, payload.password),
      },
    });

    return this.toResponse(updated);
  }

  /**
   * Was mit dem gespeicherten Passwort geschieht.
   *
   * Drei Fälle, und der mittlere ist der, den ein schlichtes
   * `data.password = payload.password` verschlucken würde: Wer die
   * Einstellungen nur wegen des Absendernamens öffnet und speichert, soll
   * sein Passwort behalten.
   */
  private nextSecret(current: string | null, password: string | undefined): string | null {
    if (password === undefined) return current;
    if (password === '') return null;
    return `${this.store.id}:${this.store.encrypt(password)}`;
  }

  /** Das Passwort im Klartext, sofern es auf diesem Rechner lesbar ist. */
  private readPassword(secret: string | null): string | null {
    if (secret === null) return null;

    const separator = secret.indexOf(':');
    if (separator === -1) return null;

    const id = secret.slice(0, separator);
    if (id !== this.store.id) return null;

    return this.store.decrypt(secret.slice(separator + 1));
  }

  /**
   * Was dem Versand noch fehlt.
   *
   * Ein nicht lesbares Passwort steht bewusst in derselben Liste wie ein
   * fehlender Servername: Für den Benutzer ist beides dieselbe Lage — es
   * geht so nicht los, und es gibt genau ein Feld, das es behebt.
   */
  problems(row: MailSettings): string[] {
    const problems: string[] = [];

    if (row.transport === MAIL_TRANSPORT.NONE) {
      return ['Es ist noch kein Versandweg eingerichtet.'];
    }

    if (row.fromAddress === null || row.fromAddress.trim() === '') {
      problems.push('Es fehlt die eigene Absenderadresse.');
    }

    if (row.transport === MAIL_TRANSPORT.SMTP) {
      if (row.host === null || row.host.trim() === '') {
        problems.push('Es fehlt der Servername des Postausgangs.');
      }
      if (row.port === null) {
        problems.push('Es fehlt der Port des Postausgangs.');
      }
      if (row.username !== null && row.username.trim() !== '' && row.passwordSecret === null) {
        problems.push('Zum Benutzernamen fehlt das Passwort.');
      }
      if (row.passwordSecret !== null && this.readPassword(row.passwordSecret) === null) {
        problems.push(
          'Das gespeicherte Passwort lässt sich auf diesem Rechner nicht lesen — ' +
            'bitte einmal neu eingeben.',
        );
      }
    }

    return problems;
  }

  /**
   * Die Einrichtung für den Versand.
   *
   * Wirft nicht, sondern liefert `null`, wenn etwas fehlt: Wer versenden
   * will, hat die Liste aus `problems` schon und soll sie anzeigen, statt
   * eine Ausnahme zu übersetzen.
   */
  async resolve(): Promise<ResolvedMailSettings | null> {
    const row = await this.row();
    if (this.problems(row).length > 0) return null;

    return {
      transport: row.transport as MailTransport,
      fromName: row.fromName,
      fromAddress: row.fromAddress ?? '',
      replyTo: row.replyTo,
      bccSelf: row.bccSelf,
      host: row.host ?? '',
      port: row.port ?? 0,
      security: row.security as MailSecurity,
      username: row.username,
      password: this.readPassword(row.passwordSecret),
    };
  }

  /**
   * Die Einrichtung, wie sie in den Feldern der Maske steht — auch wenn sie
   * unvollständig ist. Für „Verbindung prüfen": Die Prüfung ist gerade dann
   * interessant, wenn noch nicht alles stimmt.
   */
  async resolveDraft(): Promise<ResolvedMailSettings> {
    const row = await this.row();

    return {
      transport: row.transport as MailTransport,
      fromName: row.fromName,
      fromAddress: row.fromAddress ?? '',
      replyTo: row.replyTo,
      bccSelf: row.bccSelf,
      host: row.host ?? '',
      port: row.port ?? DEFAULT_PORTS[row.security as MailSecurity],
      security: row.security as MailSecurity,
      username: row.username,
      password: this.readPassword(row.passwordSecret),
    };
  }

  toResponse(row: MailSettings): MailSettingsResponse {
    const problems = this.problems(row);

    return {
      transport: row.transport as MailTransport,
      fromName: row.fromName,
      fromAddress: row.fromAddress,
      replyTo: row.replyTo,
      bccSelf: row.bccSelf,
      host: row.host,
      port: row.port,
      security: row.security as MailSecurity,
      username: row.username,
      hasPassword: row.passwordSecret !== null,
      passwordReadable:
        row.passwordSecret === null || this.readPassword(row.passwordSecret) !== null,
      ready: problems.length === 0,
      problems,
      updatedAt: row.updatedAt.toISOString(),
    };
  }
}

const DEFAULT_PORTS: Record<MailSecurity, number> = {
  [MAIL_SECURITY.STARTTLS]: 587,
  [MAIL_SECURITY.TLS]: 465,
  [MAIL_SECURITY.NONE]: 25,
};
