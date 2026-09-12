import { Injectable, Logger } from '@nestjs/common';
import nodemailer, { type Transporter } from 'nodemailer';
import { MAIL_SECURITY } from '@agentur-tool/shared';
import { ApiError } from '../common/api-error';
import type { PreparedAttachment } from './mail-composer.service';
import type { ResolvedMailSettings } from './mail-settings.service';

/** Eine fertige Nachricht, kurz bevor sie das Haus verlässt. */
export interface OutgoingMail {
  to: string[];
  cc: string[];
  bcc: string[];
  subject: string;
  body: string;
  attachments: PreparedAttachment[];
}

/**
 * Zeitgrenzen der SMTP-Verbindung.
 *
 * Ohne sie hängt bei einem falsch geschriebenen Servernamen der Dialog so
 * lange, bis das Betriebssystem aufgibt — je nach System Minuten. Ein
 * Versand, der nach zwanzig Sekunden mit einer Meldung endet, ist in jedem
 * Fall die bessere Auskunft.
 */
const TIMEOUTS = {
  connectionTimeout: 15_000,
  greetingTimeout: 10_000,
  socketTimeout: 30_000,
} as const;

/**
 * Der Weg über einen SMTP-Server (D45).
 *
 * Die einzige Stelle der Anwendung, die von sich aus eine Verbindung nach
 * draußen aufbaut — und sie tut es nur, wenn jemand auf „Senden" geklickt
 * hat und in den Einstellungen ein Server steht. Die Zugangsdaten kommen
 * fertig entschlüsselt an; dieser Dienst liest nichts aus der Datenbank.
 *
 * Ausgelagert aus `MailService`, damit dessen Test nicht erst einen
 * Mailserver braucht: Was hier steckt, ist Netzwerk, was dort steckt, ist
 * die Buchführung darüber.
 */
@Injectable()
export class MailSenderService {
  private readonly logger = new Logger(MailSenderService.name);

  /** Prüft Verbindung und Anmeldung, ohne etwas zu verschicken. */
  async verify(settings: ResolvedMailSettings): Promise<void> {
    const transporter = this.transporter(settings);
    try {
      await transporter.verify();
    } catch (error) {
      throw this.toApiError(error);
    } finally {
      transporter.close();
    }
  }

  async send(settings: ResolvedMailSettings, mail: OutgoingMail): Promise<void> {
    const transporter = this.transporter(settings);

    try {
      await transporter.sendMail(this.envelope(settings, mail));
    } catch (error) {
      throw this.toApiError(error);
    } finally {
      transporter.close();
    }
  }

  /**
   * Baut die Nachricht, ohne sie zu verschicken.
   *
   * Für den Weg über die Mail-Anwendung: Heraus kommt eine vollständige
   * MIME-Nachricht mit Empfängern, Betreff, Text und **eingebetteten
   * Anhängen**, die als `.eml` auf die Platte geht. `streamTransport` ist
   * der dafür vorgesehene Weg von nodemailer — dieselbe Zusammensetzung wie
   * beim echten Versand, nur dass am Ende ein Puffer steht statt einer
   * Verbindung. Die Nachricht zweimal zu bauen wäre die Gelegenheit, dass
   * die verschickte anders aussieht als die geöffnete.
   *
   * `X-Unsent: 1` ist die einzige Abweichung, und sie ist der Zweck der
   * Sache: Outlook erkennt daran einen Entwurf und öffnet ihn im
   * Verfassen-Fenster statt im Leseansicht.
   */
  async buildMessageFile(settings: ResolvedMailSettings, mail: OutgoingMail): Promise<Buffer> {
    const transporter = nodemailer.createTransport({
      streamTransport: true,
      buffer: true,
      // Zeilenenden nach RFC 5322. Für eine Datei, die andere Programme
      // lesen, ist das der sichere Weg.
      newline: 'windows',
    });

    try {
      const info = (await transporter.sendMail({
        ...this.envelope(settings, mail),
        headers: { 'X-Unsent': '1' },
      })) as { message: Buffer };

      return info.message;
    } catch (error) {
      throw this.toApiError(error);
    } finally {
      transporter.close();
    }
  }

