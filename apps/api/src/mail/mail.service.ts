import fsp from 'node:fs/promises';
import path from 'node:path';
import { Inject, Injectable, Logger, Optional } from '@nestjs/common';
import {
  INVOICE_EVENT_TYPE,
  INVOICE_STATUS,
  MAIL_ATTACHMENT_LABELS,
  MAIL_HANDOFF_METHOD,
  MAIL_STATUS,
  MAIL_TRANSPORT,
  type MailAttachmentKind,
  type MailConnectionCheckResponse,
  type MailHandoffResult,
  type MailLoggedAttachment,
  type MailMessageListQuery,
  type MailMessageResponse,
  type MailSendPayload,
  type MailSource,
  type MailStatus,
  type MailTransport,
} from '@agentur-tool/shared';
import type { MailMessage } from '@prisma/client';
import { ApiError } from '../common/api-error';
import { StorageConfig } from '../common/config.service';
import { PrismaService } from '../common/prisma.service';
import { MailComposerService, type PreparedAttachment } from './mail-composer.service';
import { MAIL_HANDOFF_HOST, type MailHandoff } from './mail-handoff';
import { MailSenderService, type OutgoingMail } from './mail-sender.service';
import { MailSettingsService, type ResolvedMailSettings } from './mail-settings.service';

/** Ergebnis eines Versands, wie ihn der Controller weitergibt. */
export interface MailSendResult {
  message: MailMessageResponse;
  handoff: MailHandoffResult | null;
  markedSentAt: string | null;
}

/** Wie lange die Nachrichten für die Mail-Anwendung liegen bleiben. */
const HANDOFF_RETENTION_DAYS = 7;

/**
 * Der Versand und die Buchführung darüber (Abschnitt 27).
 *
 * Die Reihenfolge ist der ganze Punkt dieser Klasse:
 *
 * 1. Anhänge erzeugen — was hier scheitert, ist nicht verschickt worden.
 * 2. Verschicken beziehungsweise übergeben.
 * 3. Protokollieren, **auch wenn es fehlschlug**. Ein fehlgeschlagener
 *    Versand, von dem nichts übrig bleibt, ist der Fall, in dem man später
 *    nicht mehr weiß, ob die Rechnung nun draußen ist.
 * 4. Erst danach den Versandvermerk setzen — und nur auf dem Weg, der ihn
 *    verdient hat. Über die Mail-Anwendung weiß die Anwendung nicht, ob die
 *    Nachricht abging; dort bleibt `sentAt` leer, und die Oberfläche bietet
 *    den Vermerk als eigenen Klick an.
 */
@Injectable()
export class MailService {
  private readonly logger = new Logger(MailService.name);

  constructor(
    private readonly prisma: PrismaService,
    private readonly settings: MailSettingsService,
    private readonly composer: MailComposerService,
    private readonly sender: MailSenderService,
    private readonly storage: StorageConfig,
    @Optional() @Inject(MAIL_HANDOFF_HOST) private readonly handoff: MailHandoff | null = null,
  ) {}

  /** Prüft die eingerichtete SMTP-Verbindung, ohne etwas zu verschicken. */
  async checkConnection(): Promise<MailConnectionCheckResponse> {
    const row = await this.settings.row();

    if (row.transport !== MAIL_TRANSPORT.SMTP) {
      return {
        ok: false,
        message: 'Es gibt nichts zu prüfen: Der Versand läuft nicht über einen SMTP-Server.',
      };
    }

    const draft = await this.settings.resolveDraft();
    if (draft.host.trim() === '') {
      return { ok: false, message: 'Es fehlt der Servername des Postausgangs.' };
    }

    try {
      await this.sender.verify(draft);
      return {
        ok: true,
        message: `Verbindung zu ${draft.host} steht, die Anmeldung wird angenommen.`,
      };
    } catch (error) {
      return { ok: false, message: error instanceof Error ? error.message : String(error) };
    }
  }

