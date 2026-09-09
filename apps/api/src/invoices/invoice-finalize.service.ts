import { Injectable, Logger } from '@nestjs/common';
import { Prisma, type Invoice, type InvoiceItem } from '@prisma/client';
import { z } from 'zod';
import {
  DOCUMENT_TYPE,
  INVOICE_EVENT_TYPE,
  INVOICE_STATUS,
  buyerDataSchema,
  calculateInvoice,
  calculateItem,
  cancellationNote,
  checkFinalizable,
  emptyBuyerData,
  formatInvoiceNumber,
  isCancellable,
  isEditable,
  negateInvoiceItem,
  numberScopeOf,
  sellerSnapshotSchema,
  taxSnapshotSchema,
  templateSnapshotSchema,
  todayIso,
  sellerSnapshotFromCompany,
  taxSnapshotFromProfile,
  templateSnapshotFromSettings,
  toTotalsSnapshot,
  unfinalizeBlocker,
  type BuyerData,
  type DiscountType,
  type DocumentType,
  type InvoiceStatus,
  type IsoDate,
  type SellerSnapshot,
  type TaxSnapshot,
  type TemplateSnapshot,
  type TotalsSnapshot,
} from '@agentur-tool/shared';
import type { RenderModelSourceItem } from '@agentur-tool/invoice-template';
import { ApiError } from '../common/api-error';
import { PrismaService } from '../common/prisma.service';
import { CompanyService } from '../company/company.service';
import { TaxProfilesService } from '../tax-profiles/tax-profiles.service';
import { TemplateSettingsService } from '../template-settings/template-settings.service';
import { InvoiceDocumentsService, type StagedDocument } from '../pdf/invoice-documents.service';
import { InvoicePdfService } from '../pdf/invoice-pdf.service';
import { InvoiceNumbersService } from './invoice-numbers.service';

type InvoiceWithItems = Invoice & { items: InvoiceItem[] };

const WITH_ITEMS = { include: { items: { orderBy: { position: 'asc' } } } } as const;

/**
 * Wie oft ein Kollisionsabbruch wiederholt wird.
 *
 * Drei, weil jeder Anlauf die dann nächste freie Nummer zieht und ein
 * vierter Fehlschlag kein Wettlauf mehr wäre, sondern ein Defekt, den man
 * sehen will.
 */
const MAX_ATTEMPTS = 3;

/** Die Zeile, die ausgestellt wird — Rechnung oder Storno. */
interface IssueTarget {
  id: number;
  documentType: DocumentType;
  invoiceDate: IsoDate;
  serviceDate: IsoDate;
  serviceDateTo: IsoDate | null;
  dueDate: IsoDate;
  currency: string;
  notes: string | null;
  footerNote: string | null;
}

interface IssuedResult {
  number: string;
  seq: number;
  staged: StagedDocument;
}

interface FrozenSources {
  seller: SellerSnapshot;
  tax: TaxSnapshot;
  template: TemplateSnapshot;
  totals: TotalsSnapshot;
  buyer: BuyerData;
  items: RenderModelSourceItem[];
}

/**
 * Finalisieren, Zurücknehmen, Neuerzeugen (Abschnitte 8, 9 und 13).
 *
 * Der Schritt, an dem aus einer Datenbankzeile ein Dokument wird: Nummer
 * ziehen, Stammdaten einfrieren, PDF erzeugen und ablegen — und zwar so,
 * dass Datenbank und Dateisystem nicht auseinanderlaufen können.
 *
 * **Warum das PDF innerhalb der Transaktion entsteht.** Das
 * Konsistenzprotokoll in Abschnitt 13 sah zuerst das PDF und danach die
 * Transaktion vor. So geht es nicht: Auf dem Dokument steht die
 * Rechnungsnummer, und die gibt es erst, wenn der Zähler gezogen ist. Die
 * Reihenfolge ist deshalb umgekehrt — Nummer ziehen, drucken, Datensätze
 * schreiben, committen, Datei an ihren Platz verschieben. Bricht davor
 * etwas ab, rollt alles zurück und die Nummer ist nicht verbraucht.
 *
 * Der Preis: Chromium druckt, während die Schreibsperre der Datenbank
 * gehalten wird — eine knappe Sekunde. Bei einem Einzelplatzwerkzeug ist das
 * der günstigere Tausch; die Alternative wäre ein Zustand, in dem eine
 * Nummer vergeben, aber keine Rechnung ausgestellt ist.
 */
