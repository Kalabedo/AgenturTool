import { Injectable, Logger } from '@nestjs/common';
import type { Invoice, InvoiceItem } from '@prisma/client';
import { z } from 'zod';
import {
  DOCUMENT_TYPE,
  buyerDataSchema,
  emptyBuyerData,
  sellerSnapshotFromCompany,
  sellerSnapshotSchema,
  taxSnapshotFromProfile,
  taxSnapshotSchema,
  templateSnapshotFromSettings,
  templateSnapshotSchema,
  totalsSnapshotSchema,
  type BuyerData,
  type DiscountType,
  type DocumentType,
  type InvoiceDraftPayload,
  type IsoDate,
  type SellerSnapshot,
  type TaxSnapshot,
  type TemplateSnapshot,
  type TotalsSnapshot,
} from '@agentur-tool/shared';
import { buildRenderModel, type InvoiceRenderModel } from '@agentur-tool/invoice-template';
import {
  renderInvoiceDocument,
  renderInvoiceFooterTemplate,
} from '@agentur-tool/invoice-template/server';
import { ApiError } from '../common/api-error';
import { PrismaService } from '../common/prisma.service';
import { CompanyService } from '../company/company.service';
import { FilesService } from '../files/files.service';
import { TaxProfilesService } from '../tax-profiles/tax-profiles.service';
import { TemplateSettingsService } from '../template-settings/template-settings.service';
import { PdfService } from './pdf.service';

/** Ein fertiges Dokument samt Namen, unter dem es beim Herunterladen landet. */
export interface RenderedInvoicePdf {
  filename: string;
  bytes: Buffer;
}

type InvoiceWithItems = Invoice & { items: InvoiceItem[] };

const WITH_ITEMS = { include: { items: { orderBy: { position: 'asc' } } } } as const;

/**
 * Setzt aus einer Rechnung das druckfertige Dokument zusammen.
 *
 * Der wichtigste Unterschied liegt zwischen Entwurf und ausgestellter
 * Rechnung, und er läuft durch diese ganze Klasse:
 *
 * - **Entwurf:** Stammdaten kommen live aus der Datenbank, die Summen aus
 *   der Berechnung. Das PDF eines Entwurfs zeigt den heutigen Stand (D9)
 *   und ist bewusst nichts, was aufbewahrt wird.
 * - **Ausgestellt:** alles aus den eingefrorenen Snapshots, die Summen aus
 *   `totalsSnapshot`. Ein Neuaufbau muss dasselbe Dokument ergeben wie am
 *   Tag der Ausstellung — das ist der Kern von D8 und die Voraussetzung
 *   dafür, dass ein verlorenes PDF aus dem Snapshot reparierbar ist.
 *
 * Ab Schritt 9 legt das Finalisieren das erzeugte PDF ab; der Download
 * liefert dann die gespeicherte Datei und nicht diesen Weg (Abschnitt 13).
 */
@Injectable()
export class InvoicePdfService {
  private readonly logger = new Logger(InvoicePdfService.name);

  constructor(
    private readonly prisma: PrismaService,
    private readonly company: CompanyService,
    private readonly templateSettings: TemplateSettingsService,
    private readonly taxProfiles: TaxProfilesService,
    private readonly files: FilesService,
    private readonly pdf: PdfService,
  ) {}

  /** PDF einer gespeicherten Rechnung oder eines gespeicherten Entwurfs. */
  async renderInvoice(id: number): Promise<RenderedInvoicePdf> {
    const invoice = await this.load(id);
    return this.toPdf(
      await this.buildModelForInvoice(invoice),
      this.filenameFor(invoice),
      this.documentTitle(invoice),
    );
  }

  /**
   * PDF aus ungespeicherten Formulardaten.
   *
   * Für den Blick auf den Seitenumbruch, bevor gespeichert wird: Die
   * Live-Vorschau zeigt eine fortlaufende Seite, das PDF zeigt die Blätter.
   * Deshalb nimmt dieser Weg dieselbe Nutzlast wie das Speichern entgegen
   * und legt nichts an.
   */
  async renderPreview(payload: InvoiceDraftPayload): Promise<RenderedInvoicePdf> {
    const [seller, template, tax] = await Promise.all([
      this.liveSeller(),
      this.liveTemplate(),
      this.liveTax(payload.taxProfileId),
    ]);

    const model = buildRenderModel({
      documentType: DOCUMENT_TYPE.INVOICE,
      number: null,
      invoiceDate: payload.invoiceDate,
      serviceDate: payload.serviceDate,
      serviceDateTo: payload.serviceDateTo,
      dueDate: payload.dueDate,
      currency: 'EUR',
      seller,
      buyer: payload.buyerData,
      tax,
      template,
      notes: payload.notes,
      footerNote: payload.footerNote,
      logoSrc: await this.logoDataUri(seller.logoAssetId),
      items: payload.items.map((item) => ({
        description: item.description,
        quantity: item.quantity,
        unit: item.unit,
        unitPriceCents: item.unitPriceCents,
        discountType: item.discountType,
        discountValue: item.discountValue,
        taxRateBasisPoints: item.taxRateBasisPoints,
      })),
    });

    return this.toPdf(model, 'Rechnungsentwurf.pdf', 'Rechnungsentwurf');
  }

