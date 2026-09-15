import { Injectable, Logger } from '@nestjs/common';
import { z } from 'zod';
import {
  DOCUMENT_KIND,
  buyerDataSchema,
  invoiceDocumentFilename,
  checkEinvoiceReady,
  sellerSnapshotSchema,
  taxSnapshotSchema,
  templateSnapshotSchema,
  totalsSnapshotSchema,
  type DiscountType,
  type DocumentType,
  type IsoDate,
  type UnitCode,
} from '@privatura/shared';
import {
  buildEinvoiceModel,
  renderCii,
  DEFAULT_EINVOICE_PROFILE,
  type EinvoiceProfile,
} from '@privatura/einvoice';
import type { RenderModelSourceItem } from '@privatura/invoice-template';
import { ApiError } from '../common/api-error';
import { PrismaService } from '../common/prisma.service';
import { InvoiceDocumentsService } from '../pdf/invoice-documents.service';

/** Eine ausgelieferte E-Rechnung. */
export interface RenderedEinvoice {
  filename: string;
  bytes: Buffer;
}

const WITH_EVERYTHING = {
  include: {
    items: { orderBy: { position: 'asc' } },
    documents: true,
    cancelsInvoice: { select: { number: true } },
  },
} as const;

/**
 * Die Auslieferung der E-Rechnung (Abschnitt 24).
 *
 * Eigener Dienst und keine Methode am PDF-Dienst: Die beiden teilen sich
 * die Ablage, aber sonst nichts. Ein PDF entsteht über Chromium, eine
 * E-Rechnung über eine Abbildung — sie in eine Klasse zu legen hieße, zwei
 * unverwandte Dinge zusammenzubinden, weil sie zufällig denselben Ordner
 * benutzen.
 *
 * **Gelesen, nicht gerechnet.** Der Normalfall ist die Datei, die beim
 * Finalisieren entstanden ist. Fehlt sie — ein Absturz zwischen Commit und
 * Verschieben, ein unvollständig eingespieltes Backup —, wird sie aus den
 * Snapshots neu erzeugt. Das ergibt dieselbe Datei: Alles, was hineingeht,
 * ist eingefroren.
 */
@Injectable()
export class EinvoiceService {
  private readonly logger = new Logger(EinvoiceService.name);

  constructor(
    private readonly prisma: PrismaService,
    private readonly documents: InvoiceDocumentsService,
  ) {}

  async deliver(id: number): Promise<RenderedEinvoice> {
    const invoice = await this.load(id);

    if (invoice.number === null) {
      throw ApiError.validation(
        'Ein Entwurf hat keine E-Rechnung; sie entsteht erst beim Ausstellen.',
      );
    }

    const stored = invoice.documents.find((document) => document.kind === DOCUMENT_KIND.XML);
    const filename = invoiceDocumentFilename(
      {
        documentType: invoice.documentType as DocumentType,
        number: invoice.number,
        id: invoice.id,
      },
      DOCUMENT_KIND.XML,
    );

    if (stored !== undefined && this.documents.exists(stored.path)) {
      return { filename, bytes: await this.documents.read(stored.path) };
    }

    if (stored !== undefined) {
      this.logger.warn(
        `Zu Rechnung ${id} fehlt die Datei ${stored.path}; die E-Rechnung wird aus dem Snapshot erzeugt.`,
      );
    }

    return { filename, bytes: Buffer.from(this.renderFromSnapshots(invoice), 'utf8') };
  }

  /**
   * Was der E-Rechnung dieser Rechnung noch fehlt.
   *
   * Für die Oberfläche: Sie zeigt die Liste neben dem Download-Knopf, statt
   * den Benutzer auf einen Fehler laufen zu lassen.
   */
  async problems(id: number): Promise<{ field: string; message: string }[]> {
    const invoice = await this.load(id);
    if (invoice.sellerSnapshot === null) return [];

    return checkEinvoiceReady({
      seller: this.parse(sellerSnapshotSchema, invoice.sellerSnapshot, id),
      buyer: this.parse(buyerDataSchema, invoice.buyerData, id),
      tax: this.parse(taxSnapshotSchema, invoice.taxSnapshot, id),
    });
  }

