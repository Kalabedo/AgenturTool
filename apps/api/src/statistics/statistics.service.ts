import { Injectable } from '@nestjs/common';
import {
  INVOICE_STATUS,
  monthLabel,
  quarterKeyOf,
  quarterLabel,
  todayIso,
  type CustomerRevenue,
  type HoursSummary,
  type OpenItems,
  type RevenueBucket,
  type StatisticsQuery,
  type StatisticsResponse,
} from '@privatura/shared';
import { PrismaService } from '../common/prisma.service';

/**
 * Die kleine Auswertung — der erste echte Aggregationsendpunkt.
 *
 * Bis hierher kam das Dashboard ohne aus: Es stellt dieselbe
 * Übersichtsabfrage mehrfach mit kleinem `pageSize` und liest `total`. Für
 * Zählungen reicht das; für Summen nicht, und deshalb steht hier eine eigene
 * Abfrage statt einer dritten Variante derselben Liste.
 *
 * Summiert wird über die abgeleiteten Spalten (Abschnitt 30), nicht über die
 * JSON-Snapshots — in einem TEXT-Feld kann SQLite nicht rechnen. Die Spalten
 * stammen aus genau diesen Snapshots, die Zahlen sind also dieselben.
 */
@Injectable()
export class StatisticsService {
  constructor(private readonly prisma: PrismaService) {}

  async summary(query: StatisticsQuery, today = todayIso()): Promise<StatisticsResponse> {
    const [invoices, openItems, hours] = await Promise.all([
      this.issuedInvoices(query),
      this.openItems(today),
      this.hours(),
    ]);

    return {
      period: { from: query.from, to: query.to },
      totalNetCents: sum(invoices, (invoice) => invoice.totalNetCents),
      totalGrossCents: sum(invoices, (invoice) => invoice.totalGrossCents),
      totalCount: invoices.length,
      byMonth: bucket(invoices, (invoice) => invoice.invoiceDate.slice(0, 7), monthLabel),
      byQuarter: bucket(invoices, (invoice) => quarterKeyOf(invoice.invoiceDate), quarterLabel),
      byYear: bucket(
        invoices,
        (invoice) => invoice.invoiceDate.slice(0, 4),
        (key) => key,
      ),
      byCustomer: byCustomer(invoices),
      openItems,
      hours,
    };
  }

  /**
   * Die ausgestellten Belege des Zeitraums.
   *
   * `number: not null` schließt Entwürfe aus — ein Entwurf ist kein Umsatz.
   * Stornos bleiben drin: Sie tragen negative Beträge und heben die
   * aufgehobene Rechnung dadurch von selbst auf.
   *
   * Gelesen wird die ganze Zeile statt in SQL zu gruppieren: Die Einteilung
   * nach Monat, Quartal und Jahr entsteht aus demselben Datum, und drei
   * `groupBy`-Abfragen wären drei Tabellendurchläufe für dieselben Zeilen.
   * Bei einer Solo-Agentur sind das einige hundert Zeilen im Jahr.
   */
  private issuedInvoices(query: StatisticsQuery): Promise<StatisticsInvoice[]> {
    return this.prisma.invoice.findMany({
      where: {
        number: { not: null },
        invoiceDate: { gte: query.from, lte: query.to },
      },
      orderBy: [{ invoiceDate: 'asc' }, { id: 'asc' }],
      select: {
        invoiceDate: true,
        totalNetCents: true,
        totalGrossCents: true,
        customerId: true,
        buyerData: true,
      },
    });
  }

  /**
   * Offene und überfällige Beträge — unabhängig vom gewählten Zeitraum.
   *
   * Was offen ist, ist heute offen. Ein Zeitraumfilter beantwortete die
   * Frage „was stand im März offen", und das will hier niemand wissen.
   */
  private async openItems(today: string): Promise<OpenItems> {
    const [open, overdue] = await Promise.all([
      this.prisma.invoice.aggregate({
        _sum: { totalNetCents: true, totalGrossCents: true },
        _count: true,
        where: { status: INVOICE_STATUS.ISSUED, number: { not: null } },
      }),
      this.prisma.invoice.aggregate({
        _sum: { totalNetCents: true, totalGrossCents: true },
        _count: true,
        // Dieselbe Definition wie in der Rechnungsliste und auf dem
        // Dashboard: ausgestellt, Fälligkeit vorbei, nicht bezahlt.
        where: {
          status: INVOICE_STATUS.ISSUED,
          number: { not: null },
          dueDate: { lt: today },
        },
      }),
    ]);

    return {
      openNetCents: open._sum.totalNetCents ?? 0,
      openGrossCents: open._sum.totalGrossCents ?? 0,
      openCount: open._count,
      overdueNetCents: overdue._sum.totalNetCents ?? 0,
      overdueGrossCents: overdue._sum.totalGrossCents ?? 0,
      overdueCount: overdue._count,
    };
  }

