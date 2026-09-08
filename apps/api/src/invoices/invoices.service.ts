import { Injectable } from '@nestjs/common';
import { Prisma, type Invoice, type InvoiceItem } from '@prisma/client';
import {
  INVOICE_EVENT_TYPE,
  unfinalizeBlocker,
  buyerDataSchema,
  calculateInvoice,
  customerToBuyerData,
  defaultInvoiceDates,
  emptyBuyerData,
  isEditable,
  resolvePaymentTermDays,
  toTotalsSnapshot,
  type BuyerData,
  type DiscountType,
  type DocumentType,
  type InvoiceDraftPayload,
  type InvoiceListQuery,
  type InvoiceResponse,
  type InvoiceStatus,
  type TotalsSnapshot,
} from '@agentur-tool/shared';
import { ApiError } from '../common/api-error';
import { PrismaService } from '../common/prisma.service';
import { CompanyService } from '../company/company.service';
import { InvoiceDocumentsService } from '../pdf/invoice-documents.service';
import { InvoiceNumbersService } from './invoice-numbers.service';

type InvoiceWithItems = Invoice & {
  items: InvoiceItem[];
  documents: { path: string }[];
  cancelledByInvoice: { id: number } | null;
};

/**
 * Was zu einer Rechnung immer mitgeladen wird.
 *
 * Die beiden Beziehungen neben den Positionen kosten wenig und beantworten
 * zwei Fragen, die die Oberfläche sonst einzeln stellen müsste: Gibt es ein
 * gespeichertes PDF, und ist die Rechnung bereits storniert?
 */
const WITH_ITEMS = {
  include: {
    items: { orderBy: { position: 'asc' } },
    documents: { select: { path: true } },
    cancelledByInvoice: { select: { id: true } },
  },
} as const;