  /**
   * Das HTML-Dokument zu einer Rechnung.
   *
   * Öffentlich, weil sich hier alles prüfen lässt, was schiefgehen kann —
   * falscher Snapshot, fehlendes Logo, vertauschte Summen — und zwar ohne
   * Chromium. Das PDF darüber ist danach nur noch ein Druckvorgang.
   */
  async buildHtml(id: number): Promise<string> {
    const invoice = await this.load(id);
    return renderInvoiceDocument(await this.buildModelForInvoice(invoice), {
      title: this.documentTitle(invoice),
    });
  }

  private async toPdf(
    model: InvoiceRenderModel,
    filename: string,
    title: string,
  ): Promise<RenderedInvoicePdf> {
    const html = renderInvoiceDocument(model, { title });

    try {
      const bytes = await this.pdf.render(html, {
        footerTemplate: renderInvoiceFooterTemplate(model),
      });
      return { filename, bytes };
    } catch (error) {
      if (error instanceof ApiError) throw error;

      // Alles, was aus Chromium kommt — Zeitlimit, abgestürzter Prozess,
      // fehlende Systembibliothek — wird hier zu einer Meldung, mit der man
      // etwas anfangen kann. Der Stapel gehört ins Log, nicht in die Antwort.
      this.logger.error(
        'PDF-Erzeugung fehlgeschlagen',
        error instanceof Error ? error.stack : error,
      );

      throw ApiError.pdfRenderFailed(
        `Das PDF konnte nicht erzeugt werden: ${error instanceof Error ? error.message : String(error)}`,
      );
    }
  }

  private async buildModelForInvoice(invoice: InvoiceWithItems): Promise<InvoiceRenderModel> {
    const frozen = invoice.sellerSnapshot !== null;

    const seller = frozen
      ? this.parseSnapshot(
          sellerSnapshotSchema,
          invoice.sellerSnapshot,
          invoice.id,
          'sellerSnapshot',
        )
      : await this.liveSeller();
    const tax = frozen
      ? this.parseSnapshot(taxSnapshotSchema, invoice.taxSnapshot, invoice.id, 'taxSnapshot')
      : await this.liveTax(invoice.taxProfileId);
    const template = frozen
      ? this.parseSnapshot(
          templateSnapshotSchema,
          invoice.templateSnapshot,
          invoice.id,
          'templateSnapshot',
        )
      : await this.liveTemplate();

    const totals: TotalsSnapshot | undefined =
      invoice.totalsSnapshot === null
        ? undefined
        : this.parseSnapshot(
            totalsSnapshotSchema,
            invoice.totalsSnapshot,
            invoice.id,
            'totalsSnapshot',
          );

    return buildRenderModel(
      {
        documentType: invoice.documentType as DocumentType,
        number: invoice.number,
        invoiceDate: invoice.invoiceDate as IsoDate,
        serviceDate: invoice.serviceDate as IsoDate,
        serviceDateTo: invoice.serviceDateTo as IsoDate | null,
        dueDate: invoice.dueDate as IsoDate,
        currency: invoice.currency,
        seller,
        buyer: this.parseBuyerData(invoice),
        tax,
        template,
        notes: invoice.notes,
        footerNote: invoice.footerNote,
        logoSrc: await this.logoDataUri(seller.logoAssetId),
        items: invoice.items.map((item) => ({
          description: item.description,
          quantity: item.quantity,
          unit: item.unit,
          unitPriceCents: item.unitPriceCents,
          discountType: item.discountType as DiscountType,
          discountValue: item.discountValue,
          taxRateBasisPoints: item.taxRateBasisPoints,
        })),
      },
      totals,
    );
  }

  private async liveSeller(): Promise<SellerSnapshot> {
    return sellerSnapshotFromCompany(await this.company.get());
  }

