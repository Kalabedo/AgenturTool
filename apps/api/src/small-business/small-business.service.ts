import { Injectable } from '@nestjs/common';
import {
  DEFAULT_SMALL_BUSINESS_LIMITS,
  SMALL_BUSINESS_LIMITS_SETTING_KEY,
  TAX_PROFILE_KIND,
  calculateInvoice,
  limitBreachByInvoice,
  smallBusinessLimitsSchema,
  toSmallBusinessYear,
  type DiscountType,
  type SmallBusinessInvoiceWarning,
  type SmallBusinessLimits,
  type SmallBusinessStatus,
} from '@privatura/shared';
import { ApiError } from '../common/api-error';
import { PrismaService } from '../common/prisma.service';

/**
 * Die Kleinunternehmergrenze im Blick behalten (§ 19 UStG).
 *
 * Gezählt wird nach dem **Rechnungsdatum**, also nach vereinbarten Entgelten
 * (Soll-Versteuerung) — dieselbe Grundlage wie beim Steuerberater-Export
 * (Abschnitt 26). Wer nach vereinnahmten Entgelten versteuert (§ 20 UStG),
 * bekommt damit einen leichten Vorlauf; die Oberfläche benennt die Grundlage
 * deshalb ausdrücklich, statt eine Genauigkeit zu behaupten, die sie nicht
 * hat. Die Unterscheidung ist ein eigener offener Punkt.
 *
 * Gezählt wird der **Netto**betrag. Bei einem Kleinunternehmer ist er
 * ohnehin gleich dem Bruttobetrag — es wird ja keine Steuer ausgewiesen —,
 * aber die Regelung spricht vom Umsatz, und netto ist die Zahl, die das
 * bleibt, falls das Profil später wechselt.
 */
@Injectable()
export class SmallBusinessService {
  constructor(private readonly prisma: PrismaService) {}

  /**
   * Die konfigurierten Grenzwerte.
   *
   * Wie beim Nummernmuster: Ein unbrauchbar gewordener Eintrag fällt auf die
   * gesetzlichen Werte zurück, statt die Auswertung unmöglich zu machen.
   */
  async limits(): Promise<SmallBusinessLimits> {
    const setting = await this.prisma.appSetting.findUnique({
      where: { key: SMALL_BUSINESS_LIMITS_SETTING_KEY },
    });
    if (setting === null) return DEFAULT_SMALL_BUSINESS_LIMITS;

    try {
      const parsed = smallBusinessLimitsSchema.safeParse(JSON.parse(setting.value));
      return parsed.success ? parsed.data : DEFAULT_SMALL_BUSINESS_LIMITS;
    } catch {
      return DEFAULT_SMALL_BUSINESS_LIMITS;
    }
  }

  async status(today = new Date()): Promise<SmallBusinessStatus> {
    const limits = await this.limits();
    const year = today.getUTCFullYear();

    const [applicable, current, previous] = await Promise.all([
      this.hasSmallBusinessProfile(),
      this.revenueOf(year),
      this.revenueOf(year - 1),
    ]);

    return {
      applicable,
      limits,
      current: toSmallBusinessYear(year, current, limits.currentYearCents, limits.warnAtPercent),
      previous: toSmallBusinessYear(
        year - 1,
        previous,
        limits.previousYearCents,
        limits.warnAtPercent,
      ),
    };
  }

  /**
   * Was das Ausstellen dieses Entwurfs an der Lage änderte.
   *
   * Gefragt wird **vor** dem Ausstellen, denn danach ist es zu spät: Die
   * Nummer ist gezogen, das Dokument eingefroren, und aus einer Rechnung
   * ohne ausgewiesene Steuer wird keine mit.
   *
   * Der Entwurf trägt seine Summen noch nicht in den Spalten — die entstehen
   * erst beim Finalisieren. Deshalb wird hier aus den Positionen gerechnet,
   * mit derselben Funktion, die auch das Dokument berechnet.
   */
  async warningFor(invoiceId: number): Promise<SmallBusinessInvoiceWarning> {
    const invoice = await this.prisma.invoice.findUnique({
      where: { id: invoiceId },
      include: { items: { orderBy: { position: 'asc' } }, taxProfile: true },
    });
    if (invoice === null) throw ApiError.notFound(`Rechnung ${invoiceId} existiert nicht.`);

    const limits = await this.limits();
    const applicable = invoice.taxProfile?.kind === TAX_PROFILE_KIND.SMALL_BUSINESS;
    const year = Number(invoice.invoiceDate.slice(0, 4));
    const revenueBeforeCents = applicable ? await this.revenueOf(year) : 0;

    const totals = calculateInvoice(
      invoice.items.map((item) => ({
        quantity: item.quantity,
        unitPriceCents: item.unitPriceCents,
        discountType: item.discountType as DiscountType,
        discountValue: item.discountValue,
        taxRateBasisPoints: item.taxRateBasisPoints,
      })),
    );

    const breach = applicable
      ? limitBreachByInvoice({
          revenueCents: revenueBeforeCents,
          invoiceNetCents: totals.netCents,
          limitCents: limits.currentYearCents,
        })
      : null;

    return {
      applicable,
      breaches: breach !== null,
      revenueBeforeCents,
      revenueAfterCents: breach?.revenueAfterCents ?? revenueBeforeCents + totals.netCents,
      limitCents: limits.currentYearCents,
      exceedsByCents: breach?.exceedsByCents ?? 0,
    };
  }

  /**
   * Der Umsatz eines Jahres aus den ausgestellten Kleinunternehmer-Rechnungen.
   *
   * Entwürfe zählen nicht (`number: not null`), Stornos zählen negativ und
   * heben die aufgehobene Rechnung damit von selbst auf. Gefiltert wird über
   * die eingefrorene Steuerart in der Spalte `taxProfileKind`, nicht über das
   * heutige Profil des Kunden: Ein später umbenanntes oder archiviertes
   * Profil darf die Historie nicht verändern.
   */
  private async revenueOf(year: number): Promise<number> {
    const result = await this.prisma.invoice.aggregate({
      _sum: { totalNetCents: true },
      where: {
        number: { not: null },
        taxProfileKind: TAX_PROFILE_KIND.SMALL_BUSINESS,
        // Kalenderdaten liegen als ISO-Strings, deshalb Präfixvergleich.
        invoiceDate: { startsWith: String(year) },
      },
    });
    return result._sum.totalNetCents ?? 0;
  }

  /**
   * Gibt es überhaupt ein Kleinunternehmerprofil?
   *
   * Der Seed liefert es bewusst nicht mit; es entsteht erst, wenn jemand es
   * in der Einrichtung anklickt. Wer die Regelung nicht nutzt, soll von ihr
   * auch nichts lesen.
   */
  private async hasSmallBusinessProfile(): Promise<boolean> {
    const count = await this.prisma.taxProfile.count({
      where: { kind: TAX_PROFILE_KIND.SMALL_BUSINESS },
    });
    return count > 0;
  }
}
