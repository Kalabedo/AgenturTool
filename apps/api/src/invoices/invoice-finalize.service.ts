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
  checkEinvoiceReady,
  checkFinalizable,
  DOCUMENT_KIND,
  emptyBuyerData,
  EMPTY_INVOICE_TOTALS_COLUMNS,
  invoiceTotalsColumns,
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
  type UnitCode,
} from '@privatura/shared';
import type { RenderModelSourceItem } from '@privatura/invoice-template';
import {
  buildEinvoiceModel,
  embedZugferd,
  renderCii,
  XRECHNUNG_3_0,
  ZUGFERD_EN16931,
  type EinvoiceProfile,
} from '@privatura/einvoice';
import { ApiError } from '../common/api-error';
import { PrismaService } from '../common/prisma.service';
import { CompanyService } from '../company/company.service';
import { TaxProfilesService } from '../tax-profiles/tax-profiles.service';
import { TemplateSettingsService } from '../template-settings/template-settings.service';
import { InvoiceDocumentsService, type StagedDocument } from '../pdf/invoice-documents.service';
import { InvoicePdfService } from '../pdf/invoice-pdf.service';
import { EinvoiceService } from '../einvoice/einvoice.service';
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
  /**
   * Alle Dateien dieses Vorgangs — PDF und, wenn die Rechnung dafür
   * vollständig ist, die E-Rechnung.
   */
  staged: StagedDocument[];
}

