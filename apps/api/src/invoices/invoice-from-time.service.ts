import { Injectable, Logger } from '@nestjs/common';
import { Prisma } from '@prisma/client';
import {
  BILLING_MODE_VALUES,
  DEFAULT_BILLING_MODE,
  INVOICE_EVENT_TYPE,
  ZERO_TAX_KINDS,
  calculateItem,
  previewTimeBilling,
  timeEntriesToInvoiceItems,
  type BillingMode,
  type InvoiceResponse,
  type TaxProfileKind,
  type TimeBillingPreview,
  type TimeEntryForBilling,
} from '@agentur-tool/shared';
import { ApiError } from '../common/api-error';
import { PrismaService } from '../common/prisma.service';
import { CompanyService } from '../company/company.service';
import { InvoicesService } from './invoices.service';

/**
 * Aus offenen Zeiten wird ein Rechnungsentwurf.
 *
 * Das Stück, das gefehlt hat: Bisher setzte „Abrechnen" nur `billedAt`, und
 * die Rechnungszeile tippte man danach von Hand ab. Für eine Solo-Agentur
 * ist das der Weg, den sie jede Woche geht.
 *
 * ## Was hier **nicht** passiert
 *
 * Dieser Dienst ist ein Angebot, kein Trichter. Eine Rechnung von Hand zu
 * schreiben bleibt unverändert, und Zeiten nur als abgerechnet zu markieren
 * (`TimeEntriesService.bill`) auch. Wer die Zeiterfassung nicht benutzt,
 * merkt von diesem Dienst nichts.
 *
 * ## Die Reihenfolge und warum sie so ist
 *
 * Der Entwurf entsteht **vor** der Transaktion, die Positionen schreibt und
 * die Zeiten stempelt. Prisma kann Transaktionen nicht verschachteln, und
 * `createDraft` bringt seine eigene mit — mit gutem Grund: Dort stecken die
 * Empfängerdaten, die Datumsvorgaben und der Rückfall auf das
 * Standard-Steuerprofil.
 *
 * Das ist kein Risiko für das, was wirklich zählt: Gestempelt wird
 * ausschließlich in der zweiten Transaktion. Bricht sie ab, bleibt ein
 * leerer Entwurf zurück — der wird aufgeräumt —, aber **keine abgerechnete
 * Zeit ohne Rechnung**. Der umgekehrte Fall wäre verlorenes Geld, das
 * niemand bemerkt.
 */
@Injectable()
export class InvoiceFromTimeService {
  private readonly logger = new Logger(InvoiceFromTimeService.name);

  constructor(
    private readonly prisma: PrismaService,
    private readonly company: CompanyService,
    private readonly invoices: InvoicesService,
  ) {}

  /**
   * Was entstehen würde — ohne etwas anzulegen.
   *
   * Für den Knopf in der Oberfläche: Wer eine Rechnung erzeugt, soll vorher
   * sehen, was dabei herauskommt.
   */
  async preview(
    customerId: number,
    mode?: BillingMode,
  ): Promise<TimeBillingPreview & { mode: BillingMode; rateCents: number }> {
    const { entries, rateCents, taxRateBasisPoints, billingMode } = await this.gather(
      customerId,
      mode,
    );

    return {
      ...previewTimeBilling(entries, { rateCents, mode: billingMode, taxRateBasisPoints }),
      mode: billingMode,
      rateCents,
    };
  }

  /** Legt den Entwurf an und rechnet die Zeiten ab. */
  async create(customerId: number, mode?: BillingMode): Promise<InvoiceResponse> {
    const { entries, ids, rateCents, taxRateBasisPoints, billingMode, from, to } =
      await this.gather(customerId, mode);

    const items = timeEntriesToInvoiceItems(entries, {
      rateCents,
      mode: billingMode,
      taxRateBasisPoints,
    });

    const draft = await this.invoices.createDraft(customerId);

    try {
      await this.prisma.$transaction(async (tx) => {
        await tx.invoiceItem.createMany({
          data: items.map((item, index) => {
            // Die Zeilenbeträge rechnet der Server, nicht die Abbildung —
            // derselbe verbindliche Rechenweg wie beim Formular.
            const calculated = calculateItem(item);
            return {
              invoiceId: draft.id,
              position: index + 1,
              description: item.description,
              quantity: item.quantity,
              unit: item.unit,
              unitCode: item.unitCode,
              unitPriceCents: item.unitPriceCents,
              discountType: item.discountType,
              discountValue: item.discountValue,
              taxRateBasisPoints: item.taxRateBasisPoints,
              lineDiscountCents: calculated.discountCents,
              lineNetCents: calculated.netCents,
            };
          }),
        });

        // Der Leistungszeitraum ist der, den die Zeiten abdecken — niemand
        // soll ihn abtippen. Ein einzelner Tag bekommt kein „bis".
        await tx.invoice.update({
          where: { id: draft.id },
          data: { serviceDate: from, serviceDateTo: from === to ? null : to },
        });

        await this.stamp(tx, ids, draft.id);

        await tx.invoiceEvent.create({
          data: {
            invoiceId: draft.id,
            type: INVOICE_EVENT_TYPE.UPDATED,
            metadata: JSON.stringify({
              note: `${ids.length} erfasste Zeiten übernommen (${billingMode}).`,
            }),
          },
        });
      });
    } catch (error) {
      // Ein leerer Entwurf ist Müll, aber harmlos. Ihn stehen zu lassen wäre
      // verwirrend, deshalb weg damit — die Zeiten sind ohnehin unberührt,
      // weil das Stempeln in derselben Transaktion lag.
      await this.prisma.invoice.delete({ where: { id: draft.id } }).catch(() => undefined);
      throw error;
    }

    return this.invoices.findById(draft.id);
  }

