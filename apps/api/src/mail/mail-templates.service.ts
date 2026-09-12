import { Injectable } from '@nestjs/common';
import {
  MAIL_TEMPLATE_DEFAULTS,
  MAIL_TEMPLATE_KEY_VALUES,
  type MailTemplateKey,
  type MailTemplatePayload,
  type MailTemplateResponse,
} from '@agentur-tool/shared';
import type { MailTemplate } from '@prisma/client';
import { ApiError } from '../common/api-error';
import { PrismaService } from '../common/prisma.service';

/**
 * Die drei Textvorlagen.
 *
 * Sie entstehen beim Seed, lassen sich bearbeiten und jederzeit auf den
 * Auslieferungsstand zurücksetzen. Gelöscht oder ergänzt werden sie nicht:
 * Es gibt drei Dinge, die dieses Programm verschickt, und eine vierte
 * Vorlage hätte keinen Anlass.
 *
 * `ensure` legt eine fehlende Vorlage beim ersten Zugriff an. Das ist kein
 * zweiter Seed, sondern der Umgang mit einer Datenbank, die vor dieser
 * Funktion entstanden ist — ein Versand darf nicht daran scheitern, dass
 * niemand `pnpm db:seed` nachgeholt hat.
 */
@Injectable()
export class MailTemplatesService {
  constructor(private readonly prisma: PrismaService) {}

  async list(): Promise<MailTemplateResponse[]> {
    const rows = await Promise.all(
      (MAIL_TEMPLATE_KEY_VALUES as MailTemplateKey[]).map((key) => this.ensure(key)),
    );
    return rows.map((row) => toResponse(row));
  }

  async get(key: MailTemplateKey): Promise<MailTemplateResponse> {
    return toResponse(await this.ensure(key));
  }

  async update(key: MailTemplateKey, payload: MailTemplatePayload): Promise<MailTemplateResponse> {
    await this.ensure(key);

    const updated = await this.prisma.mailTemplate.update({
      where: { key },
      data: { subject: payload.subject, body: payload.body },
    });
    return toResponse(updated);
  }

  async reset(key: MailTemplateKey): Promise<MailTemplateResponse> {
    await this.ensure(key);

    const updated = await this.prisma.mailTemplate.update({
      where: { key },
      data: { ...MAIL_TEMPLATE_DEFAULTS[key] },
    });
    return toResponse(updated);
  }

  /** Die gespeicherte Vorlage; legt sie mit dem Auslieferungstext an, wenn sie fehlt. */
  async ensure(key: MailTemplateKey): Promise<MailTemplate> {
    const defaults = MAIL_TEMPLATE_DEFAULTS[key];
    if (defaults === undefined) {
      throw ApiError.notFound(`Eine Vorlage „${key}" gibt es nicht.`);
    }

    return this.prisma.mailTemplate.upsert({
      where: { key },
      update: {},
      create: { key, ...defaults },
    });
  }
}

function toResponse(row: MailTemplate): MailTemplateResponse {
  const key = row.key as MailTemplateKey;
  const defaults = MAIL_TEMPLATE_DEFAULTS[key];

  return {
    key,
    subject: row.subject,
    body: row.body,
    isDefault: row.subject === defaults.subject && row.body === defaults.body,
    updatedAt: row.updatedAt.toISOString(),
  };
}