@Injectable()
export class InvoiceFinalizeService {
  private readonly logger = new Logger(InvoiceFinalizeService.name);

  constructor(
    private readonly prisma: PrismaService,
    private readonly company: CompanyService,
    private readonly taxProfiles: TaxProfilesService,
    private readonly templateSettings: TemplateSettingsService,
    private readonly numbers: InvoiceNumbersService,
    private readonly documents: InvoiceDocumentsService,
    private readonly pdf: InvoicePdfService,
  ) {}

  /**
   * Stellt die Rechnung aus.
   *
   * Gibt nichts zurück; die Antwort baut der aufrufende Service, damit es
   * nur eine Stelle gibt, die eine Rechnung in ihre API-Form bringt.
   */
  async finalize(id: number): Promise<void> {
    const invoice = await this.load(id);

    if (!isEditable(invoice.status as InvoiceStatus)) {
      throw ApiError.invoiceNotEditable(
        `Diese Rechnung ist bereits ausgestellt (${invoice.number ?? invoice.status}).`,
      );
    }

    const frozen = await this.freezeSources(invoice);
    const problems = checkFinalizable({
      seller: frozen.seller,
      buyer: frozen.buyer,
      tax: frozen.tax,
      items: invoice.items,
    });

    if (problems.length > 0) {
      throw ApiError.finalizeValidationFailed(
        'Die Rechnung ist noch nicht vollständig und kann nicht ausgestellt werden.',
        problems,
      );
    }

    const pattern = await this.numbers.pattern();
    const scope = numberScopeOf(invoice.invoiceDate as IsoDate);

    for (let attempt = 1; ; attempt += 1) {
      try {
        await this.issueOnce(this.asIssueTarget(invoice), frozen, pattern, scope);
        return;
      } catch (error) {
        if (attempt >= MAX_ATTEMPTS || !this.isNumberCollision(error)) throw error;

        // Der nächste Anlauf liest den Zähler neu und zieht die dann freie
        // Nummer. Ein Wettlauf ist bei einem Benutzer die Ausnahme — aber
        // eine, die hier folgenlos bleiben muss.
        this.logger.warn(
          `Nummernkollision bei Rechnung ${id}, Versuch ${attempt} von ${MAX_ATTEMPTS}.`,
        );
      }
    }
  }

  /**
   * Ein Anlauf: alles in einer Transaktion, die Datei danach an ihren Platz.
   *
   * `extra` läuft mit in derselben Transaktion — das Stornieren hängt daran
   * das Kennzeichnen der aufgehobenen Rechnung, damit es beides gibt oder
   * keins von beidem.
   */
  private async issueOnce(
    target: IssueTarget,
    frozen: FrozenSources,
    pattern: string,
    scope: { year: number; month: number },
    extra?: (tx: Prisma.TransactionClient, issued: IssuedResult) => Promise<void>,
  ): Promise<void> {
    let staged: StagedDocument | null = null;

    try {
      await this.prisma.$transaction(
        async (tx) => {
          const issued = await this.issue(tx, target, frozen, pattern, scope);
          staged = issued.staged;
          if (extra !== undefined) await extra(tx, issued);
        },
        // Großzügig bemessen, weil das Drucken mit in der Transaktion liegt.
        // Die Voreinstellung von fünf Sekunden reicht für eine lange
        // Rechnung auf einer langsamen Maschine nicht sicher.
        { timeout: 120_000, maxWait: 15_000 },
      );
    } catch (error) {
      if (staged !== null) await this.documents.discard(staged);
      throw error;
    }

    // Erst nach dem Commit, und atomar: Ab hier gibt es die Rechnung, und
    // die Datei liegt an genau der Stelle, die in der Datenbank steht.
    if (staged !== null) await this.documents.commit(staged);
  }

