import { Injectable } from '@nestjs/common';
import type { TemplateSettings } from '@prisma/client';
import {
  TEMPLATE_DENSITY_VALUES,
  TEMPLATE_FONT_FAMILY_VALUES,
  TEMPLATE_KEY_VALUES,
} from '@privatura/shared';
import type { TemplateSettingsResponse, UpdateTemplateSettingsPayload } from '@privatura/shared';
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

  /**
   * Ein gespeicherter Wert, sofern er noch zur Auswahl gehört.
   *
   * In der Datenbank steht Text; die Auswahl kann sich mit einer neuen
   * Fassung ändern. Ein Design oder eine Schrift, die es nicht mehr gibt,
   * fällt hier auf die Vorgabe zurück, statt eine Antwort zu erzeugen, die
   * ihrem eigenen Schema widerspricht — dieselbe Haltung wie bei
   * `resolveTemplate`: lieber ein anderes Aussehen als gar keines.
   */
  private oneOf<T extends string>(value: string, allowed: readonly T[], fallback: T): T {
    return allowed.includes(value as T) ? (value as T) : fallback;
  }

  private toResponse(settings: TemplateSettings): TemplateSettingsResponse {
    return {
      id: settings.id,
      templateKey: this.oneOf(settings.templateKey, TEMPLATE_KEY_VALUES, 'classic'),
      accentColor: settings.accentColor,
      fontFamily: this.oneOf(settings.fontFamily, TEMPLATE_FONT_FAMILY_VALUES, 'Open Sans'),
      logoWidthMm: settings.logoWidthMm,
      footerText: settings.footerText,
      paymentNote: settings.paymentNote,
      closingNote: settings.closingNote,
      inkColor: settings.inkColor,
      inkSoftColor: settings.inkSoftColor,
      ruleColor: settings.ruleColor,
      bandColor: settings.bandColor,
      density: this.oneOf(settings.density, TEMPLATE_DENSITY_VALUES, 'normal'),
      showLogo: settings.showLogo,
      showPaymentBlock: settings.showPaymentBlock,
      showFooterRule: settings.showFooterRule,
      updatedAt: settings.updatedAt.toISOString(),
    };
  }
}