  /** Empfänger, Betreff, Text und Anhänge — für beide Wege dieselben. */
  private envelope(
    settings: ResolvedMailSettings,
    mail: OutgoingMail,
  ): Parameters<Transporter['sendMail']>[0] {
    return {
      from:
        settings.fromName === null
          ? settings.fromAddress
          : { name: settings.fromName, address: settings.fromAddress },
      replyTo: settings.replyTo ?? undefined,
      to: mail.to,
      cc: mail.cc.length === 0 ? undefined : mail.cc,
      bcc: mail.bcc.length === 0 ? undefined : mail.bcc,
      subject: mail.subject,
      // Nur Text. Eine HTML-Fassung wäre ein zweiter Inhalt, der mit dem
      // ersten übereinstimmen müsste — und an einer Rechnung hängt das
      // Dokument, nicht die Gestaltung der Begleitzeilen.
      text: mail.body,
      attachments: mail.attachments.map((attachment) => ({
        filename: attachment.filename,
        content: attachment.bytes,
        contentType: attachment.contentType,
      })),
    };
  }

  private transporter(settings: ResolvedMailSettings): Transporter {
    const authenticated = settings.username !== null && settings.username.trim() !== '';

    return nodemailer.createTransport({
      host: settings.host,
      port: settings.port,
      // `secure` heißt bei nodemailer „ab dem ersten Byte verschlüsselt".
      // STARTTLS ist das Gegenteil davon und wird über `requireTLS`
      // erzwungen — ohne das Erzwingen würde die Verbindung bei einem
      // Server ohne STARTTLS stillschweigend im Klartext weiterlaufen.
      secure: settings.security === MAIL_SECURITY.TLS,
      requireTLS: settings.security === MAIL_SECURITY.STARTTLS,
      auth: authenticated
        ? { user: settings.username ?? '', pass: settings.password ?? '' }
        : undefined,
      ...TIMEOUTS,
    });
  }

  /**
   * Übersetzt die Meldung des Mailservers in eine, die weiterhilft.
   *
   * Die häufigen Fälle bekommen einen Satz, der sagt, welches Feld gemeint
   * ist. Alles andere wird durchgereicht — die Antwort eines SMTP-Servers
   * ist in der Regel aussagekräftiger als jede Umschreibung, und sie steht
   * anschließend im Versandprotokoll.
   */
  private toApiError(error: unknown): ApiError {
    const code =
      typeof error === 'object' && error !== null ? String(Reflect.get(error, 'code')) : '';
    const message = error instanceof Error ? error.message : String(error);

    this.logger.warn(`SMTP-Fehler (${code}): ${message}`);

    if (code === 'EAUTH') {
      return ApiError.validation(
        `Der Mailserver hat Benutzername oder Passwort abgelehnt: ${message}`,
      );
    }
    if (code === 'ECONNECTION' || code === 'ESOCKET' || code === 'EDNS') {
      return ApiError.validation(
        `Der Mailserver ist nicht erreichbar. Bitte Servername, Port und Verschlüsselung prüfen: ${message}`,
      );
    }
    if (code === 'ETIMEDOUT') {
      return ApiError.validation(
        'Der Mailserver hat nicht geantwortet. Bitte Servername und Port prüfen — ' +
          'bei Port 465 gehört die Einstellung „TLS ab Verbindungsaufbau" dazu.',
      );
    }
    if (code === 'EENVELOPE') {
      return ApiError.validation(`Der Mailserver hat eine Adresse abgelehnt: ${message}`);
    }

    return ApiError.validation(`Der Versand ist fehlgeschlagen: ${message}`);
  }
}
