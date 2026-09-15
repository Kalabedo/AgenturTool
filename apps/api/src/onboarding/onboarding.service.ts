import { Injectable } from '@nestjs/common';
import {
  ONBOARDING_STATUS,
  ONBOARDING_STATUS_VALUES,
  missingCompanyFieldsForEinvoice,
  missingCompanyFieldsForInvoicing,
  onboardingSteps,
  type OnboardingStateResponse,
  type OnboardingStatus,
} from '@privatura/shared';
import { PrismaService } from '../common/prisma.service';
import { CompanyService } from '../company/company.service';

/**
 * Der Schlüssel in `AppSetting`.
 *
 * Mit Punkt geschrieben wie `invoice.numberPattern`: Der Bereich vorn, die
 * Sache hinten — so bleibt die Tabelle lesbar, wenn dort einmal ein Dutzend
 * Zeilen stehen.
 */
export const ONBOARDING_STATUS_SETTING_KEY = 'onboarding.status';

@Injectable()
export class OnboardingService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly company: CompanyService,
  ) {}

  /**
   * Der vollständige Zustand der Einrichtung.
   *
   * Bis auf die Haltung des Benutzers wird alles aus den Stammdaten
   * abgeleitet. Das hat den angenehmen Nebeneffekt, dass eine aus einem
   * Backup wiederhergestellte Datenbank sofort den richtigen Fortschritt
   * zeigt, ohne dass dafür etwas mitgesichert werden müsste.
   */
  async state(): Promise<OnboardingStateResponse> {
    const company = await this.company.get();

    return {
      status: await this.status(),
      fresh: await this.isFreshInstallation(),
      steps: onboardingSteps(company),
      missingForInvoice: missingCompanyFieldsForInvoicing(company),
      missingForEinvoice: missingCompanyFieldsForEinvoice(company),
    };
  }

  async setStatus(status: OnboardingStatus): Promise<OnboardingStateResponse> {
    await this.prisma.appSetting.upsert({
      where: { key: ONBOARDING_STATUS_SETTING_KEY },
      update: { value: status },
      create: { key: ONBOARDING_STATUS_SETTING_KEY, value: status },
    });
    return this.state();
  }

  /**
   * Die gespeicherte Haltung, mit OPEN als Vorbelegung.
   *
   * Ein von Hand verbogener Wert fällt auf OPEN zurück, statt einen
   * Zustand zu erzeugen, den die Oberfläche nicht kennt — dieselbe Haltung
   * wie beim Nummernmuster: lieber die Vorgabe als ein Fehler an einer
   * Stelle, die mit der eigentlichen Arbeit nichts zu tun hat.
   */
  private async status(): Promise<OnboardingStatus> {
    const setting = await this.prisma.appSetting.findUnique({
      where: { key: ONBOARDING_STATUS_SETTING_KEY },
    });
    if (setting === null) return ONBOARDING_STATUS.OPEN;

    return (ONBOARDING_STATUS_VALUES as readonly string[]).includes(setting.value)
      ? (setting.value as OnboardingStatus)
      : ONBOARDING_STATUS.OPEN;
  }

  /**
   * Ob die Datenbank noch unberührt ist.
   *
   * Gezählt wird, was der Benutzer selbst anlegt — Kunden, Rechnungen,
   * Zeiteinträge. Firmendaten, Steuerprofile und Mail-Vorlagen bleiben
   * außen vor: Die legt der Seed bei jeder Installation an, sie wären also
   * in jeder Datenbank vorhanden und taugen nicht zur Unterscheidung.
   *
   * `findFirst` statt `count`, weil die Frage nur lautet „gibt es
   * überhaupt etwas" — bei einer gewachsenen Datenbank spart das drei
   * vollständige Zählungen.
   */
  private async isFreshInstallation(): Promise<boolean> {
    const [customer, invoice, timeEntry] = await Promise.all([
      this.prisma.customer.findFirst({ select: { id: true } }),
      this.prisma.invoice.findFirst({ select: { id: true } }),
      this.prisma.timeEntry.findFirst({ select: { id: true } }),
    ]);

    return customer === null && invoice === null && timeEntry === null;
  }
}
