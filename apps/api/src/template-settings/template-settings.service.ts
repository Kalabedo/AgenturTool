import { Injectable } from '@nestjs/common';
import type { TemplateSettings } from '@prisma/client';
import type { TemplateSettingsResponse, UpdateTemplateSettingsPayload } from '@agentur-tool/shared';
import { PrismaService } from '../common/prisma.service';

/** Wie die Firmendaten ein Singleton mit fester id (per CHECK erzwungen). */
const TEMPLATE_SETTINGS_ID = 1;

@Injectable()
export class TemplateSettingsService {
  constructor(private readonly prisma: PrismaService) {}

  /**
   * Liefert die Einstellungen und legt sie beim ersten Aufruf an.
   *
   * Der Seed tut das ebenfalls. Sich darauf zu verlassen wäre trotzdem
   * falsch: Ohne diese Zeile bliebe die Vorschau bei einer aus einem Backup
   * wiederhergestellten Datenbank leer, und die Ursache läge weit weg vom
   * Symptom.
   */
  async get(): Promise<TemplateSettingsResponse> {
    const settings = await this.prisma.templateSettings.upsert({
      where: { id: TEMPLATE_SETTINGS_ID },
      update: {},
      create: { id: TEMPLATE_SETTINGS_ID },
    });
    return this.toResponse(settings);
  }

  async update(payload: UpdateTemplateSettingsPayload): Promise<TemplateSettingsResponse> {
    const settings = await this.prisma.templateSettings.upsert({
      where: { id: TEMPLATE_SETTINGS_ID },
      update: payload,
      create: { id: TEMPLATE_SETTINGS_ID, ...payload },
    });
    return this.toResponse(settings);
  }

  private toResponse(settings: TemplateSettings): TemplateSettingsResponse {
    return {
      id: settings.id,
      templateKey: settings.templateKey,
      accentColor: settings.accentColor,
      fontFamily: settings.fontFamily,
      logoWidthMm: settings.logoWidthMm,
      footerText: settings.footerText,
      paymentNote: settings.paymentNote,
      closingNote: settings.closingNote,
      updatedAt: settings.updatedAt.toISOString(),
    };
  }
}
