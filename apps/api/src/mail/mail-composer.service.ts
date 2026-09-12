import { Injectable } from '@nestjs/common';
import {
  DOCUMENT_KIND,
  DOCUMENT_TYPE,
  INVOICE_STATUS,
  MAIL_ATTACHMENT_KIND,
  MAIL_ATTACHMENT_LABELS,
  MAIL_TEMPLATE_KEY,
  TIME_ENTRY_BILLING_FILTER,
  formatCents,
  formatDateDe,
  formatDuration,
  invoiceDocumentFilename,
  renderMailTemplate,
  salutationFor,
  summarizeTimeEntries,
  toIsoDate,
  type InvoiceResponse,
  type MailAttachmentKind,
  type MailAttachmentOption,
  type MailDraftResponse,
  type MailPlaceholderValues,
  type MailSource,
  type MailTemplateKey,
  type MailTransport,
  type TimeEntryRangeQuery,
} from '@agentur-tool/shared';
import { ApiError } from '../common/api-error';
import { CompanyService } from '../company/company.service';
import { CustomersService } from '../customers/customers.service';
import { EinvoiceService } from '../einvoice/einvoice.service';
import { InvoicesService } from '../invoices/invoices.service';
import { InvoicePdfService } from '../pdf/invoice-pdf.service';
import { TimeReportService } from '../pdf/time-report.service';
import { TimeEntriesService } from '../time-entries/time-entries.service';
import { MailSettingsService } from './mail-settings.service';
import { MailTemplatesService } from './mail-templates.service';

/** Ein Anhang mit Inhalt — erst beim Versand erzeugt, nie zwischengelagert. */
export interface PreparedAttachment {
  kind: MailAttachmentKind;
  filename: string;
  contentType: string;
  bytes: Buffer;
}

/**
 * Stellt zusammen, was verschickt wird.
 *
 * Der Entwurf entsteht auf dem Server und nicht im Browser, und das ist
 * keine Geschmacksfrage: Betreff und Text kommen aus der Vorlage, die Werte
 * darin aus den eingefrorenen Snapshots der Rechnung. Ein zweiter
 * Vorlagen-Einsetzer im Frontend hätte dieselbe Aufgabe mit anderen Daten —
 * und der Unterschied fiele erst auf, wenn er beim Kunden im Postfach steht.
 *
 * Die Anhänge entstehen **zweimal getrennt**: Der Entwurf sagt nur, welche
 * es gäbe und wie sie hießen; die Bytes erzeugt `prepare` erst beim
 * tatsächlichen Versand. Ein geöffneter Dialog soll kein PDF drucken.
 */
@Injectable()
export class MailComposerService {
  constructor(
    private readonly invoices: InvoicesService,
    private readonly company: CompanyService,
    private readonly customers: CustomersService,
    private readonly templates: MailTemplatesService,
    private readonly settings: MailSettingsService,
    private readonly pdf: InvoicePdfService,
    private readonly einvoice: EinvoiceService,
    private readonly timeEntries: TimeEntriesService,
    private readonly timeReport: TimeReportService,
  ) {}

  async draft(source: MailSource): Promise<MailDraftResponse> {
    return source.kind === 'INVOICE'
      ? this.invoiceDraft(source.invoiceId)
      : this.timeReportDraft(source);
  }

  // -------------------------------------------------------------------------
  // Rechnung
  // -------------------------------------------------------------------------

  private async invoiceDraft(invoiceId: number): Promise<MailDraftResponse> {
    const invoice = await this.invoices.findById(invoiceId);

    if (invoice.status === INVOICE_STATUS.DRAFT) {
      throw ApiError.validation(
        'Ein Entwurf hat noch keine Nummer und wird nicht versendet. Zuerst ausstellen.',
      );
    }

    const templateKey =
      invoice.documentType === DOCUMENT_TYPE.CANCELLATION
        ? MAIL_TEMPLATE_KEY.CANCELLATION
        : MAIL_TEMPLATE_KEY.INVOICE;

    const warnings: string[] = [];
    const recipient = invoice.buyerData.email;
    if (recipient === null) {
      warnings.push('Zu diesem Empfänger ist keine E-Mail-Adresse hinterlegt — bitte eintragen.');
    }

    return this.assemble({
      templateKey,
      to: recipient === null ? [] : [recipient],
      values: await this.invoicePlaceholders(invoice),
      attachments: await this.invoiceAttachments(invoice),
      warnings,
    });
  }