  async send(payload: MailSendPayload): Promise<MailSendResult> {
    const resolved = await this.settings.resolve();
    if (resolved === null) {
      const row = await this.settings.row();
      throw ApiError.validation(
        `So lässt sich nichts verschicken. ${this.settings.problems(row).join(' ')}`,
        this.settings.problems(row).map((message) => ({ field: 'transport', message })),
      );
    }

    const invoiceId = payload.source.kind === 'INVOICE' ? payload.source.invoiceId : null;
    const attachments = await this.composer.prepare(payload.source, payload.attachments);

    // Die Blindkopie an sich selbst wird hier ergänzt und nicht bloß im
    // Entwurf: Wer den Dialog umgeht, soll denselben Beleg im Postfach
    // haben. Doppelt schadet nicht — `Set` sorgt dafür, dass sie nur einmal
    // dasteht.
    const bcc = [
      ...new Set(resolved.bccSelf ? [...payload.bcc, resolved.fromAddress] : payload.bcc),
    ];
    const mail = {
      to: payload.to,
      cc: payload.cc,
      bcc,
      subject: payload.subject,
      body: payload.body,
      attachments,
    };

    if (resolved.transport === MAIL_TRANSPORT.SMTP) {
      return this.sendViaSmtp(resolved, mail, invoiceId);
    }
    return this.prepareInMailApp(payload, mail, invoiceId);
  }

  private async sendViaSmtp(
    resolved: ResolvedMailSettings,
    mail: OutgoingMail,
    invoiceId: number | null,
  ): Promise<MailSendResult> {
    const transport = MAIL_TRANSPORT.SMTP;

    try {
      await this.sender.send(resolved, mail);
    } catch (error) {
      // Erst protokollieren, dann weiterwerfen: Der Versuch gehört in den
      // Verlauf, gerade weil er gescheitert ist.
      await this.log({
        invoiceId,
        transport,
        status: MAIL_STATUS.FAILED,
        mail,
        error: error instanceof Error ? error.message : String(error),
      });
      throw error;
    }

    const message = await this.log({
      invoiceId,
      transport,
      status: MAIL_STATUS.SENT,
      mail,
      error: null,
    });

    const markedSentAt = await this.markSent(invoiceId, message);
    return { message, handoff: null, markedSentAt };
  }

  /**
   * Der Weg über die Mail-Anwendung.
   *
   * Zuerst der echte Entwurf: Lässt sich das Mailprogramm fernsteuern,
   * steht die Nachricht dort fertig im Verfassen-Fenster. Sonst entsteht
   * die `.eml`-Datei und wird geöffnet. Beide Wege tragen die Anhänge in
   * sich — der Benutzer sucht nichts zusammen.
   *
   * Die Anhänge landen in jedem Fall zuerst auf der Platte: Ein
   * fernsteuerbares Mailprogramm bekommt Dateipfade gereicht, keine Bytes.
   *
   * Der Versandvermerk bleibt auf beiden Wegen aus: Ob die Nachricht
   * abgeschickt wurde, entscheidet sich in einem fremden Programm (D45).
   */
  private async prepareInMailApp(
    payload: MailSendPayload,
    mail: OutgoingMail,
    invoiceId: number | null,
  ): Promise<MailSendResult> {
    if (this.handoff === null) {
      throw ApiError.validation(
        'Die Mail-Anwendung dieses Rechners lässt sich nur aus der Desktop-Anwendung heraus ' +
          'öffnen. Im Browserbetrieb bleibt der Weg über einen SMTP-Server.',
      );
    }

    const resolved = await this.settings.resolve();
    if (resolved === null) throw ApiError.validation('Der Versandweg ist nicht mehr eingerichtet.');

    const folder = await this.prepareOutbox(payload);
    const attachmentPaths = await this.writeAttachments(folder, mail.attachments);
    const application = this.handoff.applicationName();

    const openedDraft = await this.handoff.openDraft({
      to: mail.to,
      cc: mail.cc,
      bcc: mail.bcc,
      subject: mail.subject,
      body: mail.body,
      attachmentPaths,
    });

    let handoff: MailHandoffResult;
    if (openedDraft) {
      handoff = { method: MAIL_HANDOFF_METHOD.DRAFT, application, path: null };
    } else {
      const file = path.join(folder, 'Nachricht.eml');
      await fsp.writeFile(file, await this.sender.buildMessageFile(resolved, mail));
      await this.handoff.openMessage(file);
      handoff = { method: MAIL_HANDOFF_METHOD.MESSAGE_FILE, application, path: file };
    }

    const message = await this.log({
      invoiceId,
      transport: MAIL_TRANSPORT.MAIL_APP,
      status: MAIL_STATUS.PREPARED,
      mail,
      error: null,
    });

    return { message, handoff, markedSentAt: null };
  }