  /**
   * Nummer ziehen, drucken, einfrieren — der gemeinsame Kern von
   * Finalisieren und Stornieren.
   *
   * Läuft ausschließlich innerhalb einer Transaktion: Was hier geschrieben
   * wird, gilt erst mit deren Commit, und die gezogene Nummer ist bis dahin
   * zurücknehmbar.
   */
  private async issue(
    tx: Prisma.TransactionClient,
    target: IssueTarget,
    frozen: FrozenSources,
    pattern: string,
    scope: { year: number; month: number },
  ): Promise<IssuedResult> {
    const seq = await this.numbers.allocate(tx, scope.year);
    const number = formatInvoiceNumber(pattern, { ...scope, seq });

    const document = await this.pdf.renderFrozen({
      id: target.id,
      documentType: target.documentType,
      number,
      invoiceDate: target.invoiceDate,
      serviceDate: target.serviceDate,
      serviceDateTo: target.serviceDateTo,
      dueDate: target.dueDate,
      currency: target.currency,
      notes: target.notes,
      footerNote: target.footerNote,
      buyer: frozen.buyer,
      seller: frozen.seller,
      tax: frozen.tax,
      template: frozen.template,
      totals: frozen.totals,
      items: frozen.items,
    });

    const staged = await this.documents.stage(document.bytes, scope.year, number);

    await tx.invoice.update({
      where: { id: target.id },
      data: {
        number,
        numberYear: scope.year,
        numberSeq: seq,
        status: INVOICE_STATUS.ISSUED,
        issuedAt: new Date(),
        sellerSnapshot: JSON.stringify(frozen.seller),
        taxSnapshot: JSON.stringify(frozen.tax),
        templateSnapshot: JSON.stringify(frozen.template),
        totalsSnapshot: JSON.stringify(frozen.totals),
        snapshotVersion: frozen.seller.snapshotVersion,
      },
    });

    await tx.invoiceDocument.create({
      data: {
        invoiceId: target.id,
        path: staged.relativePath,
        sha256: staged.sha256,
        sizeBytes: staged.sizeBytes,
      },
    });

    await tx.invoiceEvent.create({
      data: {
        invoiceId: target.id,
        type: INVOICE_EVENT_TYPE.FINALIZED,
        metadata: JSON.stringify({ assignedNumber: number }),
      },
    });

    return { number, seq, staged };
  }

  /**
   * Storniert eine ausgestellte Rechnung (Abschnitt 8).
   *
   * Nicht die Rechnung wird verändert — sie bleibt, wie sie ist. Es entsteht
   * ein **zweites Dokument** mit eigener Nummer aus derselben Sequenz (D10)
   * und umgekehrten Mengen, und die Originalrechnung bekommt `cancelledAt`
   * und einen Verweis darauf. So bleibt beides nachvollziehbar: was
   * abgerechnet und was wieder aufgehoben wurde.
   *
   * Die Snapshots übernimmt das Storno **von der Originalrechnung**, nicht
   * aus den heutigen Stammdaten: Es hebt ein bestimmtes Dokument auf und
   * muss deshalb dieselbe Anschrift, dasselbe Steuerprofil und dasselbe
   * Aussehen tragen. Nur die Summen werden neu gerechnet — aus den
   * umgekehrten Mengen, und dank des symmetrischen Rundens ergeben Original
   * und Storno zusammen exakt null.
   *
   * Liefert die id des Storno-Dokuments.
   */
  async cancel(id: number): Promise<number> {
    const original = await this.load(id);

    if (
      !isCancellable({
        status: original.status as InvoiceStatus,
        documentType: original.documentType as DocumentType,
        cancelledByInvoiceId: await this.cancellationIdOf(id),
      })
    ) {
      throw ApiError.invoiceNotEditable(
        'Nur eine ausgestellte oder bezahlte Rechnung ohne vorhandenes Storno kann storniert werden.',
      );
    }
    if (original.number === null) {
      throw ApiError.validation(`Rechnung ${id} hat keine Nummer.`);
    }

    const frozen = await this.frozenFromSnapshots(original);
    const pattern = await this.numbers.pattern();
    const today = todayIso();
    const scope = numberScopeOf(today);

    for (let attempt = 1; ; attempt += 1) {
      const cancellationId = await this.createCancellationDraft(original, today);

      try {
        await this.issueOnce(
          {
            id: cancellationId,
            documentType: DOCUMENT_TYPE.CANCELLATION,
            invoiceDate: today,
            serviceDate: original.serviceDate as IsoDate,
            serviceDateTo: original.serviceDateTo as IsoDate | null,
            // Ein Storno hat nichts zu zahlen; das Fälligkeitsdatum wäre
            // sonst eine Aufforderung, die niemand einlösen soll.
            dueDate: today,
            currency: original.currency,
            notes: cancellationNote(original.number, original.invoiceDate as IsoDate),
            footerNote: original.footerNote,
          },
          frozen,
          pattern,
          scope,
          async (tx) => {
            // In derselben Transaktion: Ohne das gäbe es einen Moment mit
            // einem Storno zu einer Rechnung, die nichts davon weiß.
            await tx.invoice.update({
              where: { id },
              data: { status: INVOICE_STATUS.CANCELLED, cancelledAt: new Date() },
            });
            await tx.invoiceEvent.create({
              data: {
                invoiceId: id,
                type: INVOICE_EVENT_TYPE.CANCELLED,
                metadata: JSON.stringify({ documentType: DOCUMENT_TYPE.CANCELLATION }),
              },
            });
          },
        );

        return cancellationId;
      } catch (error) {
        // Der Entwurf des Stornos ist außerhalb der Transaktion entstanden
        // und muss weg, sonst bliebe eine leere Zeile ohne Nummer zurück.
        await this.prisma.invoice.delete({ where: { id: cancellationId } }).catch(() => undefined);

        if (attempt >= MAX_ATTEMPTS || !this.isNumberCollision(error)) throw error;
        this.logger.warn(`Nummernkollision beim Storno zu ${id}, Versuch ${attempt}.`);
      }
    }
  }