  private async invoicePlaceholders(invoice: InvoiceResponse): Promise<MailPlaceholderValues> {
    const company = await this.company.get();
    const invoiceDate = toIsoDate(invoice.invoiceDate);
    const dueDate = toIsoDate(invoice.dueDate);

    // Zahlungsziel aus den beiden Daten und nicht aus der Kundenvorgabe: Auf
    // der ausgestellten Rechnung steht, was dort steht — eine später
    // geänderte Vorgabe darf den Begleittext nicht anders aussehen lassen
    // als das Dokument.
    const termDays = Math.round(
      (Date.parse(`${invoice.dueDate}T00:00:00Z`) -
        Date.parse(`${invoice.invoiceDate}T00:00:00Z`)) /
        86_400_000,
    );

    return {
      anrede: salutationFor(invoice.buyerData.contactName),
      kunde: invoice.buyerData.companyName,
      ansprechpartner: invoice.buyerData.contactName ?? '',
      absender: company.companyName,
      rechnungsnummer: invoice.number ?? '',
      rechnungsdatum: formatDateDe(invoiceDate),
      faelligkeitsdatum: formatDateDe(dueDate),
      betrag: formatCents(invoice.totals.grossCents, invoice.currency),
      zahlungsziel: String(termDays),
      leistungszeitraum: formatPeriod(invoice.serviceDate, invoice.serviceDateTo),
    };
  }

  /**
   * Welche Anhänge diese Rechnung anbietet.
   *
   * PDF und XML sind vorausgewählt, der Zeitnachweis nicht: Die ersten
   * beiden sind das Dokument selbst, der dritte ist ein Beleg dazu, den
   * längst nicht jede Rechnung braucht. Was nicht geht, verschwindet nicht
   * aus der Liste, sondern steht mit dem Grund daneben — eine fehlende
   * Auswahl wirft sonst die Frage auf, ob man sie übersehen hat.
   */
  private async invoiceAttachments(invoice: InvoiceResponse): Promise<MailAttachmentOption[]> {
    const options: MailAttachmentOption[] = [
      {
        kind: MAIL_ATTACHMENT_KIND.INVOICE_PDF,
        filename: invoiceDocumentFilename(invoice, DOCUMENT_KIND.PDF),
        available: true,
        selected: true,
        reason: null,
      },
    ];

    const einvoiceProblems = await this.einvoice.problems(invoice.id);
    options.push({
      kind: MAIL_ATTACHMENT_KIND.INVOICE_XML,
      filename: invoiceDocumentFilename(invoice, DOCUMENT_KIND.XML),
      available: einvoiceProblems.length === 0,
      selected: einvoiceProblems.length === 0,
      reason:
        einvoiceProblems.length === 0
          ? null
          : `Der E-Rechnung fehlen Angaben: ${einvoiceProblems
              .map((problem) => problem.message)
              .join(' ')}`,
    });

    const range = timeReportRangeFor(invoice);
    const entries = range === null ? [] : await this.timeEntries.list(range);
    options.push({
      kind: MAIL_ATTACHMENT_KIND.TIME_REPORT,
      filename: 'Zeitnachweis.pdf',
      available: entries.length > 0,
      selected: false,
      reason:
        entries.length > 0
          ? null
          : range === null
            ? 'Dieser Rechnung ist kein Kunde zugeordnet.'
            : 'Im Leistungszeitraum sind für diesen Kunden keine Zeiten erfasst.',
    });

    return options;
  }

  // -------------------------------------------------------------------------
  // Zeitnachweis
  // -------------------------------------------------------------------------

  private async timeReportDraft(
    source: Extract<MailSource, { kind: 'TIME_REPORT' }>,
  ): Promise<MailDraftResponse> {
    const range = rangeOf(source);
    const entries = await this.timeEntries.list(range);
    const customer = await this.customers.findById(source.customerId);

    const warnings: string[] = [];
    if (entries.length === 0) {
      warnings.push('In diesem Zeitraum sind für diesen Kunden keine Zeiten erfasst.');
    }
    if (customer.email === null) {
      warnings.push('Zu diesem Kunden ist keine E-Mail-Adresse hinterlegt — bitte eintragen.');
    }

    const company = await this.company.get();
    const summary = summarizeTimeEntries(entries);

    return this.assemble({
      templateKey: MAIL_TEMPLATE_KEY.TIME_REPORT,
      to: customer.email === null ? [] : [customer.email],
      values: {
        anrede: salutationFor(customer.contactName),
        kunde: customer.companyName,
        ansprechpartner: customer.contactName ?? '',
        absender: company.companyName,
        zeitraum: formatPeriod(source.from, source.to),
        stunden: formatDuration(summary.durationMinutes),
        eintraege: String(summary.entryCount),
      },
      attachments: [
        {
          kind: MAIL_ATTACHMENT_KIND.TIME_REPORT,
          filename: 'Zeitnachweis.pdf',
          available: true,
          selected: true,
          // Auch ohne Einträge: Der Nachweis entsteht und sagt dann, dass in
          // diesem Zeitraum nichts erfasst wurde. Das ist eine Aussage, und
          // manchmal genau die, die der Kunde erwartet.
          reason: null,
        },
      ],
      warnings,
    });
  }