  /**
   * Die E-Rechnung einer ausgestellten Rechnung, aus den Snapshots.
   *
   * Öffentlich, weil zwei Wege sie brauchen: der Download hier und das
   * Neuerzeugen des PDFs im Finalisieren-Dienst. Eine zweite Abbildung
   * dafür zu schreiben hieße, zwei Fassungen derselben Rechnung zu haben,
   * die auseinanderlaufen können.
   *
   * @returns Das XML, oder null, wenn der Rechnung dafür Angaben fehlen.
   */
  async renderForProfile(id: number, profile: EinvoiceProfile): Promise<string | null> {
    const invoice = await this.load(id);
    if (invoice.number === null || invoice.sellerSnapshot === null) return null;

    try {
      return this.renderFromSnapshots(invoice, profile);
    } catch {
      // Fehlende Angaben sind hier kein Fehler, sondern eine Antwort: Diese
      // Rechnung bekommt keinen strukturierten Datensatz.
      return null;
    }
  }

  private renderFromSnapshots(
    invoice: Awaited<ReturnType<EinvoiceService['load']>>,
    profile: EinvoiceProfile = DEFAULT_EINVOICE_PROFILE,
  ): string {
    const seller = this.parse(sellerSnapshotSchema, invoice.sellerSnapshot, invoice.id);
    const buyer = this.parse(buyerDataSchema, invoice.buyerData, invoice.id);
    const tax = this.parse(taxSnapshotSchema, invoice.taxSnapshot, invoice.id);
    const template = this.parse(templateSnapshotSchema, invoice.templateSnapshot, invoice.id);
    const totals = this.parse(totalsSnapshotSchema, invoice.totalsSnapshot, invoice.id);

    const missing = checkEinvoiceReady(
      { seller, buyer, tax },
      { requireBuyerReference: profile.requiresBuyerReference },
    );
    if (missing.length > 0) {
      throw ApiError.validation(
        'Zu dieser Rechnung lässt sich keine E-Rechnung erzeugen; es fehlen Angaben.',
        missing,
      );
    }

    // Die Positionen stehen so in der Datenbank, wie sie ausgestellt
    // wurden — beim Storno bereits mit umgekehrten Mengen.
    const items: RenderModelSourceItem[] = invoice.items.map((item) => ({
      description: item.description,
      quantity: item.quantity,
      unit: item.unit,
      unitCode: item.unitCode as UnitCode,
      unitPriceCents: item.unitPriceCents,
      discountType: item.discountType as DiscountType,
      discountValue: item.discountValue,
      taxRateBasisPoints: item.taxRateBasisPoints,
    }));

    const model = buildEinvoiceModel(
      {
        documentType: invoice.documentType as DocumentType,
        number: invoice.number,
        invoiceDate: invoice.invoiceDate as IsoDate,
        serviceDate: invoice.serviceDate as IsoDate,
        serviceDateTo: invoice.serviceDateTo as IsoDate | null,
        dueDate: invoice.dueDate as IsoDate,
        currency: invoice.currency,
        seller,
        buyer,
        tax,
        template,
        notes: invoice.notes,
        footerNote: invoice.footerNote,
        logoSrc: null,
        items,
      },
      totals,
      { precedingInvoiceNumber: invoice.cancelsInvoice?.number ?? null },
    );

    return renderCii(model, profile);
  }

  private async load(id: number) {
    const invoice = await this.prisma.invoice.findUnique({ where: { id }, ...WITH_EVERYTHING });
    if (invoice === null) throw ApiError.notFound(`Rechnung ${id} existiert nicht.`);
    return invoice;
  }

  private parse<S extends z.ZodTypeAny>(
    schema: S,
    raw: string | null,
    invoiceId: number,
  ): z.infer<S> {
    if (raw === null) {
      throw ApiError.validation(
        `Die eingefrorenen Daten der Rechnung ${invoiceId} fehlen; eine E-Rechnung lässt sich daraus nicht erzeugen.`,
      );
    }

    const result = schema.safeParse(JSON.parse(raw));
    if (!result.success) {
      throw ApiError.validation(
        `Die eingefrorenen Daten der Rechnung ${invoiceId} sind beschädigt.`,
      );
    }
    return result.data;
  }
}