  /**
   * Legt die Zeile des Storno-Dokuments an — zunächst als Entwurf.
   *
   * Der Umweg ist nicht willkürlich: Die Trigger sperren das Einfügen von
   * Positionen, sobald eine Rechnung nicht mehr `DRAFT` ist. Ein direkt als
   * `ISSUED` angelegtes Storno hätte deshalb keine Positionen bekommen.
   */
  private async createCancellationDraft(
    original: InvoiceWithItems,
    today: IsoDate,
  ): Promise<number> {
    const cancellation = await this.prisma.invoice.create({
      data: {
        documentType: DOCUMENT_TYPE.CANCELLATION,
        cancelsInvoiceId: original.id,
        customerId: original.customerId,
        taxProfileId: original.taxProfileId,
        currency: original.currency,
        buyerData: original.buyerData,
        invoiceDate: today,
        serviceDate: original.serviceDate,
        serviceDateTo: original.serviceDateTo,
        dueDate: today,
        notes: cancellationNote(original.number as string, original.invoiceDate as IsoDate),
        footerNote: original.footerNote,
        items: {
          create: original.items.map((item) => {
            const negated = negateInvoiceItem({
              quantity: item.quantity,
              unitPriceCents: item.unitPriceCents,
              discountType: item.discountType as DiscountType,
              discountValue: item.discountValue,
              taxRateBasisPoints: item.taxRateBasisPoints,
            });
            const calculated = calculateItem(negated);

            return {
              position: item.position,
              description: item.description,
              unit: item.unit,
              quantity: negated.quantity,
              unitPriceCents: negated.unitPriceCents,
              discountType: negated.discountType,
              discountValue: negated.discountValue,
              taxRateBasisPoints: negated.taxRateBasisPoints,
              lineDiscountCents: calculated.discountCents,
              lineNetCents: calculated.netCents,
            };
          }),
        },
      },
    });

    return cancellation.id;
  }