@Injectable()
export class InvoicesService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly company: CompanyService,
    private readonly numbers: InvoiceNumbersService,
    private readonly documents: InvoiceDocumentsService,
  ) {}

  async list(query: InvoiceListQuery): Promise<InvoiceResponse[]> {
    const where: Prisma.InvoiceWhereInput = {};

    if (query.status !== undefined) where.status = query.status;
    if (query.customerId !== undefined) where.customerId = query.customerId;
    if (query.year !== undefined) {
      // Kalenderdaten liegen als ISO-Strings, deshalb Präfixvergleich statt
      // Datumsarithmetik.
      where.invoiceDate = { startsWith: String(query.year) };
    }

    const term = query.q?.trim();
    if (term !== undefined && term !== '') {
      where.OR = [{ number: { contains: term } }, { buyerData: { contains: term } }];
    }

    const invoices = await this.prisma.invoice.findMany({
      where,
      // Entwürfe zuerst, danach absteigend nach Datum — was offen ist, sieht
      // man zuerst.
      orderBy: [{ invoiceDate: 'desc' }, { id: 'desc' }],
      ...WITH_ITEMS,
    });

    const nextValues = await this.numbers.allNextValues();
    return invoices.map((invoice) => this.toResponse(invoice, nextValues));
  }

  async findById(id: number): Promise<InvoiceResponse> {
    return this.respond(await this.load(id));
  }

  /**
   * Legt einen Entwurf an und belegt vor, was sich aus den Stammdaten ergibt.
   *
   * Die Vorbelegung passiert im Backend, nicht im Formular: Zahlungsziel und
   * Standard-Steuerprofil sind Regeln, keine Anzeigedetails, und ein
   * direkter API-Aufruf soll dieselbe Rechnung bekommen wie die Oberfläche.
   */
  async createDraft(customerId: number | null): Promise<InvoiceResponse> {
    const company = await this.company.get();

    let buyerData: BuyerData = emptyBuyerData();
    let taxProfileId: number | null = null;
    let paymentTermDays = company.defaultPaymentTermDays;

    if (customerId !== null) {
      const customer = await this.prisma.customer.findUnique({ where: { id: customerId } });
      if (customer === null) {
        throw ApiError.validation('Der gewählte Kunde existiert nicht.', [
          { field: 'customerId', message: 'Dieser Kunde existiert nicht.' },
        ]);
      }

      buyerData = customerToBuyerData({
        ...customer,
        archivedAt: customer.archivedAt?.toISOString() ?? null,
        invoiceCount: 0,
        createdAt: customer.createdAt.toISOString(),
        updatedAt: customer.updatedAt.toISOString(),
      });
      taxProfileId = customer.defaultTaxProfileId;
      paymentTermDays = resolvePaymentTermDays(
        customer.defaultPaymentTermDays,
        company.defaultPaymentTermDays,
      );
    }

    if (taxProfileId === null) {
      const fallback = await this.prisma.taxProfile.findFirst({
        where: { isDefault: true, archivedAt: null },
      });
      taxProfileId = fallback?.id ?? null;
    }

    const dates = defaultInvoiceDates(paymentTermDays);

    const invoice = await this.prisma.$transaction(async (tx) => {
      const created = await tx.invoice.create({
        data: {
          customerId,
          taxProfileId,
          buyerData: JSON.stringify(buyerData),
          invoiceDate: dates.invoiceDate,
          serviceDate: dates.serviceDate,
          dueDate: dates.dueDate,
        },
        ...WITH_ITEMS,
      });

      await tx.invoiceEvent.create({
        data: { invoiceId: created.id, type: INVOICE_EVENT_TYPE.CREATED },
      });

      return created;
    });

    return this.respond(invoice);
  }

  /**
   * Ersetzt einen Entwurf vollständig.
   *
   * Positionen werden gelöscht und neu angelegt statt abgeglichen: Ihre ids
   * werden nirgends referenziert, und ein Abgleich brächte nur die Frage
   * mit sich, was mit umsortierten Zeilen geschehen soll.
   */
  async updateDraft(id: number, payload: InvoiceDraftPayload): Promise<InvoiceResponse> {
    const existing = await this.load(id);
    this.assertEditable(existing);
    await this.assertReferencesExist(payload);

    const calculation = calculateInvoice(
      payload.items.map((item) => ({
        quantity: item.quantity,
        unitPriceCents: item.unitPriceCents,
        discountType: item.discountType,
        discountValue: item.discountValue,
        taxRateBasisPoints: item.taxRateBasisPoints,
      })),
    );

    const invoice = await this.prisma.$transaction(async (tx) => {
      await tx.invoiceItem.deleteMany({ where: { invoiceId: id } });

      await tx.invoice.update({
        where: { id },
        data: {
          customerId: payload.customerId,
          taxProfileId: payload.taxProfileId,
          buyerData: JSON.stringify(payload.buyerData),
          invoiceDate: payload.invoiceDate,
          serviceDate: payload.serviceDate,
          serviceDateTo: payload.serviceDateTo,
          dueDate: payload.dueDate,
          notes: payload.notes,
          footerNote: payload.footerNote,
          internalNotes: payload.internalNotes,
        },
      });

      if (payload.items.length > 0) {
        await tx.invoiceItem.createMany({
          data: payload.items.map((item, index) => ({
            invoiceId: id,
            position: index + 1,
            description: item.description,
            quantity: item.quantity,
            unit: item.unit,
            unitPriceCents: item.unitPriceCents,
            discountType: item.discountType,
            discountValue: item.discountValue,
            taxRateBasisPoints: item.taxRateBasisPoints,
            // Vom Server berechnet, nicht vom Formular übernommen — die
            // Anzeige darf mitrechnen, maßgeblich ist diese Stelle.
            lineDiscountCents: calculation.items[index]?.discountCents ?? 0,
            lineNetCents: calculation.items[index]?.netCents ?? 0,
          })),
        });
      }

      return tx.invoice.findUniqueOrThrow({ where: { id }, ...WITH_ITEMS });
    });

    return this.respond(invoice);
  }

  /** Holt den aktuellen Stammdatenstand des Kunden in den Entwurf (D9). */
  async refreshCustomerData(id: number): Promise<InvoiceResponse> {
    const existing = await this.load(id);
    this.assertEditable(existing);

    if (existing.customerId === null) {
      throw ApiError.validation('Dieser Rechnung ist kein Kunde zugeordnet.');
    }

    const customer = await this.prisma.customer.findUnique({
      where: { id: existing.customerId },
    });
    if (customer === null) {
      throw ApiError.validation('Der zugeordnete Kunde existiert nicht mehr.');
    }

    const buyerData = customerToBuyerData({
      ...customer,
      archivedAt: customer.archivedAt?.toISOString() ?? null,
      invoiceCount: 0,
      createdAt: customer.createdAt.toISOString(),
      updatedAt: customer.updatedAt.toISOString(),
    });

    const invoice = await this.prisma.invoice.update({
      where: { id },
      data: { buyerData: JSON.stringify(buyerData) },
      ...WITH_ITEMS,
    });

    return this.respond(invoice);
  }

  async deleteDraft(id: number): Promise<void> {
    const existing = await this.load(id);
    this.assertEditable(existing);
    await this.prisma.invoice.delete({ where: { id } });
  }

  private assertEditable(invoice: Invoice): void {
    if (!isEditable(invoice.status as InvoiceStatus)) {
      throw ApiError.invoiceNotEditable(
        'Diese Rechnung ist finalisiert und kann nicht mehr geändert werden. ' +
          'Für eine Korrektur muss sie storniert und neu ausgestellt werden.',
      );
    }
  }

  private async assertReferencesExist(payload: InvoiceDraftPayload): Promise<void> {
    if (payload.customerId !== null) {
      const customer = await this.prisma.customer.findUnique({
        where: { id: payload.customerId },
      });
      if (customer === null) {
        throw ApiError.validation('Der gewählte Kunde existiert nicht.', [
          { field: 'customerId', message: 'Dieser Kunde existiert nicht.' },
        ]);
      }
    }

    if (payload.taxProfileId !== null) {
      const profile = await this.prisma.taxProfile.findUnique({
        where: { id: payload.taxProfileId },
      });
      if (profile === null) {
        throw ApiError.validation('Das gewählte Steuerprofil existiert nicht.', [
          { field: 'taxProfileId', message: 'Dieses Steuerprofil existiert nicht.' },
        ]);
      }
    }
  }

  private async load(id: number): Promise<InvoiceWithItems> {
    const invoice = await this.prisma.invoice.findUnique({ where: { id }, ...WITH_ITEMS });
    if (invoice === null) {
      throw ApiError.notFound(`Rechnung ${id} existiert nicht.`);
    }
    return invoice;
  }

  /**
   * Antwort für eine einzelne Rechnung.
   *
   * Holt die Zählerstände nach, die `toResponse` für „darf zurückgenommen
   * werden" braucht. Es sind wenige Zeilen — eine je Jahr —, deshalb ist die
   * eine Abfrage billiger als ein Sonderweg.
   */
  private async respond(invoice: InvoiceWithItems): Promise<InvoiceResponse> {
    return this.toResponse(invoice, await this.numbers.allNextValues());
  }

  private toResponse(invoice: InvoiceWithItems, nextValues: Map<number, number>): InvoiceResponse {
    const calculation = calculateInvoice(
      invoice.items.map((item) => ({
        quantity: item.quantity,
        unitPriceCents: item.unitPriceCents,
        discountType: item.discountType as DiscountType,
        discountValue: item.discountValue,
        taxRateBasisPoints: item.taxRateBasisPoints,
      })),
    );

    // Bei einer finalisierten Rechnung gilt der eingefrorene Snapshot, nicht
    // die Neuberechnung — sonst änderte eine spätere Anpassung der
    // Rechenlogik rückwirkend ein ausgestelltes Dokument.
    const blocker = unfinalizeBlocker({
      status: invoice.status,
      numberSeq: invoice.numberSeq,
      sequenceNextValue:
        invoice.numberYear === null ? null : (nextValues.get(invoice.numberYear) ?? null),
      sentAt: invoice.sentAt?.toISOString() ?? null,
      hasCancellation: invoice.cancelledByInvoice !== null,
    });

    const totals: TotalsSnapshot =
      invoice.totalsSnapshot === null
        ? toTotalsSnapshot(calculation)
        : (JSON.parse(invoice.totalsSnapshot) as TotalsSnapshot);

    return {
      id: invoice.id,
      documentType: invoice.documentType as DocumentType,
      status: invoice.status as InvoiceStatus,
      number: invoice.number,
      currency: invoice.currency,
      customerId: invoice.customerId,
      taxProfileId: invoice.taxProfileId,
      buyerData: this.parseBuyerData(invoice),
      invoiceDate: invoice.invoiceDate,
      serviceDate: invoice.serviceDate,
      serviceDateTo: invoice.serviceDateTo,
      dueDate: invoice.dueDate,
      notes: invoice.notes,
      footerNote: invoice.footerNote,
      internalNotes: invoice.internalNotes,
      items: invoice.items.map((item) => ({
        id: item.id,
        position: item.position,
        description: item.description,
        quantity: item.quantity,
        unit: item.unit,
        unitPriceCents: item.unitPriceCents,
        discountType: item.discountType as DiscountType,
        discountValue: item.discountValue,
        taxRateBasisPoints: item.taxRateBasisPoints,
        lineDiscountCents: item.lineDiscountCents,
        lineNetCents: item.lineNetCents,
      })),
      totals,
      hasDocument: invoice.documents.length > 0,
      // Ein Blick ins Dateisystem je Rechnung. Ein `stat` ist billig, und
      // die Alternative wäre, dem Benutzer eine Datei anzubieten, die es
      // nicht mehr gibt.
      documentMissing: invoice.documents.some((document) => !this.documents.exists(document.path)),
      canUnfinalize: blocker === null,
      unfinalizeBlocker: blocker,

      issuedAt: invoice.issuedAt?.toISOString() ?? null,
      sentAt: invoice.sentAt?.toISOString() ?? null,
      paidAt: invoice.paidAt,
      cancelledAt: invoice.cancelledAt?.toISOString() ?? null,
      createdAt: invoice.createdAt.toISOString(),
      updatedAt: invoice.updatedAt.toISOString(),
    };
  }

  /**
   * Liest die Empfängerdaten aus der TEXT-Spalte.
   *
   * Prisma kennt auf SQLite kein Json, deshalb liegt hier ein String. Er
   * wird gegen das Schema geprüft statt blind geparst — ein beschädigter
   * Datensatz soll auffallen und nicht als halb leeres Objekt weiterlaufen.
   */
  private parseBuyerData(invoice: Invoice): BuyerData {
    if (invoice.buyerData === null) return emptyBuyerData();

    const result = buyerDataSchema.safeParse(JSON.parse(invoice.buyerData));
    if (!result.success) {
      throw ApiError.validation(
        `Die Empfängerdaten der Rechnung ${invoice.id} sind beschädigt.`,
        result.error.errors,
      );
    }
    return result.data;
  }
}