  private async stamp(
    tx: Prisma.TransactionClient,
    ids: readonly number[],
    invoiceId: number,
  ): Promise<void> {
    const billedAt = new Date();
    const result = await tx.timeEntry.updateMany({
      // `billedAt: null` in der Bedingung: Hat jemand dieselben Zeiten
      // zwischenzeitlich in einem zweiten Fenster abgerechnet, trifft das
      // Update nichts — und dann soll es auffallen, statt eine zweite
      // Rechnung über dieselbe Arbeit zu stellen.
      where: { id: { in: [...ids] }, billedAt: null },
      data: { billedAt, invoiceId },
    });

    if (result.count !== ids.length) {
      throw ApiError.validation(
        'Diese Zeiten wurden zwischenzeitlich abgerechnet. Bitte die Liste neu laden.',
      );
    }
  }

  /** Alles, was beide Wege brauchen — an einer Stelle geholt und geprüft. */
  private async gather(
    customerId: number,
    mode?: BillingMode,
  ): Promise<{
    entries: TimeEntryForBilling[];
    ids: number[];
    rateCents: number;
    taxRateBasisPoints: number;
    billingMode: BillingMode;
    from: string;
    to: string;
  }> {
    const customer = await this.prisma.customer.findUnique({
      where: { id: customerId },
      include: { defaultTaxProfile: true },
    });
    if (customer === null) throw ApiError.notFound(`Kunde ${customerId} existiert nicht.`);

    const open = await this.prisma.timeEntry.findMany({
      where: { customerId, billedAt: null },
      orderBy: [{ date: 'asc' }, { startMinutes: 'asc' }, { id: 'asc' }],
    });

    if (open.length === 0) {
      throw ApiError.validation('Für diesen Kunden sind keine Zeiten offen.');
    }

    const company = await this.company.get();
    const rateCents = customer.hourlyRateCents ?? company.defaultHourlyRateCents;
    if (rateCents === null || rateCents <= 0) {
      throw ApiError.validation(
        'Für diesen Kunden ist kein Stundensatz hinterlegt. Er steht beim Kunden oder als Vorgabe in den Unternehmensdaten.',
        [{ field: 'hourlyRateCents', message: 'Bitte einen Stundensatz angeben.' }],
      );
    }

    // Steuerfrei, Reverse Charge und Kleinunternehmer weisen keinen Satz aus
    // — dieselbe Regel wie in `effectiveTaxRateBasisPoints`.
    const profile = customer.defaultTaxProfile;
    const taxRateBasisPoints =
      profile === null || ZERO_TAX_KINDS.includes(profile.kind as TaxProfileKind)
        ? 0
        : profile.defaultRateBasisPoints;

    const entries: TimeEntryForBilling[] = open.map((entry) => ({
      date: entry.date,
      startMinutes: entry.startMinutes,
      // Ende minus Beginn minus Pause — so rechnet die Zeiterfassung auch
      // sonst, und nur so bleibt es auf dem Viertelstundenraster.
      durationMinutes: entry.endMinutes - entry.startMinutes - entry.breakMinutes,
      description: entry.description,
    }));

    const billingMode = this.resolveMode(mode, customer.billingMode);

    return {
      entries,
      ids: open.map((entry) => entry.id),
      rateCents,
      taxRateBasisPoints,
      billingMode,
      from: entries[0]?.date ?? '',
      to: entries[entries.length - 1]?.date ?? '',
    };
  }

  /**
   * Die Abrechnungsart: Angabe des Aufrufers, sonst die des Kunden.
   *
   * Ein unbekannter Wert in der Datenbank fällt nicht auf die Nase, sondern
   * auf die Vorgabe zurück — die Spalte trägt bewusst keinen CHECK, und ein
   * verunglückter Wert soll keine Rechnung verhindern.
   */
  private resolveMode(requested: BillingMode | undefined, stored: string): BillingMode {
    if (requested !== undefined) return requested;
    return (BILLING_MODE_VALUES as readonly string[]).includes(stored)
      ? (stored as BillingMode)
      : DEFAULT_BILLING_MODE;
  }
}