  /**
   * Abgerechnete und offene Stunden.
   *
   * Der Wert der offenen Stunden ist ausdrücklich eine **Schätzung**: Ein
   * Zeiteintrag trägt keinen Stundensatz, der entsteht erst auf der
   * Rechnung. Ohne hinterlegten Standardsatz bleibt der Betrag `null` — das
   * ist etwas anderes als 0 €, und die Oberfläche sagt dort einen Satz statt
   * einer Null.
   */
  private async hours(): Promise<HoursSummary> {
    const [entries, company] = await Promise.all([
      this.prisma.timeEntry.findMany({
        select: { startMinutes: true, endMinutes: true, breakMinutes: true, billedAt: true },
      }),
      this.prisma.company.findUnique({
        where: { id: 1 },
        select: { defaultHourlyRateCents: true },
      }),
    ]);

    let billedMinutes = 0;
    let openMinutes = 0;
    for (const entry of entries) {
      const minutes = entry.endMinutes - entry.startMinutes - entry.breakMinutes;
      if (entry.billedAt === null) openMinutes += minutes;
      else billedMinutes += minutes;
    }

    const hourlyRateCents = company?.defaultHourlyRateCents ?? null;

    return {
      billedMinutes,
      openMinutes,
      openEstimatedCents:
        hourlyRateCents === null ? null : Math.round((openMinutes / 60) * hourlyRateCents),
      hourlyRateCents,
    };
  }
}

interface StatisticsInvoice {
  invoiceDate: string;
  totalNetCents: number | null;
  totalGrossCents: number | null;
  customerId: number | null;
  buyerData: string | null;
}

function sum(
  invoices: StatisticsInvoice[],
  pick: (invoice: StatisticsInvoice) => number | null,
): number {
  return invoices.reduce((total, invoice) => total + (pick(invoice) ?? 0), 0);
}

function bucket(
  invoices: StatisticsInvoice[],
  keyOf: (invoice: StatisticsInvoice) => string,
  labelOf: (key: string) => string,
): RevenueBucket[] {
  const buckets = new Map<string, RevenueBucket>();

  for (const invoice of invoices) {
    const key = keyOf(invoice);
    const existing = buckets.get(key) ?? {
      key,
      label: labelOf(key),
      netCents: 0,
      grossCents: 0,
      count: 0,
    };
    existing.netCents += invoice.totalNetCents ?? 0;
    existing.grossCents += invoice.totalGrossCents ?? 0;
    existing.count += 1;
    buckets.set(key, existing);
  }

  return [...buckets.values()].sort((a, b) => a.key.localeCompare(b.key));
}

/**
 * Umsatz je Kunde, nach dem **eingefrorenen** Namen des Belegs.
 *
 * Nicht über den heutigen Stammdatensatz: Ein umbenannter oder gelöschter
 * Kunde darf die Vergangenheit nicht umschreiben, und `customerId` ist auf
 * ausgestellten Rechnungen ohnehin `SetNull`-gefährdet.
 */
function byCustomer(invoices: StatisticsInvoice[]): CustomerRevenue[] {
  const byName = new Map<string, CustomerRevenue>();

  for (const invoice of invoices) {
    const customerName = buyerNameOf(invoice.buyerData);
    const key = `${String(invoice.customerId ?? 0)}:${customerName}`;
    const existing = byName.get(key) ?? {
      customerId: invoice.customerId,
      customerName,
      netCents: 0,
      count: 0,
    };
    existing.netCents += invoice.totalNetCents ?? 0;
    existing.count += 1;
    byName.set(key, existing);
  }

  return [...byName.values()].sort((a, b) => b.netCents - a.netCents);
}

function buyerNameOf(buyerData: string | null): string {
  if (buyerData === null) return 'Ohne Kunden';
  try {
    const parsed: unknown = JSON.parse(buyerData);
    const name =
      typeof parsed === 'object' && parsed !== null
        ? (parsed as { companyName?: unknown }).companyName
        : undefined;
    return typeof name === 'string' && name.trim() !== '' ? name : 'Ohne Kunden';
  } catch {
    return 'Ohne Kunden';
  }
}