  /**
   * Der Ordner für diesen einen Vorgang.
   *
   * Unter DATA_DIR, aber außerhalb dessen, was das Backup einpackt: Was hier
   * liegt, sind Kopien von Dokumenten, die längst abgelegt und gesichert
   * sind. Ältere Ordner räumt der nächste Versand weg — sonst wüchse hier
   * eine Sammlung, die niemand je wieder ansieht.
   */
  private async prepareOutbox(payload: MailSendPayload): Promise<string> {
    await fsp.mkdir(this.storage.mailOutboxDir, { recursive: true });
    await this.cleanUpHandoffFolders();

    const stamp = new Date().toISOString().replace(/[:.]/gu, '-').slice(0, 19);
    const label = payload.subject.replace(/[^\p{L}\p{N}-]+/gu, '-').slice(0, 60);
    const folder = path.join(this.storage.mailOutboxDir, `${stamp}-${label}`);

    await fsp.mkdir(folder, { recursive: true });
    return folder;
  }

  private async writeAttachments(
    folder: string,
    attachments: readonly PreparedAttachment[],
  ): Promise<string[]> {
    const written: string[] = [];

    for (const attachment of attachments) {
      const file = path.join(folder, attachment.filename);
      await fsp.writeFile(file, attachment.bytes);
      written.push(file);
    }
    return written;
  }

  private async cleanUpHandoffFolders(): Promise<void> {
    const cutoff = Date.now() - HANDOFF_RETENTION_DAYS * 86_400_000;

    try {
      const entries = await fsp.readdir(this.storage.mailOutboxDir, { withFileTypes: true });
      for (const entry of entries) {
        const target = path.join(this.storage.mailOutboxDir, entry.name);
        const stats = await fsp.stat(target);
        if (stats.mtimeMs < cutoff) await fsp.rm(target, { recursive: true, force: true });
      }
    } catch (error) {
      // Aufräumen ist Nebensache. Ein Versand darf nicht daran scheitern,
      // dass sich eine alte Nachricht nicht löschen ließ.
      this.logger.warn(
        `Alte Nachrichtendateien konnten nicht aufgeräumt werden: ${
          error instanceof Error ? error.message : String(error)
        }`,
      );
    }
  }

  /**
   * Schreibt das Protokoll und — bei einer Rechnung — den Verlaufseintrag.
   *
   * Beides in einer Transaktion: Ein Verlauf, der einen Versand nennt, den
   * das Protokoll nicht kennt, wäre ein Widerspruch in den eigenen Daten.
   */
  private async log(input: {
    invoiceId: number | null;
    transport: MailTransport;
    status: MailStatus;
    mail: OutgoingMail;
    error: string | null;
  }): Promise<MailMessageResponse> {
    const logged: MailLoggedAttachment[] = input.mail.attachments.map((attachment) => ({
      kind: attachment.kind,
      filename: attachment.filename,
      sizeBytes: attachment.bytes.length,
    }));

    return this.prisma.$transaction(async (tx) => {
      const row = await tx.mailMessage.create({
        data: {
          invoiceId: input.invoiceId,
          transport: input.transport,
          status: input.status,
          toAddresses: JSON.stringify(input.mail.to),
          ccAddresses: JSON.stringify(input.mail.cc),
          bccAddresses: JSON.stringify(input.mail.bcc),
          subject: input.mail.subject,
          body: input.mail.body,
          attachments: JSON.stringify(logged),
          error: input.error,
        },
      });

      // Der fehlgeschlagene Versuch steht im Protokoll, aber nicht im
      // Verlauf der Rechnung: Dort steht, was mit dem Dokument geschehen
      // ist, und nichts ist geschehen.
      if (input.invoiceId !== null && input.status !== MAIL_STATUS.FAILED) {
        await tx.invoiceEvent.create({
          data: {
            invoiceId: input.invoiceId,
            type:
              input.status === MAIL_STATUS.SENT
                ? INVOICE_EVENT_TYPE.MAIL_SENT
                : INVOICE_EVENT_TYPE.MAIL_PREPARED,
            metadata: JSON.stringify({
              recipients: input.mail.to,
              attachments: logged.map((attachment) => MAIL_ATTACHMENT_LABELS[attachment.kind]),
              transport: input.transport,
              mailMessageId: row.id,
            }),
          },
        });
      }

      return toMessageResponse(row);
    });
  }

