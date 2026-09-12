import { Injectable } from '@nestjs/common';
import { Prisma, type Customer, type Invoice, type InvoiceItem } from '@prisma/client';
import {
  DOCUMENT_KIND,
  DOCUMENT_TYPE,
  INVOICE_EVENT_TYPE,
  INVOICE_STATUS,
  REBILL_CUSTOMER_STATE,
  paginate,
  todayIso,
  unfinalizeBlocker,
  buyerDataSchema,
  calculateInvoice,
  customerToBuyerData,
  defaultInvoiceDates,
  diffBuyerData,
  emptyBuyerData,
  isEditable,
  resolvePaymentTermDays,
  toTotalsSnapshot,
  type BuyerData,
  type DiscountType,
  type UnitCode,
  type DocumentType,
  type InvoiceDateDefaults,
  type InvoiceDraftPayload,
  type InvoiceListQuery,
  type InvoiceListResponse,
  type InvoicePaymentPayload,
  type InvoiceSentPayload,
  type InvoiceResponse,
  type InvoiceStatus,
  type RebillCustomerState,
  type RebillPayload,
  type RebillPreviewResponse,
  type TotalsSnapshot,
} from '@agentur-tool/shared';
import { ApiError } from '../common/api-error';
import { PrismaService } from '../common/prisma.service';
import { CompanyService } from '../company/company.service';
import { InvoiceDocumentsService } from '../pdf/invoice-documents.service';
import { InvoiceNumbersService } from './invoice-numbers.service';

type InvoiceWithItems = Invoice & {
  items: InvoiceItem[];
  documents: { path: string; kind: string; einvoiceProfile: string | null }[];
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
    documents: { select: { path: true, kind: true, einvoiceProfile: true } },
    cancelledByInvoice: { select: { id: true } },
  },
} as const;

/**
 * Beide Stände nebeneinander, bevor einer gewählt ist.
 *
 * Grundlage von Vorschau und Anlegen (`planRebill`). Dass hier `source…`
 * und `current…` als Paar stehen, ist der Zweck: Die Vorschau zeigt den
 * Unterschied, das Anlegen nimmt eine Seite davon.
 */
interface RebillPlan {
  source: InvoiceWithItems;
  /** „2026-014" oder „Entwurf #3" — für Verlaufseintrag und Dialog. */
  sourceName: string;
  customer: Customer | null;
  customerState: RebillCustomerState;
  sourceBuyerData: BuyerData;
  currentBuyerData: BuyerData;
  currentTaxProfileId: number | null;
  taxProfileChange: { from: string; to: string } | null;
  paymentTermDays: number;
  paymentTermFromCustomer: boolean;
  dates: InvoiceDateDefaults;
}

