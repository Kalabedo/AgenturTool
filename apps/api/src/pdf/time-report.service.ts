import { Inject, Injectable, Logger } from '@nestjs/common';
import {
  formatDateDe,
  formatDecimalHours,
  formatDuration,
  formatTimeOfDay,
  summarizeTimeEntries,
  type IsoDate,
  type TimeEntryCustomerSummary,
  type TimeEntryRangeQuery,
  type TimeEntryResponse,
} from '@agentur-tool/shared';
import { EMBEDDED_FONT_CSS } from '@agentur-tool/invoice-template';
import { ApiError } from '../common/api-error';
import { CompanyService } from '../company/company.service';
import { PDF_RENDERER, type PdfRenderer } from './pdf-renderer';

/** Ein fertiger Zeitnachweis samt Dateiname für den Download. */
export interface RenderedTimeReport {
  filename: string;
  bytes: Buffer;
}

const PAGE_MARGIN_MM = 14;
const PAGE_FOOTER_MM = 16;

function escapeHtml(value: string): string {
  return value
    .replace(/&/gu, '&amp;')
    .replace(/</gu, '&lt;')
    .replace(/>/gu, '&gt;')
    .replace(/"/gu, '&quot;');
}

/**
 * Der Zeitraum, den der Nachweis ausweist.
 *
 * Abgeleitet, wenn keiner angefragt wurde: Beim Abrechnen gibt niemand
 * Daten ein — der Zeitraum ergibt sich aus dem frühesten und spätesten
 * abgerechneten Tag. Ein gewählter Zeitraum hat Vorrang, denn dann ist die
 * Aussage „in diesem Monat" gemeint, auch wenn nur an drei Tagen etwas
 * erfasst wurde.
 */
function periodOf(
  query: TimeEntryRangeQuery,
  entries: readonly TimeEntryResponse[],
): { from: string | null; to: string | null } {
  const dates = entries.map((entry) => entry.date).sort();
  return {
    from: query.from ?? dates[0] ?? null,
    to: query.to ?? dates[dates.length - 1] ?? null,
  };
}

function formatPeriod(period: { from: string | null; to: string | null }): string {
  if (period.from === null || period.to === null) return 'ohne Zeitraum';
  if (period.from === period.to) return formatDateDe(period.from as IsoDate);
  return `${formatDateDe(period.from as IsoDate)} – ${formatDateDe(period.to as IsoDate)}`;
}

/**
 * Der Zeitnachweis als PDF.
 *
 * Bewusst ein eigenes, kleines Dokument statt eines Rechnungstemplates: Ein
 * Zeitnachweis ist kein Rechnungsdokument. Er trägt keine Nummer, keine
 * Steuer und keine Summe in Geld, er wird nicht eingefroren und nicht
 * aufbewahrt — er ist ein Auszug aus den erfassten Zeiten, den man einem
 * Kunden als Beleg zur Rechnung mitschickt. Ihn durch die Snapshot- und
 * Nummernlogik der Rechnung zu zwingen, hieße, ihm eine Verbindlichkeit zu
 * geben, die er nicht hat.
 *
 * Was er mit der Rechnung teilt, ist die Technik darunter: dieselbe
 * eingebettete Schrift, derselbe Chromium, dieselbe Regel aus D29 — das
 * Dokument trägt alles in sich und braucht keinen Netzwerkzugriff.
 */
@Injectable()
export class TimeReportService {
  private readonly logger = new Logger(TimeReportService.name);

  constructor(
    private readonly company: CompanyService,
    @Inject(PDF_RENDERER) private readonly pdf: PdfRenderer,
  ) {}

  async render(
    query: TimeEntryRangeQuery,
    entries: readonly TimeEntryResponse[],
  ): Promise<RenderedTimeReport> {
    const company = await this.company.get();
    const summary = summarizeTimeEntries(entries);

    // Ein Zeitnachweis über einen Zeitraum ohne Einträge ist kein Fehler,
    // sondern eine Aussage: In diesem Monat wurde für diesen Kunden nichts
    // erfasst. Das Dokument entsteht trotzdem und sagt genau das.
    const title = this.titleFor(query, entries);
    const html = this.buildHtml({
      title,
      companyName: company.companyName,
      query,
      entries,
      summary,
    });

    try {
      const bytes = await this.pdf.render(html, { footerTemplate: this.footerTemplate(title) });
      return { filename: this.filenameFor(query, entries), bytes };
    } catch (error) {
      if (error instanceof ApiError) throw error;

      this.logger.error(
        'Der Zeitnachweis konnte nicht gedruckt werden',
        error instanceof Error ? error.stack : error,
      );
      throw ApiError.pdfRenderFailed(
        `Das PDF konnte nicht erzeugt werden: ${error instanceof Error ? error.message : String(error)}`,
      );
    }
  }

  /**
   * Das HTML des Nachweises.
   *
   * Öffentlich aus demselben Grund wie beim Rechnungs-PDF: Alles, was am
   * Dokument schiefgehen kann — falsche Summe, fehlende Gruppe, verrutschte
   * Spalte —, lässt sich hier ohne Chromium prüfen.
   */
  buildHtml(input: {
    title: string;
    companyName: string;
    query: TimeEntryRangeQuery;
    entries: readonly TimeEntryResponse[];
    summary: ReturnType<typeof summarizeTimeEntries>;
  }): string {
    const { title, companyName, query, entries, summary } = input;

    const period = formatPeriod(periodOf(query, entries));
    const groups = summary.byCustomer.map((customer) => ({
      customer,
      entries: entries.filter((entry) => entry.customerId === customer.customerId),
    }));

    return [
      '<!doctype html>',
      '<html lang="de">',
      '<head>',
      '<meta charset="utf-8">',
      `<title>${escapeHtml(title)}</title>`,
      `<style>${this.css()}</style>`,
      '</head>',
      '<body>',
      '<main class="sheet">',
      '<header class="head">',
      '<div>',
      '<p class="eyebrow">Zeitnachweis</p>',
      `<h1>${escapeHtml(period)}</h1>`,
      '</div>',
      '<div class="head-meta">',
      companyName.trim() === '' ? '' : `<p class="company">${escapeHtml(companyName)}</p>`,
      `<p>Erfasste Zeit: <strong>${formatDuration(summary.durationMinutes)} h</strong>`,
      ` (${formatDecimalHours(summary.durationMinutes)} Std.)</p>`,
      `<p>${summary.entryCount} ${summary.entryCount === 1 ? 'Eintrag' : 'Einträge'}</p>`,
      '</div>',
      '</header>',

      groups.length === 0
        ? '<p class="empty">In diesem Zeitraum wurden keine Zeiten erfasst.</p>'
        : groups.map((group) => this.renderGroup(group.customer, group.entries)).join(''),

      groups.length > 1 ? this.renderGrandTotal(summary.durationMinutes) : '',
      '</main>',
      '</body>',
      '</html>',
    ].join('\n');
  }

  /**
   * Ein Kundenblock.
   *
   * Gruppiert wird auch dann, wenn nur ein Kunde vorkommt: Der Nachweis
   * geht an diesen Kunden, und sein Name gehört über die Tabelle, nicht
   * bloß in eine Filterzeile im Kopf.
   */
  private renderGroup(
    customer: TimeEntryCustomerSummary,
    entries: readonly TimeEntryResponse[],
  ): string {
    const rows = entries
      .map((entry) =>
        [
          '<tr>',
          `<td class="date">${escapeHtml(formatDateDe(entry.date as IsoDate))}</td>`,
          `<td class="num">${formatTimeOfDay(entry.startMinutes)}</td>`,
          `<td class="num">${formatTimeOfDay(entry.endMinutes)}</td>`,
          `<td class="num soft">${entry.breakMinutes === 0 ? '—' : formatDuration(entry.breakMinutes)}</td>`,
          `<td class="num strong">${formatDuration(entry.durationMinutes)}</td>`,
          `<td>${entry.description === null ? '' : escapeHtml(entry.description)}</td>`,
          '</tr>',
        ].join(''),
      )
      .join('');

    return [
      '<section class="group">',
      `<h2>${escapeHtml(customer.customerName)}</h2>`,
      '<table>',
      '<thead><tr>',
      '<th class="date">Datum</th>',
      '<th class="num">Beginn</th>',
      '<th class="num">Ende</th>',
      '<th class="num">Pause</th>',
      '<th class="num">Dauer</th>',
      '<th>Tätigkeit</th>',
      '</tr></thead>',
      `<tbody>${rows}</tbody>`,
      '<tfoot><tr>',
      `<td colspan="4">Summe ${escapeHtml(customer.customerName)}</td>`,
      `<td class="num strong">${formatDuration(customer.durationMinutes)}</td>`,
      `<td class="soft">${formatDecimalHours(customer.durationMinutes)} Std.</td>`,
      '</tr></tfoot>',
      '</table>',
      '</section>',
    ].join('');
  }

  private renderGrandTotal(durationMinutes: number): string {
    return [
      '<section class="total">',
      '<span>Gesamt</span>',
      `<span class="strong">${formatDuration(durationMinutes)} h`,
      ` <span class="soft">(${formatDecimalHours(durationMinutes)} Std.)</span></span>`,
      '</section>',
    ].join('');
  }

  /**
   * Das Stylesheet des Nachweises.
   *
   * In Millimetern und Punkten wie beim Rechnungstemplate: Ziel ist ein
   * Blatt Papier. `break-inside: avoid` auf der Kopfzeile einer Gruppe
   * verhindert die hässlichste Variante des Seitenumbruchs — ein Kundenname
   * allein am Fuß der Seite, seine Tabelle auf der nächsten.
   */
  private css(): string {
    return `${EMBEDDED_FONT_CSS}

@page {
  size: A4;
  margin: ${PAGE_MARGIN_MM}mm ${PAGE_MARGIN_MM}mm ${PAGE_FOOTER_MM}mm;
}

* { box-sizing: border-box; }

body {
  margin: 0;
  color: #1f2328;
  font-family: 'Open Sans', 'Helvetica Neue', Arial, sans-serif;
  font-size: 9.5pt;
  line-height: 1.5;
  -webkit-font-smoothing: antialiased;
}

.head {
  display: flex;
  justify-content: space-between;
  align-items: flex-end;
  gap: 8mm;
  padding-bottom: 3mm;
  border-bottom: 0.6pt solid #1f2328;
}

.eyebrow {
  margin: 0;
  font-size: 8pt;
  letter-spacing: 0.12em;
  text-transform: uppercase;
  color: #4b5563;
}

h1 { margin: 1mm 0 0; font-size: 15pt; font-weight: 700; }

.head-meta { text-align: right; }
.head-meta p { margin: 0; font-size: 8.5pt; color: #4b5563; }
.head-meta .company { font-size: 9.5pt; font-weight: 700; color: #1f2328; }

.group { margin-top: 7mm; }
.group h2 {
  margin: 0 0 2mm;
  font-size: 11pt;
  font-weight: 700;
  break-after: avoid;
  page-break-after: avoid;
}

table { width: 100%; border-collapse: collapse; }

/* Die Kopfzeile wiederholt sich auf Folgeseiten — ohne sie stünden dort
   Zahlenspalten ohne Bedeutung. */
thead { display: table-header-group; }
tfoot { display: table-row-group; }

th {
  padding: 1.5mm 2mm;
  font-size: 7.5pt;
  font-weight: 600;
  letter-spacing: 0.06em;
  text-transform: uppercase;
  text-align: left;
  color: #4b5563;
  background: #f4f5f7;
  border-bottom: 0.5pt solid #d7dade;
}

td {
  padding: 1.5mm 2mm;
  border-bottom: 0.4pt solid #e3e6ea;
  vertical-align: top;
}

tr { break-inside: avoid; page-break-inside: avoid; }

.num { text-align: right; white-space: nowrap; font-variant-numeric: tabular-nums; }
.date { white-space: nowrap; }
.soft { color: #4b5563; }
.strong { font-weight: 700; }

tfoot td {
  border-top: 0.6pt solid #1f2328;
  border-bottom: none;
  font-weight: 600;
}

.total {
  display: flex;
  justify-content: space-between;
  margin-top: 6mm;
  padding-top: 2mm;
  border-top: 1pt solid #1f2328;
  font-size: 11pt;
}

.empty { margin-top: 8mm; color: #4b5563; }
`;
  }

  /** Fußzeile mit Seitenzahl; Chromium füllt die beiden Klassen selbst. */
  private footerTemplate(title: string): string {
    return [
      `<div style="width:100%;box-sizing:border-box;padding:0 ${PAGE_MARGIN_MM}mm;`,
      'font-family:Helvetica,Arial,sans-serif;font-size:7.5pt;color:#6b7280;',
      'display:flex;justify-content:space-between;align-items:center">',
      `<span>${escapeHtml(title)}</span>`,
      '<span>Seite <span class="pageNumber"></span> von <span class="totalPages"></span></span>',
      '</div>',
    ].join('');
  }

  private titleFor(query: TimeEntryRangeQuery, entries: readonly TimeEntryResponse[]): string {
    const period = formatPeriod(periodOf(query, entries));
    const customer = this.singleCustomerName(query, entries);
    return customer === null ? `Zeitnachweis ${period}` : `Zeitnachweis ${customer} ${period}`;
  }

  /**
   * Dateiname des Downloads.
   *
   * Sprechend statt technisch — die Datei landet im Downloads-Ordner und im
   * E-Mail-Anhang. Alles außerhalb von Buchstaben, Ziffern und Bindestrich
   * fliegt raus: Der Name geht durch einen HTTP-Header und über die
   * Dateisysteme dreier Betriebssysteme.
   */
  private filenameFor(query: TimeEntryRangeQuery, entries: readonly TimeEntryResponse[]): string {
    const customer = this.singleCustomerName(query, entries);
    const period = periodOf(query, entries);
    const parts = ['Zeitnachweis', customer, period.from, 'bis', period.to].filter(
      (part): part is string => part !== null && part !== undefined,
    );

    return `${parts.join('-').replace(/[^\p{L}\p{N}-]+/gu, '-')}.pdf`;
  }

  /**
   * Der Kundenname, wenn der Nachweis nur einen Kunden betrifft.
   *
   * Auch ohne gesetzten Filter: Wer im September nur für einen Kunden
   * gearbeitet hat, bekommt trotzdem dessen Namen im Titel — das ist die
   * Angabe, nach der man die Datei später sucht.
   */
  private singleCustomerName(
    query: TimeEntryRangeQuery,
    entries: readonly TimeEntryResponse[],
  ): string | null {
    const [first] = entries;
    if (first === undefined) return null;

    const single = entries.every((entry) => entry.customerId === first.customerId);
    if (!single) return null;
    if (query.customerId !== null && query.customerId !== first.customerId) return null;

    return first.customerName;
  }
}