  // -------------------------------------------------------------------------
  // Gemeinsames
  // -------------------------------------------------------------------------

  private async assemble(input: {
    templateKey: MailTemplateKey;
    to: string[];
    values: MailPlaceholderValues;
    attachments: MailAttachmentOption[];
    warnings: string[];
  }): Promise<MailDraftResponse> {
    const template = await this.templates.get(input.templateKey);
    const settingsRow = await this.settings.row();
    const transportProblems = this.settings.problems(settingsRow);

    // Die Blindkopie an sich selbst steht schon im Entwurf und nicht erst
    // beim Versand: Was mitgeschickt wird, soll vorher zu sehen sein.
    const bcc =
      settingsRow.bccSelf && settingsRow.fromAddress !== null ? [settingsRow.fromAddress] : [];

    return {
      templateKey: input.templateKey,
      to: input.to,
      cc: [],
      bcc,
      subject: renderMailTemplate(template.subject, input.values),
      body: renderMailTemplate(template.body, input.values),
      attachments: input.attachments,
      transport: settingsRow.transport as MailTransport,
      transportReady: transportProblems.length === 0,
      transportProblems,
      warnings: input.warnings,
    };
  }

  /**
   * Erzeugt die Anhänge.
   *
   * Erst hier entstehen PDFs — beim Klick auf „Senden" und nicht beim
   * Öffnen des Dialogs. Ein Chromium-Lauf je geöffnetem Fenster wäre
   * verschwendet, und die Auswahl kann sich bis zum Absenden noch ändern.
   */
  async prepare(
    source: MailSource,
    kinds: readonly MailAttachmentKind[],
  ): Promise<PreparedAttachment[]> {
    const prepared: PreparedAttachment[] = [];

    for (const kind of unique(kinds)) {
      prepared.push(await this.prepareOne(source, kind));
    }
    return prepared;
  }

  private async prepareOne(
    source: MailSource,
    kind: MailAttachmentKind,
  ): Promise<PreparedAttachment> {
    if (kind === MAIL_ATTACHMENT_KIND.INVOICE_PDF || kind === MAIL_ATTACHMENT_KIND.INVOICE_XML) {
      if (source.kind !== 'INVOICE') {
        throw ApiError.validation(
          `„${MAIL_ATTACHMENT_LABELS[kind]}" gehört zu einer Rechnung, nicht zu einem Zeitnachweis.`,
        );
      }

      const document =
        kind === MAIL_ATTACHMENT_KIND.INVOICE_PDF
          ? await this.pdf.deliver(source.invoiceId)
          : await this.einvoice.deliver(source.invoiceId);

      return {
        kind,
        filename: document.filename,
        contentType:
          kind === MAIL_ATTACHMENT_KIND.INVOICE_PDF ? 'application/pdf' : 'application/xml',
        bytes: document.bytes,
      };
    }

    const range =
      source.kind === 'TIME_REPORT'
        ? rangeOf(source)
        : timeReportRangeFor(await this.invoices.findById(source.invoiceId));

    if (range === null) {
      throw ApiError.validation(
        'Zu dieser Rechnung lässt sich kein Zeitnachweis erzeugen: Ihr ist kein Kunde zugeordnet.',
      );
    }

    const entries = await this.timeEntries.list(range);
    const document = await this.timeReport.render(range, entries);
    return {
      kind,
      filename: document.filename,
      contentType: 'application/pdf',
      bytes: document.bytes,
    };
  }
}

/** Der Zeitraum des Zeitnachweises zu einer Rechnung. */
function timeReportRangeFor(invoice: InvoiceResponse): TimeEntryRangeQuery | null {
  if (invoice.customerId === null) return null;

  return {
    customerId: invoice.customerId,
    from: toIsoDate(invoice.serviceDate),
    to: toIsoDate(invoice.serviceDateTo ?? invoice.serviceDate),
    // `ALL` und nicht `BILLED`: Die Zeiten sind zu diesem Zeitpunkt in der
    // Regel abgerechnet, aber eine Rechnung kann auch von Hand entstanden
    // sein. Der Nachweis soll dann trotzdem zeigen, was im Zeitraum liegt.
    billing: TIME_ENTRY_BILLING_FILTER.ALL,
  };
}

function rangeOf(source: Extract<MailSource, { kind: 'TIME_REPORT' }>): TimeEntryRangeQuery {
  return {
    customerId: source.customerId,
    from: toIsoDate(source.from),
    to: toIsoDate(source.to),
    billing: TIME_ENTRY_BILLING_FILTER.ALL,
  };
}

function formatPeriod(from: string, to: string | null): string {
  const start = formatDateDe(toIsoDate(from));
  if (to === null || to === from) return start;
  return `${start} – ${formatDateDe(toIsoDate(to))}`;
}

function unique<T>(values: readonly T[]): T[] {
  return [...new Set(values)];
}