  /** Die eingefrorenen Daten einer ausgestellten Rechnung, für das Storno. */
  private async frozenFromSnapshots(invoice: InvoiceWithItems): Promise<FrozenSources> {
    const items: RenderModelSourceItem[] = invoice.items.map((item) => {
      const negated = negateInvoiceItem({
        quantity: item.quantity,
        unitPriceCents: item.unitPriceCents,
        discountType: item.discountType as DiscountType,
        discountValue: item.discountValue,
        taxRateBasisPoints: item.taxRateBasisPoints,
      });

      return { description: item.description, unit: item.unit, ...negated };
    });

    return {
      seller: this.parseSnapshot(sellerSnapshotSchema, invoice.sellerSnapshot, invoice.id),
      tax: this.parseSnapshot(taxSnapshotSchema, invoice.taxSnapshot, invoice.id),
      template: this.parseSnapshot(templateSnapshotSchema, invoice.templateSnapshot, invoice.id),
      totals: toTotalsSnapshot(calculateInvoice(items)),
      buyer: this.parseBuyerData(invoice),
      items,
    };
  }

  private parseSnapshot<T>(schema: z.ZodType<T>, raw: string | null, invoiceId: number): T {
    const result = schema.safeParse(raw === null ? null : JSON.parse(raw));
    if (!result.success) {
      throw ApiError.validation(
        `Die eingefrorenen Daten der Rechnung ${invoiceId} sind unvollständig; ein Storno lässt sich daraus nicht erzeugen.`,
      );
    }
    return result.data;
  }

  private async cancellationIdOf(invoiceId: number): Promise<number | null> {
    const cancellation = await this.prisma.invoice.findUnique({
      where: { cancelsInvoiceId: invoiceId },
      select: { id: true },
    });
    return cancellation?.id ?? null;
  }

  /**
   * Nimmt die Finalisierung zurück (D6).
   *
   * Die vier Bedingungen prüft `unfinalizeBlocker` im geteilten Paket —
   * dieselbe Funktion, mit der die Oberfläche entscheidet, ob sie den Knopf
   * überhaupt zeigt.
   */
  async unfinalize(id: number): Promise<void> {
    const invoice = await this.prisma.invoice.findUnique({
      where: { id },
      include: { documents: true, cancelledByInvoice: { select: { id: true } } },
    });
    if (invoice === null) throw ApiError.notFound(`Rechnung ${id} existiert nicht.`);

    const blocker = unfinalizeBlocker({
      status: invoice.status,
      numberSeq: invoice.numberSeq,
      sequenceNextValue:
        invoice.numberYear === null ? null : await this.numbers.nextValueFor(invoice.numberYear),
      sentAt: invoice.sentAt?.toISOString() ?? null,
      hasCancellation: invoice.cancelledByInvoice !== null,
    });

    if (blocker !== null) throw ApiError.unfinalizeNotAllowed(blocker);

    const releasedNumber = invoice.number;
    const year = invoice.numberYear as number;
    const seq = invoice.numberSeq as number;
    const paths = invoice.documents.map((document) => document.path);

    await this.prisma.$transaction(async (tx) => {
      await this.numbers.release(tx, year, seq);
      await tx.invoiceDocument.deleteMany({ where: { invoiceId: id } });

      // Nummer, Status und Zeitstempel müssen zusammen in einem Update
      // zurückgesetzt werden: Genau diese Kombination lässt der
      // Immutability-Trigger als Ausnahme durch.
      await tx.invoice.update({
        where: { id },
        data: {
          number: null,
          numberYear: null,
          numberSeq: null,
          status: INVOICE_STATUS.DRAFT,
          issuedAt: null,
          sellerSnapshot: null,
          taxSnapshot: null,
          templateSnapshot: null,
          totalsSnapshot: null,
          snapshotVersion: null,
        },
      });

      await tx.invoiceEvent.create({
        data: {
          invoiceId: id,
          type: INVOICE_EVENT_TYPE.UNFINALIZED,
          metadata: JSON.stringify({ releasedNumber }),
        },
      });
    });

    // Nach dem Commit: Bleibt eine Datei liegen, ist sie verwaist und wandert
    // beim nächsten Start nach data/orphans — schlimmer wäre eine gelöschte
    // Datei zu einer Rechnung, die es noch gibt.
    for (const relativePath of paths) await this.documents.remove(relativePath);
  }