  /**
   * Setzt den Versandvermerk — aber nur, wenn noch keiner steht.
   *
   * Eine zweite Sendung ist der Normalfall bei einer Nachfrage. Sie soll
   * den Zeitpunkt nicht überschreiben, an dem die Rechnung zum ersten Mal
   * das Haus verlassen hat: Von diesem Datum aus zählt das Zahlungsziel.
   */
  private async markSent(
    invoiceId: number | null,
    message: MailMessageResponse,
  ): Promise<string | null> {
    if (invoiceId === null) return null;

    const invoice = await this.prisma.invoice.findUnique({
      where: { id: invoiceId },
      select: { sentAt: true, status: true },
    });
    if (invoice === null || invoice.status === INVOICE_STATUS.DRAFT) return null;
    if (invoice.sentAt !== null) return invoice.sentAt.toISOString();

    const sentAt = new Date(message.createdAt);
    await this.prisma.invoice.update({ where: { id: invoiceId }, data: { sentAt } });
    return sentAt.toISOString();
  }

  /** Das Versandprotokoll, neueste zuerst. */
  async messages(query: MailMessageListQuery): Promise<MailMessageResponse[]> {
    const rows = await this.prisma.mailMessage.findMany({
      where: query.invoiceId === undefined ? {} : { invoiceId: query.invoiceId },
      orderBy: { createdAt: 'desc' },
      take: query.limit,
    });
    return rows.map((row) => toMessageResponse(row));
  }

  /** Ein Entwurf, wie ihn der Dialog beim Öffnen abfragt. */
  draft(source: MailSource): ReturnType<MailComposerService['draft']> {
    return this.composer.draft(source);
  }
}

function toMessageResponse(row: MailMessage): MailMessageResponse {
  return {
    id: row.id,
    invoiceId: row.invoiceId,
    transport: row.transport as MailTransport,
    status: row.status as MailStatus,
    to: parseList(row.toAddresses),
    cc: parseList(row.ccAddresses),
    bcc: parseList(row.bccAddresses),
    subject: row.subject,
    body: row.body,
    attachments: parseAttachments(row.attachments),
    error: row.error,
    createdAt: row.createdAt.toISOString(),
  };
}

/**
 * Liest eine JSON-Spalte, ohne an ihr zu scheitern.
 *
 * Das Protokoll ist Historie: Eine Zeile, deren Anhangsliste sich nicht
 * lesen lässt, darf nicht die gesamte Ansicht verhindern. Sie erscheint
 * dann ohne Anhänge — sichtbar unvollständig statt gar nicht da.
 */
function parseList(value: string): string[] {
  try {
    const parsed: unknown = JSON.parse(value);
    return Array.isArray(parsed)
      ? parsed.filter((entry): entry is string => typeof entry === 'string')
      : [];
  } catch {
    return [];
  }
}

function parseAttachments(value: string): MailLoggedAttachment[] {
  try {
    const parsed: unknown = JSON.parse(value);
    if (!Array.isArray(parsed)) return [];

    return parsed.flatMap((entry): MailLoggedAttachment[] => {
      if (typeof entry !== 'object' || entry === null) return [];
      const record = entry as Record<string, unknown>;
      if (typeof record.kind !== 'string' || typeof record.filename !== 'string') return [];

      return [
        {
          kind: record.kind as MailAttachmentKind,
          filename: record.filename,
          sizeBytes: typeof record.sizeBytes === 'number' ? record.sizeBytes : 0,
        },
      ];
    });
  } catch {
    return [];
  }
}