interface FrozenSources {
  seller: SellerSnapshot;
  /** BT-25: die aufgehobene Rechnung, wenn dies ein Storno ist. */
  precedingInvoiceNumber: string | null;
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
    // Nur für den Reparaturweg: Auch ein neu erzeugtes PDF soll seinen
    // eingebetteten Datensatz wiederbekommen.
    private readonly einvoice: EinvoiceService,
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
    let staged: StagedDocument[] = [];

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
      for (const file of staged) await this.documents.discard(file);
      throw error;
    }

    // Erst nach dem Commit, und atomar: Ab hier gibt es die Rechnung, und
    // die Dateien liegen an genau den Stellen, die in der Datenbank stehen.
    for (const file of staged) await this.documents.commit(file);
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

    // Die E-Rechnung entsteht aus **derselben** Quelle wie das PDF und in
    // derselben Transaktion. Das ist die Umsetzung von „eine ausgestellte
    // Rechnung ist ein Dokument": Wären es zwei getrennte Vorgänge, gäbe
    // es einen Moment, in dem die XML-Datei andere Beträge trüge als das
    // Papier — oder gar nicht existierte.
    //
    // Zwei Ausgaben aus einem Modell, und der Unterschied ist genau ein
    // Profil: Die eigenständige Datei ist eine XRechnung, der Datensatz im
    // PDF folgt der reinen EU-Norm. Letztere verlangt keine Käuferreferenz
    // und reicht damit über die Kunden hinaus, die eine Leitweg-ID haben.
    const xrechnung = this.renderEinvoice(target, frozen, number, XRECHNUNG_3_0);
    const zugferdXml = this.renderEinvoice(target, frozen, number, ZUGFERD_EN16931);

    const pdf = await this.toZugferd(document.bytes, zugferdXml, {
      number,
      invoiceDate: target.invoiceDate,
      sellerName: frozen.seller.companyName,
    });

    const staged = [
      await this.documents.stage(pdf.bytes, scope.year, number, DOCUMENT_KIND.PDF, pdf.profile),
    ];

    if (xrechnung !== null) {
      staged.push(
        await this.documents.stage(
          Buffer.from(xrechnung, 'utf8'),
          scope.year,
          number,
          DOCUMENT_KIND.XML,
          XRECHNUNG_3_0.key,
        ),
      );
    }

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

        // Dieselben Zahlen ein zweites Mal, als auswertbare Spalten. Nicht
        // neu gerechnet, sondern aus genau diesen Snapshots abgeleitet — der
        // Snapshot bleibt die Wahrheit (Abschnitt 30).
        ...invoiceTotalsColumns({
          tax: frozen.tax,
          totals: frozen.totals,
          buyer: frozen.buyer,
        }),
      },
    });

    await tx.invoiceDocument.createMany({
      data: staged.map((file) => ({
        invoiceId: target.id,
        kind: file.kind,
        path: file.relativePath,
        sha256: file.sha256,
        sizeBytes: file.sizeBytes,
        einvoiceProfile: file.einvoiceProfile,
      })),
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
   * Erzeugt die E-Rechnung — oder `null`, wenn die Rechnung dafür noch
   * nicht vollständig ist.
   *
   * `null` und kein Fehler: Eine Rechnung ohne Leitweg-ID ist eine
   * vollkommen gültige Rechnung nach § 14 UStG. Sie ließe sich nur nicht
   * als XRechnung ausgeben, und das darf das Ausstellen nicht verhindern —
   * sonst wäre jede Bestandsrechnung mit einem Schlag unfinalisierbar, für
   * ein Feld, das es beim Anlegen des Kunden noch gar nicht gab.
   *
   * Was fehlt, sagt die Oberfläche neben dem Download-Knopf; dieselbe
   * Prüfung liefert die Liste.
   */
  /**
   * Macht aus dem gedruckten PDF ein ZUGFeRD-Dokument — wenn es geht.
   *
   * **Scheitern darf das Ausstellen nicht kosten.** Eine Rechnung ohne
   * eingebetteten Datensatz ist eine vollkommen gültige Rechnung; eine
   * Rechnung, die sich nicht ausstellen ließ, ist gar keine. Deshalb wird
   * hier aufgefangen statt durchgereicht — und das Ergebnis in der Ablage
   * vermerkt, damit „nicht hybrid" ein sichtbarer Zustand ist und keine
   * stille Annahme.
   */
  private async toZugferd(
    pdfBytes: Buffer,
    xml: string | null,
    document: { number: string; invoiceDate: string; sellerName: string },
  ): Promise<{ bytes: Buffer; profile: string | null }> {
    if (xml === null) return { bytes: pdfBytes, profile: null };

    const { number, invoiceDate } = document;

    try {
      const embedded = await embedZugferd(pdfBytes, xml, {
        title: `Rechnung ${number}`,
        author: document.sellerName,
        // Der Zeitpunkt kommt aus dem Rechnungsdatum, nicht aus der Uhr:
        // Dieselbe Rechnung soll dieselbe Datei und damit dieselbe
        // Prüfsumme ergeben. Das Rechnungsdatum ist ein Kalendertag (D21),
        // deshalb Mitternacht UTC — die Angabe steht in den Metadaten und
        // ist kein Zeitpunkt, an dem etwas geschehen wäre.
        now: new Date(`${invoiceDate}T00:00:00.000Z`),
      });
      return { bytes: Buffer.from(embedded), profile: ZUGFERD_EN16931.key };
    } catch (error) {
      this.logger.warn(
        `Zu ${number} ließ sich kein ZUGFeRD-PDF erzeugen (${String(error)}). ` +
          'Die Rechnung wird als gewöhnliches PDF ausgestellt.',
      );
      return { bytes: pdfBytes, profile: null };
    }
  }

  /**
   * Der Firmenname aus dem eingefrorenen Snapshot.
   *
   * Steht in den PDF-Metadaten als Verfasser. Ein beschädigter oder
   * fehlender Snapshot darf das Neuerzeugen nicht verhindern — der Name ist
   * eine Beschriftung, kein Inhalt des Belegs.
   */
  private sellerNameOf(sellerSnapshot: string | null): string {
    if (sellerSnapshot === null) return 'Privatura';
    const parsed = sellerSnapshotSchema.safeParse(JSON.parse(sellerSnapshot));
    return parsed.success ? parsed.data.companyName : 'Privatura';
  }

  private renderEinvoice(
    target: IssueTarget,
    frozen: FrozenSources,
    number: string,
    profile: EinvoiceProfile,
  ): string | null {
    const problems = checkEinvoiceReady(
      {
        seller: frozen.seller,
        buyer: frozen.buyer,
        tax: frozen.tax,
      },
      { requireBuyerReference: profile.requiresBuyerReference },
    );

    if (problems.length > 0) {
      this.logger.log(
        `Zu ${number} entsteht kein ${profile.label}: ${problems.map((problem) => problem.field).join(', ')}.`,
      );
      return null;
    }

    const model = buildEinvoiceModel(
      {
        documentType: target.documentType,
        number,
        invoiceDate: target.invoiceDate,
        serviceDate: target.serviceDate,
        serviceDateTo: target.serviceDateTo,
        dueDate: target.dueDate,
        currency: target.currency,
        seller: frozen.seller,
        buyer: frozen.buyer,
        tax: frozen.tax,
        template: frozen.template,
        notes: target.notes,
        footerNote: target.footerNote,
        logoSrc: null,
        items: frozen.items,
      },
      frozen.totals,
      { precedingInvoiceNumber: frozen.precedingInvoiceNumber },
    );

    return renderCii(model, profile);
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
              unitCode: item.unitCode,
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

      return {
        description: item.description,
        unit: item.unit,
        unitCode: item.unitCode as UnitCode,
        ...negated,
      };
    });

    return {
      seller: this.parseSnapshot(sellerSnapshotSchema, invoice.sellerSnapshot, invoice.id),
      tax: this.parseSnapshot(taxSnapshotSchema, invoice.taxSnapshot, invoice.id),
      template: this.parseSnapshot(templateSnapshotSchema, invoice.templateSnapshot, invoice.id),
      totals: toTotalsSnapshot(calculateInvoice(items)),
      buyer: this.parseBuyerData(invoice),
      items,
      // BT-25: Das Storno verweist auf die Rechnung, aus deren Snapshots
      // es entsteht — genau die, die es aufhebt.
      precedingInvoiceNumber: invoice.number,
    };
  }

  // `z.ZodTypeAny` statt `z.ZodType<T>`: Die Snapshot-Schemas sind seit
  // Version 2 in ein `z.preprocess` gehüllt, das Version 1 beim Lesen
  // auffüllt. Deren Eingabetyp ist `unknown`, weshalb `z.ZodType<T>` nicht
  // mehr passt und T zu `unknown` zusammenfiele.
  private parseSnapshot<S extends z.ZodTypeAny>(
    schema: S,
    raw: string | null,
    invoiceId: number,
  ): z.infer<S> {
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

          // Die abgeleiteten Spalten gehen mit. Blieben sie stehen, trüge ein
          // Entwurf weiter Umsatz in jede Auswertung.
          ...EMPTY_INVOICE_TOTALS_COLUMNS,
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

    // Auch das neu erzeugte PDF ist ein ZUGFeRD-Dokument. Ohne diesen
    // Schritt verlöre ausgerechnet der Reparaturweg den eingebetteten
    // Datensatz — die Datei sähe unverändert aus und wäre es nicht.
    const zugferdXml = await this.einvoice.renderForProfile(id, ZUGFERD_EN16931);
    const pdf = await this.toZugferd(rendered.bytes, zugferdXml, {
      number: invoice.number,
      invoiceDate: invoice.invoiceDate,
      sellerName: this.sellerNameOf(invoice.sellerSnapshot),
    });

    const staged = await this.documents.stage(
      pdf.bytes,
      invoice.numberYear,
      invoice.number,
      DOCUMENT_KIND.PDF,
      pdf.profile,
    );

    try {
      await this.prisma.$transaction(async (tx) => {
        // Nur die PDF-Zeile: Ein `deleteMany` über alle Dokumente nähme auch
        // die XML-Datei mit, die hier gar nicht neu entsteht — die Rechnung
        // behielte die Datei auf der Platte und verlöre ihren Nachweis.
        await tx.invoiceDocument.deleteMany({ where: { invoiceId: id, kind: DOCUMENT_KIND.PDF } });
        await tx.invoiceDocument.create({
          data: {
            invoiceId: id,
            path: staged.relativePath,
            sha256: staged.sha256,
            sizeBytes: staged.sizeBytes,
            einvoiceProfile: staged.einvoiceProfile,
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
      unitCode: item.unitCode as UnitCode,
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
      // Eine Rechnung hebt nichts auf.
      precedingInvoiceNumber: null,
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