@Injectable()
export class InvoicesService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly company: CompanyService,
    private readonly numbers: InvoiceNumbersService,
    private readonly documents: InvoiceDocumentsService,
  ) {}

  /**
   * Die Übersicht: filtern, sortieren, blättern.
   *
   * Alle Filter arbeiten auf Spalten, nicht auf berechneten Werten — auch
   * „überfällig", das sich aus Status und Fälligkeitsdatum ergibt und
   * deshalb ein Vergleich mit dem heutigen Tag ist statt eines gespeicherten
   * Zustands (Abschnitt 8).
   */
  async list(query: InvoiceListQuery): Promise<InvoiceListResponse> {
    const where = this.buildWhere(query);

    const [total, invoices] = await this.prisma.$transaction([
      this.prisma.invoice.count({ where }),
      this.prisma.invoice.findMany({
        where,
        orderBy: this.buildOrder(query),
        skip: (query.page - 1) * query.pageSize,
        take: query.pageSize,
        ...WITH_ITEMS,
      }),
    ]);

    const nextValues = await this.numbers.allNextValues();

    return paginate(
      invoices.map((invoice) => this.toResponse(invoice, nextValues)),
      total,
      query.page,
      query.pageSize,
    );
  }

  private buildWhere(query: InvoiceListQuery): Prisma.InvoiceWhereInput {
    const where: Prisma.InvoiceWhereInput = {};

    if (query.status !== undefined) where.status = query.status;
    if (query.documentType !== undefined) where.documentType = query.documentType;
    if (query.customerId !== undefined) where.customerId = query.customerId;
    if (query.year !== undefined) {
      // Kalenderdaten liegen als ISO-Strings, deshalb Präfixvergleich statt
      // Datumsarithmetik.
      where.invoiceDate = { startsWith: String(query.year) };
    }

    if (query.overdue) {
      // Bezahlte und stornierte Rechnungen sind nie überfällig, ein Entwurf
      // erst recht nicht — überfällig ist genau eine offene ausgestellte
      // Rechnung, deren Fälligkeitsdatum vorbei ist.
      where.status = INVOICE_STATUS.ISSUED;
      where.dueDate = { lt: todayIso() };
    }

    const term = query.q?.trim();
    if (term !== undefined && term !== '') {
      where.OR = [{ number: { contains: term } }, { buyerData: { contains: term } }];
    }

    return where;
  }

  /**
   * Die Sortierung, immer mit `id` als letztem Kriterium.
   *
   * Ohne dieses zweite Kriterium wäre die Reihenfolge zweier Rechnungen mit
   * demselben Datum nicht festgelegt — beim Blättern könnte dieselbe
   * Rechnung dann auf Seite 1 und auf Seite 2 auftauchen oder ganz fehlen.
   */
  private buildOrder(query: InvoiceListQuery): Prisma.InvoiceOrderByWithRelationInput[] {
    return [{ [query.sort]: query.order }, { id: query.order }];
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
            unitCode: item.unitCode,
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

  /**
   * „Bezahlt am" setzen oder entfernen (D7).
   *
   * `PAID` ist ein gespeicherter Status, aber ein abgeleiteter: Datum
   * gesetzt heißt bezahlt, Datum leer heißt wieder offen. Deshalb gibt es
   * keinen eigenen Endpunkt „als bezahlt markieren" — es gibt nur dieses
   * eine Feld, und der Status folgt ihm.
   */
  async setPayment(id: number, payload: InvoicePaymentPayload): Promise<InvoiceResponse> {
    const existing = await this.load(id);

    if (existing.status === INVOICE_STATUS.DRAFT) {
      throw ApiError.validation('Ein Entwurf ist noch nicht gestellt und kann nicht bezahlt sein.');
    }
    if (existing.status === INVOICE_STATUS.CANCELLED) {
      throw ApiError.invoiceNotEditable(
        'Diese Rechnung ist storniert; eine Zahlung lässt sich darauf nicht mehr vermerken.',
      );
    }

    const invoice = await this.prisma.$transaction(async (tx) => {
      const updated = await tx.invoice.update({
        where: { id },
        data: {
          paidAt: payload.paidAt,
          status: payload.paidAt === null ? INVOICE_STATUS.ISSUED : INVOICE_STATUS.PAID,
        },
        ...WITH_ITEMS,
      });

      await tx.invoiceEvent.create({
        data: {
          invoiceId: id,
          type:
            payload.paidAt === null
              ? INVOICE_EVENT_TYPE.PAYMENT_CLEARED
              : INVOICE_EVENT_TYPE.PAYMENT_SET,
          metadata: JSON.stringify({ paidAt: payload.paidAt }),
        },
      });

      return updated;
    });

    return this.respond(invoice);
  }

  /**
   * „Versendet" setzen oder entfernen.
   *
   * Kein Status, sondern ein Zeitstempel: Versendet und bezahlt sind
   * unabhängig voneinander, und eine versendete Rechnung ist weiterhin offen
   * oder bezahlt — nicht „versendet".
   */
  async setSent(id: number, payload: InvoiceSentPayload): Promise<InvoiceResponse> {
    const existing = await this.load(id);

    if (existing.status === INVOICE_STATUS.DRAFT) {
      throw ApiError.validation(
        'Ein Entwurf hat noch keine Nummer und wird nicht versendet. Zuerst ausstellen.',
      );
    }

    const invoice = await this.prisma.$transaction(async (tx) => {
      const updated = await tx.invoice.update({
        where: { id },
        data: { sentAt: payload.sentAt === null ? null : new Date(payload.sentAt) },
        ...WITH_ITEMS,
      });

      await tx.invoiceEvent.create({
        data: {
          invoiceId: id,
          type: INVOICE_EVENT_TYPE.SENT_MARKED,
          metadata: JSON.stringify({ note: payload.sentAt ?? 'zurückgenommen' }),
        },
      });

      return updated;
    });

    return this.respond(invoice);
  }

  /**
   * Legt einen neuen Entwurf mit den Inhalten dieser Rechnung an.
   *
   * Der Weg für wiederkehrende Leistungen und für die Korrektur nach einem
   * Storno. Kopiert werden Positionen und Texte; **nicht** kopiert werden
   * Nummer, Snapshots, Zahlungs- und Versandvermerke sowie die interne
   * Notiz — sie gehören zu dem Vorgang, der abgeschlossen ist. Die Daten
   * werden neu gesetzt: Ein Duplikat ist eine Rechnung von heute.
   *
   * Was mit den Empfängerdaten geschieht, entscheidet
   * `refreshCustomerDefaults`, und zwar aus dem Grund, der in
   * `packages/shared/src/rebill.ts` steht: Die beiden Anlässe für diesen
   * Vorgang widersprechen sich, und keiner von beiden ist der seltenere.
   */
  async duplicate(
    id: number,
    // Derselbe Standard wie im Schema und in der Oberfläche: Wer nichts sagt,
    // bekommt die aktuellen Kundenvorgaben. Ihn hier zu wiederholen statt das
    // Argument zu erzwingen hält die Vorbelegung an einer Stelle lesbar —
    // abweichen kann nur, wer es ausdrücklich tut.
    payload: RebillPayload = { refreshCustomerDefaults: true },
  ): Promise<InvoiceResponse> {
    const plan = await this.planRebill(id);
    const useCurrent = payload.refreshCustomerDefaults;

    const buyerData = useCurrent ? plan.currentBuyerData : plan.sourceBuyerData;
    const taxProfileId = useCurrent ? plan.currentTaxProfileId : plan.source.taxProfileId;

    const invoice = await this.prisma.$transaction(async (tx) => {
      const created = await tx.invoice.create({
        data: {
          customerId: plan.source.customerId,
          taxProfileId,
          currency: plan.source.currency,
          buyerData: JSON.stringify(buyerData),
          invoiceDate: plan.dates.invoiceDate,
          serviceDate: plan.dates.serviceDate,
          dueDate: plan.dates.dueDate,
          notes: plan.source.notes,
          footerNote: plan.source.footerNote,
          items: {
            create: plan.source.items.map((item) => ({
              position: item.position,
              description: item.description,
              quantity: item.quantity,
              unit: item.unit,
              unitCode: item.unitCode,
              unitPriceCents: item.unitPriceCents,
              discountType: item.discountType,
              discountValue: item.discountValue,
              taxRateBasisPoints: item.taxRateBasisPoints,
              lineDiscountCents: item.lineDiscountCents,
              lineNetCents: item.lineNetCents,
            })),
          },
        },
        ...WITH_ITEMS,
      });

      await tx.invoiceEvent.create({
        data: {
          invoiceId: created.id,
          type: INVOICE_EVENT_TYPE.CREATED,
          metadata: JSON.stringify({
            note:
              `Auf Basis von ${plan.sourceName} angelegt` +
              (useCurrent ? ', mit den aktuellen Kundenvorgaben' : ', mit den Angaben von damals'),
          }),
        },
      });

      return created;
    });

    return this.respond(invoice);
  }

  /**
   * Was beim Anlegen geschähe — ohne es zu tun.
   *
   * Damit im Dialog nichts anderes stehen kann als das, was gleich
   * passiert, benutzen Vorschau und Anlegen dieselbe Auflösung
   * (`planRebill`). Eine zweite Formulierung derselben Regeln wäre genau
   * der Fall, in dem die Vorschau eine Adresse verspricht, die dann nicht
   * auf der Rechnung steht.
   */
  async rebillPreview(id: number): Promise<RebillPreviewResponse> {
    const plan = await this.planRebill(id);

    const calculation = calculateInvoice(
      plan.source.items.map((item) => ({
        quantity: item.quantity,
        unitPriceCents: item.unitPriceCents,
        discountType: item.discountType as DiscountType,
        discountValue: item.discountValue,
        taxRateBasisPoints: item.taxRateBasisPoints,
      })),
    );

    return {
      sourceName: plan.sourceName,

      itemCount: plan.source.items.length,
      netCents: calculation.netCents,
      grossCents: calculation.grossCents,
      carriesNotes: (plan.source.notes ?? '').trim() !== '',
      carriesFooterNote: (plan.source.footerNote ?? '').trim() !== '',

      invoiceDate: plan.dates.invoiceDate,
      serviceDate: plan.dates.serviceDate,
      dueDate: plan.dates.dueDate,
      paymentTermDays: plan.paymentTermDays,
      paymentTermFromCustomer: plan.paymentTermFromCustomer,

      customerState: plan.customerState,
      customerName: plan.customer?.companyName ?? null,
      customerArchived: plan.customer?.archivedAt != null,
      buyerChanges: diffBuyerData(plan.sourceBuyerData, plan.currentBuyerData),
      taxProfileChange: plan.taxProfileChange,
    };
  }

  /**
   * Die gemeinsame Auflösung hinter Vorschau und Anlegen.
   *
   * Liefert beide Stände nebeneinander — den von damals und den von heute —
   * statt schon einen davon auszuwählen. Die Wahl trifft der Aufrufer, und
   * die Vorschau kann beide zeigen.
   */
  private async planRebill(id: number): Promise<RebillPlan> {
    const source = await this.load(id);

    if (source.documentType === DOCUMENT_TYPE.CANCELLATION) {
      throw ApiError.validation(
        'Auf ein Storno lässt sich keine neue Rechnung stützen. Grundlage ist die ursprüngliche Rechnung.',
      );
    }

    const company = await this.company.get();
    const customer =
      source.customerId === null
        ? null
        : await this.prisma.customer.findUnique({ where: { id: source.customerId } });

    const customerState =
      source.customerId === null
        ? REBILL_CUSTOMER_STATE.NONE
        : customer === null
          ? REBILL_CUSTOMER_STATE.MISSING
          : REBILL_CUSTOMER_STATE.AVAILABLE;

    const sourceBuyerData = this.parseBuyerData(source);

    // Ohne Kunden gibt es nichts nachzuziehen; dann ist der aktuelle Stand
    // der alte, und die Gegenüberstellung bleibt leer statt zwölf Zeilen
    // „wird gelöscht" zu behaupten.
    const currentBuyerData =
      customer === null
        ? sourceBuyerData
        : customerToBuyerData({
            ...customer,
            archivedAt: customer.archivedAt?.toISOString() ?? null,
            invoiceCount: 0,
            createdAt: customer.createdAt.toISOString(),
            updatedAt: customer.updatedAt.toISOString(),
          });

    const { taxProfileId: currentTaxProfileId, change: taxProfileChange } =
      await this.resolveRebillTaxProfile(
        source.taxProfileId,
        customer?.defaultTaxProfileId ?? null,
      );

    const paymentTermDays = resolvePaymentTermDays(
      customer?.defaultPaymentTermDays ?? null,
      company.defaultPaymentTermDays,
    );

    return {
      source,
      sourceName: source.number ?? `Entwurf #${source.id}`,
      customer,
      customerState,
      sourceBuyerData,
      currentBuyerData,
      currentTaxProfileId,
      taxProfileChange,
      paymentTermDays,
      paymentTermFromCustomer: customer?.defaultPaymentTermDays != null,
      dates: defaultInvoiceDates(paymentTermDays),
    };
  }

  /**
   * Welches Steuerprofil die neue Rechnung bekäme.
   *
   * Zwei Fälle bleiben bewusst beim alten Profil, statt auf das
   * Standardprofil zurückzufallen: wenn der Kunde gar keine Vorgabe hat und
   * wenn seine Vorgabe archiviert ist. Das Profil der alten Rechnung war
   * eine bewusste Wahl für genau diesen Kunden; ein stiller Rückfall auf
   * „Deutschland 19 %" machte aus einer Reverse-Charge-Rechnung eine mit
   * ausgewiesener Steuer — der teuerste denkbare Fehler an dieser Stelle.
   */
  private async resolveRebillTaxProfile(
    sourceTaxProfileId: number | null,
    customerTaxProfileId: number | null,
  ): Promise<{ taxProfileId: number | null; change: { from: string; to: string } | null }> {
    if (customerTaxProfileId === null || customerTaxProfileId === sourceTaxProfileId) {
      return { taxProfileId: sourceTaxProfileId, change: null };
    }

    const target = await this.prisma.taxProfile.findUnique({ where: { id: customerTaxProfileId } });
    if (target === null || target.archivedAt !== null) {
      return { taxProfileId: sourceTaxProfileId, change: null };
    }

    const previous =
      sourceTaxProfileId === null
        ? null
        : await this.prisma.taxProfile.findUnique({ where: { id: sourceTaxProfileId } });

    return {
      taxProfileId: target.id,
      change: { from: previous?.name ?? 'kein Steuerprofil', to: target.name },
    };
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
        unitCode: item.unitCode as UnitCode,
        unitPriceCents: item.unitPriceCents,
        discountType: item.discountType as DiscountType,
        discountValue: item.discountValue,
        taxRateBasisPoints: item.taxRateBasisPoints,
        lineDiscountCents: item.lineDiscountCents,
        lineNetCents: item.lineNetCents,
      })),
      totals,
      cancelsInvoiceId: invoice.cancelsInvoiceId,
      cancelledByInvoiceId: invoice.cancelledByInvoice?.id ?? null,

      hasDocument: invoice.documents.length > 0,
      pdfEinvoiceProfile:
        invoice.documents.find((document) => document.kind === DOCUMENT_KIND.PDF)
          ?.einvoiceProfile ?? null,
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