  /**
   * Erzeugt das PDF einer ausgestellten Rechnung neu.
   *
   * Der Reparaturweg für eine verlorene Datei (Abschnitt 13). Gerendert wird
   * aus den Snapshots, deshalb entsteht dasselbe Dokument wie am Tag der
   * Ausstellung — nur der Hash kann abweichen, wenn sich die
   * Chromium-Version geändert hat, und genau deshalb wird er neu gespeichert.
   */
  async regenerateDocument(id: number): Promise<void> {
    const invoice = await this.load(id);

    if (isEditable(invoice.status as InvoiceStatus)) {
      throw ApiError.invoiceNotEditable(
        'Ein Entwurf hat kein gespeichertes PDF; er wird bei jedem Aufruf frisch gerendert.',
      );
    }
    if (invoice.number === null || invoice.numberYear === null) {
      throw ApiError.validation(`Rechnung ${id} hat keine Nummer und damit keinen Ablageort.`);
    }

    const rendered = await this.pdf.renderInvoice(id);
    const staged = await this.documents.stage(rendered.bytes, invoice.numberYear, invoice.number);

    try {
      await this.prisma.$transaction(async (tx) => {
        await tx.invoiceDocument.deleteMany({ where: { invoiceId: id } });
        await tx.invoiceDocument.create({
          data: {
            invoiceId: id,
            path: staged.relativePath,
            sha256: staged.sha256,
            sizeBytes: staged.sizeBytes,
          },
        });
        await tx.invoiceEvent.create({
          data: { invoiceId: id, type: INVOICE_EVENT_TYPE.PDF_REGENERATED },
        });
      });
    } catch (error) {
      await this.documents.discard(staged);
      throw error;
    }

    await this.documents.commit(staged);
  }

  /** Die Stammdaten in der Form, in der sie eingefroren werden. */
  private async freezeSources(invoice: InvoiceWithItems): Promise<FrozenSources> {
    const [company, settings] = await Promise.all([
      this.company.get(),
      this.templateSettings.get(),
    ]);

    const profile =
      invoice.taxProfileId === null ? null : await this.taxProfiles.findById(invoice.taxProfileId);

    const items: RenderModelSourceItem[] = invoice.items.map((item) => ({
      description: item.description,
      quantity: item.quantity,
      unit: item.unit,
      unitPriceCents: item.unitPriceCents,
      discountType: item.discountType as DiscountType,
      discountValue: item.discountValue,
      taxRateBasisPoints: item.taxRateBasisPoints,
    }));

    return {
      seller: sellerSnapshotFromCompany(company),
      tax: taxSnapshotFromProfile(profile),
      template: templateSnapshotFromSettings(settings),
      // Die Summen entstehen hier ein letztes Mal aus der Berechnung und
      // sind ab dem Commit unveränderlich.
      totals: toTotalsSnapshot(calculateInvoice(items)),
      buyer: this.parseBuyerData(invoice),
      items,
    };
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
   * Ob der Fehler ein Wettlauf um dieselbe Nummer war.
   *
   * Zwei Formen: Das bedingte Update traf keine Zeile (eigener Fehlercode)
   * oder der Unique-Index auf `number` hat zugeschlagen (P2002). Beide sind
   * wiederholbar, alles andere nicht.
   */
  private isNumberCollision(error: unknown): boolean {
    if (error instanceof ApiError) return error.code === 'NUMBER_SEQUENCE_CONFLICT';
    return error instanceof Prisma.PrismaClientKnownRequestError && error.code === 'P2002';
  }

  private asIssueTarget(invoice: Invoice): IssueTarget {
    return {
      id: invoice.id,
      documentType: invoice.documentType as DocumentType,
      invoiceDate: invoice.invoiceDate as IsoDate,
      serviceDate: invoice.serviceDate as IsoDate,
      serviceDateTo: invoice.serviceDateTo as IsoDate | null,
      dueDate: invoice.dueDate as IsoDate,
      currency: invoice.currency,
      notes: invoice.notes,
      footerNote: invoice.footerNote,
    };
  }

  private async load(id: number): Promise<InvoiceWithItems> {
    const invoice = await this.prisma.invoice.findUnique({ where: { id }, ...WITH_ITEMS });
    if (invoice === null) throw ApiError.notFound(`Rechnung ${id} existiert nicht.`);
    return invoice;
  }
}