  private async liveTemplate(): Promise<TemplateSnapshot> {
    return templateSnapshotFromSettings(await this.templateSettings.get());
  }

  /**
   * Das Steuerprofil eines Entwurfs, als Snapshot-Form.
   *
   * Über denselben Service wie die Oberfläche, damit ein archiviertes Profil
   * hier genauso aufgelöst wird wie dort: Es verschwindet aus der Auswahl,
   * bleibt aber auf Entwürfen stehen, die es benutzen.
   */
  private async liveTax(taxProfileId: number | null): Promise<TaxSnapshot> {
    if (taxProfileId === null) return taxSnapshotFromProfile(null);
    return taxSnapshotFromProfile(await this.taxProfiles.findById(taxProfileId));
  }

  /**
   * Lädt das Logo und macht eine Data-URI daraus.
   *
   * Der entscheidende Unterschied zur Live-Vorschau: Dort genügt die
   * Adresse `/api/assets/7`, weil der Browser die API erreicht. Chromium
   * bekommt das Dokument über `setContent` und hat keine Basis-URL — eine
   * relative Adresse liefe ins Leere, und zwar ohne Fehlermeldung. Das PDF
   * hätte dann einfach kein Logo (D29).
   *
   * Fehlt die Datei zum Datensatz, entsteht das Dokument trotzdem: Eine
   * Rechnung ohne Logo ist unschön, eine Rechnung, die sich nicht drucken
   * lässt, ist ein Ausfall.
   */
  private async logoDataUri(assetId: number | null): Promise<string | null> {
    if (assetId === null) return null;

    try {
      const asset = await this.files.findById(assetId);
      const content = await this.files.readContent(asset);
      return `data:${asset.mimeType};base64,${content.toString('base64')}`;
    } catch {
      return null;
    }
  }

  private parseSnapshot<T>(
    schema: z.ZodType<T>,
    raw: string | null,
    invoiceId: number,
    field: string,
  ): T {
    if (raw === null) {
      throw ApiError.validation(`Der ${field} der Rechnung ${invoiceId} fehlt.`);
    }

    const result = schema.safeParse(JSON.parse(raw));
    if (!result.success) {
      // Ein beschädigter Snapshot darf nicht als halb leeres Dokument
      // durchrutschen: Was hier fehlt, fehlte auch auf dem Papier.
      throw ApiError.validation(
        `Der ${field} der Rechnung ${invoiceId} ist beschädigt und lässt sich nicht drucken.`,
      );
    }
    return result.data;
  }

  private parseBuyerData(invoice: Invoice): BuyerData {
    if (invoice.buyerData === null) return emptyBuyerData();

    const result = buyerDataSchema.safeParse(JSON.parse(invoice.buyerData));
    if (!result.success) {
      throw ApiError.validation(`Die Empfängerdaten der Rechnung ${invoice.id} sind beschädigt.`);
    }
    return result.data;
  }

  /**
   * Dateiname des Downloads.
   *
   * Bewusst sprechend statt technisch: Diese Datei landet im
   * Downloads-Ordner und im E-Mail-Anhang, und dort hilft „Rechnung
   * 2026-001.pdf" mehr als eine id. Alles außerhalb von Buchstaben, Ziffern
   * und Bindestrich fliegt raus — der Name geht in einen HTTP-Header und
   * über die Dateisysteme dreier Betriebssysteme.
   */
  private filenameFor(invoice: Invoice): string {
    const prefix = invoice.documentType === DOCUMENT_TYPE.CANCELLATION ? 'Storno' : 'Rechnung';
    const name = invoice.number ?? `Entwurf-${invoice.id}`;
    return `${prefix}-${name.replace(/[^\p{L}\p{N}-]+/gu, '-')}.pdf`;
  }

  /** Titel des HTML-Dokuments; Chromium schreibt ihn in die PDF-Metadaten. */
  private documentTitle(invoice: Invoice): string {
    const prefix = invoice.documentType === DOCUMENT_TYPE.CANCELLATION ? 'Storno' : 'Rechnung';
    return `${prefix} ${invoice.number ?? `(Entwurf #${invoice.id})`}`;
  }

  private async load(id: number): Promise<InvoiceWithItems> {
    const invoice = await this.prisma.invoice.findUnique({ where: { id }, ...WITH_ITEMS });
    if (invoice === null) {
      throw ApiError.notFound(`Rechnung ${id} existiert nicht.`);
    }
    return invoice;
  }
}
