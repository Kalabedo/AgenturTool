import crypto from 'node:crypto';
import { Injectable } from '@nestjs/common';
import type { Invoice, InvoiceDocument, InvoiceItem } from '@prisma/client';
import yazl from 'yazl';
import {
  DOCUMENT_KIND,
  DOCUMENT_TYPE,
  DOCUMENT_TYPE_LABELS,
  INVOICE_STATUS_LABELS,
  TAX_ADVISOR_EXPORT_FORMAT_VERSION,
  buyerDataSchema,
  sellerSnapshotSchema,
  taxAdvisorExportFilename,
  taxSnapshotSchema,
  totalsSnapshotSchema,
  type BuyerData,
  type DocumentType,
  type InvoiceStatus,
  type SellerSnapshot,
  type TaxAdvisorExportManifest,
  type TaxAdvisorExportManifestFile,
  type TaxAdvisorExportPayload,
  type TaxAdvisorExportProblem,
  type TaxAdvisorExportSummary,
  type TaxSnapshot,
  type TotalsSnapshot,
} from '@agentur-tool/shared';
import { ApiError } from '../common/api-error';
import { PrismaService } from '../common/prisma.service';
import { InvoiceDocumentsService } from '../pdf/invoice-documents.service';

type ExportInvoice = Invoice & {
  items: InvoiceItem[];
  documents: InvoiceDocument[];
  cancelsInvoice: { number: string | null } | null;
  cancelledByInvoice: { number: string | null } | null;
};

interface ArchiveEntry {
  path: string;
  bytes: Buffer;
}

export interface TaxAdvisorArchive {
  filename: string;
  bytes: Buffer;
  manifest: TaxAdvisorExportManifest;
}

/**
 * Erstellt das handliche Übergabepaket für die Buchhaltung.
 *
 * Das ist absichtlich **kein DATEV-Buchungsstapel**. Dafür fehlen der
 * Anwendung Sach-/Debitorenkonten, Berater- und Mandantennummer und die mit
 * der Kanzlei vereinbarte Steuerschlüsselabbildung. Eine Datei mit DATEV im
 * Namen wäre daher gefährlicher als eine ehrliche, vollständige CSV.
 *
 * Die Zahlen stammen ausschließlich aus den eingefrorenen Snapshots. Stammdaten
 * von heute dürfen eine bereits ausgestellte Rechnung nie rückwirkend ändern.
 */
@Injectable()
export class TaxAdvisorExportService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly documents: InvoiceDocumentsService,
  ) {}

  /**
   * Prüft den gewählten Bestand, bevor ein Download beginnt.
   *
   * Die Prüfung liest die Belege wirklich und vergleicht ihre Hashes. Nur auf
   * vorhandene Datenbankzeilen zu schauen würde genau den Absturz-/Backupfall
   * übersehen, in dem ein Datensatz da ist, seine Datei aber nicht.
   */
  async preview(payload: TaxAdvisorExportPayload): Promise<TaxAdvisorExportSummary> {
    const invoices = await this.load(payload);
    const problems: TaxAdvisorExportProblem[] = [];
    let pdfs = 0;
    let xmls = 0;

    for (const invoice of invoices) {
      try {
        this.parse(invoice);
      } catch (error) {
        problems.push(toProblem(invoice, error));
      }

      if (!payload.includeDocuments) continue;

      const byKind = new Map<string, InvoiceDocument[]>();
      for (const document of invoice.documents) {
        if (document.kind !== DOCUMENT_KIND.PDF && document.kind !== DOCUMENT_KIND.XML) continue;
        const documents = byKind.get(document.kind) ?? [];
        documents.push(document);
        byKind.set(document.kind, documents);
      }

      if ((byKind.get(DOCUMENT_KIND.PDF)?.length ?? 0) === 0) {
        problems.push({
          invoiceId: invoice.id,
          invoiceNumber: invoice.number ?? String(invoice.id),
          message: 'Der PDF-Beleg fehlt.',
        });
      }

      for (const [kind, documents] of byKind) {
        if (documents.length > 1) {
          problems.push({
            invoiceId: invoice.id,
            invoiceNumber: invoice.number ?? String(invoice.id),
            message: `Es gibt mehr als einen ${kind}-Beleg.`,
          });
          continue;
        }

        const document = documents[0];
        if (document === undefined) continue;
        try {
          const bytes = await this.documents.read(document.path);
          if (sha256(bytes) !== document.sha256 || bytes.length !== document.sizeBytes) {
            problems.push({
              invoiceId: invoice.id,
              invoiceNumber: invoice.number ?? String(invoice.id),
              message: `${kind}-Beleg und gespeicherte Prüfsumme stimmen nicht überein.`,
            });
            continue;
          }
          if (kind === DOCUMENT_KIND.PDF) pdfs += 1;
          else xmls += 1;
        } catch (error) {
          problems.push(toProblem(invoice, error));
        }
      }
    }

    return {
      period: { from: payload.from, to: payload.to },
      ready: problems.length === 0,
      counts: {
        invoices: invoices.length,
        cancellations: invoices.filter(
          (invoice) => invoice.documentType === DOCUMENT_TYPE.CANCELLATION,
        ).length,
        pdfs,
        xmls,
      },
      problems,
    };
  }

  async create(payload: TaxAdvisorExportPayload, now = new Date()): Promise<TaxAdvisorArchive> {
    const invoices = await this.load(payload);

    const parsed = invoices.map((invoice) => this.parse(invoice));
    const entries: ArchiveEntry[] = [
      { path: 'README.txt', bytes: Buffer.from(readme(payload, invoices.length), 'utf8') },
      { path: 'rechnungen.csv', bytes: csvBuffer(invoiceCsv(parsed)) },
      { path: 'steueraufteilung.csv', bytes: csvBuffer(taxCsv(parsed)) },
      { path: 'positionen.csv', bytes: csvBuffer(itemCsv(parsed)) },
    ];

    let pdfs = 0;
    let xmls = 0;
    if (payload.includeDocuments) {
      for (const invoice of invoices) {
        const includedKinds = new Set<string>();
        for (const document of invoice.documents) {
          if (document.kind !== DOCUMENT_KIND.PDF && document.kind !== DOCUMENT_KIND.XML) continue;
          if (includedKinds.has(document.kind)) {
            throw ApiError.validation(
              `Zu Rechnung ${invoice.number ?? String(invoice.id)} gibt es mehr als einen ` +
                `${document.kind}-Beleg. Der Export wurde abgebrochen, damit keine Datei ` +
                'stillschweigend überschrieben wird.',
            );
          }
          includedKinds.add(document.kind);

          const bytes = await this.documents.read(document.path);
          const actualHash = sha256(bytes);
          if (actualHash !== document.sha256 || bytes.length !== document.sizeBytes) {
            throw ApiError.validation(
              `Der gespeicherte Beleg ${document.path} stimmt nicht mit seiner Prüfsumme überein. ` +
                'Der Export wurde abgebrochen, damit kein beschädigtes Paket weitergegeben wird.',
            );
          }

          const extension = document.kind === DOCUMENT_KIND.PDF ? 'pdf' : 'xml';
          const number = safeDocumentName(invoice.number ?? `rechnung-${String(invoice.id)}`);
          entries.push({ path: `belege/${number}.${extension}`, bytes });
          if (document.kind === DOCUMENT_KIND.PDF) pdfs += 1;
          else xmls += 1;
        }
        if (!includedKinds.has(DOCUMENT_KIND.PDF)) {
          throw ApiError.validation(
            `Zu Rechnung ${invoice.number ?? String(invoice.id)} fehlt der PDF-Beleg. ` +
              'Der Export wurde abgebrochen, damit kein unvollständiges Paket weitergegeben wird.',
          );
        }
      }
    }

    const files: TaxAdvisorExportManifestFile[] = entries.map((entry) => ({
      path: entry.path,
      sha256: sha256(entry.bytes),
      sizeBytes: entry.bytes.length,
    }));
    const manifest: TaxAdvisorExportManifest = {
      formatVersion: TAX_ADVISOR_EXPORT_FORMAT_VERSION,
      createdAt: now.toISOString(),
      period: { from: payload.from, to: payload.to },
      counts: {
        invoices: invoices.length,
        cancellations: invoices.filter(
          (invoice) => invoice.documentType === DOCUMENT_TYPE.CANCELLATION,
        ).length,
        pdfs,
        xmls,
      },
      files,
    };

    entries.push({
      path: 'manifest.json',
      bytes: Buffer.from(JSON.stringify(manifest, null, 2), 'utf8'),
    });

    return {
      filename: taxAdvisorExportFilename(payload.from, payload.to),
      bytes: await zip(entries),
      manifest,
    };
  }

  private load(payload: TaxAdvisorExportPayload): Promise<ExportInvoice[]> {
    return this.prisma.invoice.findMany({
      where: {
        number: { not: null },
        invoiceDate: { gte: payload.from, lte: payload.to },
      },
      orderBy: [{ invoiceDate: 'asc' }, { numberSeq: 'asc' }, { id: 'asc' }],
      include: {
        items: { orderBy: { position: 'asc' } },
        documents: { orderBy: { kind: 'asc' } },
        cancelsInvoice: { select: { number: true } },
        cancelledByInvoice: { select: { number: true } },
      },
    });
  }

  private parse(invoice: ExportInvoice): ParsedInvoice {
    if (
      invoice.number === null ||
      invoice.buyerData === null ||
      invoice.sellerSnapshot === null ||
      invoice.taxSnapshot === null ||
      invoice.totalsSnapshot === null
    ) {
      throw ApiError.validation(
        `Die eingefrorenen Daten der Rechnung ${invoice.number ?? String(invoice.id)} fehlen.`,
      );
    }

    try {
      return {
        invoice,
        buyer: buyerDataSchema.parse(JSON.parse(invoice.buyerData)),
        seller: sellerSnapshotSchema.parse(JSON.parse(invoice.sellerSnapshot)),
        tax: taxSnapshotSchema.parse(JSON.parse(invoice.taxSnapshot)),
        totals: totalsSnapshotSchema.parse(JSON.parse(invoice.totalsSnapshot)),
      };
    } catch {
      throw ApiError.validation(
        `Die eingefrorenen Daten der Rechnung ${invoice.number} sind beschädigt.`,
      );
    }
  }
}

interface ParsedInvoice {
  invoice: ExportInvoice;
  buyer: BuyerData;
  seller: SellerSnapshot;
  tax: TaxSnapshot;
  totals: TotalsSnapshot;
}

function toProblem(invoice: ExportInvoice, error: unknown): TaxAdvisorExportProblem {
  return {
    invoiceId: invoice.id,
    invoiceNumber: invoice.number ?? String(invoice.id),
    message: error instanceof Error ? error.message : 'Der Beleg konnte nicht geprüft werden.',
  };
}

function invoiceCsv(rows: ParsedInvoice[]): string[][] {
  return [
    [
      'Belegnummer',
      'Belegart',
      'Status',
      'Rechnungsdatum',
      'Leistungsdatum von',
      'Leistungsdatum bis',
      'Fällig am',
      'Bezahlt am',
      'Kundennummer',
      'Kunde',
      'USt-IdNr. Kunde',
      'Währung',
      'Netto',
      'Umsatzsteuer',
      'Brutto',
      'Steuerprofil',
      'Storniert durch',
      'Storniert Beleg',
      'Eigene USt-IdNr.',
      'Eigene Steuernummer',
    ],
    ...rows.map(({ invoice, buyer, seller, tax, totals }) => [
      invoice.number ?? '',
      DOCUMENT_TYPE_LABELS[invoice.documentType as DocumentType],
      INVOICE_STATUS_LABELS[invoice.status as InvoiceStatus],
      invoice.invoiceDate,
      invoice.serviceDate,
      invoice.serviceDateTo ?? '',
      invoice.dueDate,
      invoice.paidAt ?? '',
      safeSpreadsheetText(buyer.customerNumber),
      safeSpreadsheetText(buyer.companyName),
      safeSpreadsheetText(buyer.vatId),
      invoice.currency,
      decimalCents(totals.netCents),
      decimalCents(totals.taxCents),
      decimalCents(totals.grossCents),
      safeSpreadsheetText(tax.profileName),
      invoice.cancelledByInvoice?.number ?? '',
      invoice.cancelsInvoice?.number ?? '',
      safeSpreadsheetText(seller.vatId),
      safeSpreadsheetText(seller.taxNumber),
    ]),
  ];
}

function taxCsv(rows: ParsedInvoice[]): string[][] {
  return [
    ['Belegnummer', 'Rechnungsdatum', 'Steuerkategorie', 'Steuersatz %', 'Netto', 'Steuer'],
    ...rows.flatMap(({ invoice, tax, totals }) =>
      totals.taxGroups.map((group) => [
        invoice.number ?? '',
        invoice.invoiceDate,
        tax.taxCategoryCode,
        decimalBasisPoints(group.rateBasisPoints),
        decimalCents(group.netCents),
        decimalCents(group.taxCents),
      ]),
    ),
  ];
}

function itemCsv(rows: ParsedInvoice[]): string[][] {
  return [
    [
      'Belegnummer',
      'Position',
      'Beschreibung',
      'Menge',
      'Einheit',
      'Einheitencode',
      'Einzelpreis',
      'Rabatt',
      'Netto',
      'Steuersatz %',
    ],
    ...rows.flatMap(({ invoice }) =>
      invoice.items.map((item) => [
        invoice.number ?? '',
        String(item.position),
        safeSpreadsheetText(item.description),
        decimalScaled(item.quantity, 1000, 3),
        safeSpreadsheetText(item.unit),
        item.unitCode,
        decimalCents(item.unitPriceCents),
        decimalCents(item.lineDiscountCents),
        decimalCents(item.lineNetCents),
        decimalBasisPoints(item.taxRateBasisPoints),
      ]),
    ),
  ];
}

function csvBuffer(rows: string[][]): Buffer {
  const contents = rows.map((row) => row.map(csvCell).join(';')).join('\r\n') + '\r\n';
  // BOM: Excel unter Windows erkennt UTF-8 damit ohne Importdialog und lässt
  // Umlaute in Kunden- und Leistungsnamen unverändert.
  return Buffer.from(`\ufeff${contents}`, 'utf8');
}

function csvCell(value: string): string {
  return `"${value.replaceAll('"', '""')}"`;
}

/** Schützt frei eingegebenen Text beim Öffnen in Tabellenprogrammen vor Formeln. */
function safeSpreadsheetText(value: string | null): string {
  if (value === null) return '';
  return /^[\t\r\n ]*[=+\-@]/u.test(value) ? `'${value}` : value;
}

function decimalCents(value: number): string {
  return decimalScaled(value, 100, 2);
}

function decimalBasisPoints(value: number): string {
  return decimalScaled(value, 100, 2);
}

function decimalScaled(value: number, scale: number, fractionDigits: number): string {
  const sign = value < 0 ? '-' : '';
  const absolute = Math.abs(value);
  const whole = Math.floor(absolute / scale);
  const fraction = String(absolute % scale).padStart(fractionDigits, '0');
  return `${sign}${String(whole)},${fraction}`;
}

function safeDocumentName(number: string): string {
  return number.replace(/[^\p{L}\p{N}._ -]/gu, '_');
}

function sha256(bytes: Buffer): string {
  return crypto.createHash('sha256').update(bytes).digest('hex');
}

function readme(payload: TaxAdvisorExportPayload, count: number): string {
  return [
    'AgenturTool – Steuerberater-Paket',
    '',
    `Zeitraum (Rechnungsdatum, jeweils einschließlich): ${payload.from} bis ${payload.to}`,
    `Belege: ${String(count)}`,
    '',
    'rechnungen.csv enthält eine Zeile je Rechnung beziehungsweise Storno.',
    'steueraufteilung.csv enthält die Bemessungsgrundlage je Steuersatz.',
    'positionen.csv enthält die einzelnen Leistungspositionen.',
    payload.includeDocuments
      ? 'Unter belege/ liegen die unveränderten PDF- und vorhandenen XML-Dateien.'
      : 'Belegdateien wurden auf Wunsch nicht mit exportiert.',
    'manifest.json enthält Zeitraum, Zählerstände und SHA-256-Prüfsummen.',
    '',
    'CSV-Format: UTF-8 mit BOM, Semikolon als Trennzeichen, Dezimaltrennzeichen Komma.',
    '',
    'Wichtig: Dieses Paket ist kein DATEV-Buchungsstapel. Konten, Steuerschlüssel sowie',
    'Berater- und Mandantennummer müssen mit der Kanzlei vereinbart und dort zugeordnet werden.',
    '',
  ].join('\r\n');
}

async function zip(entries: ArchiveEntry[]): Promise<Buffer> {
  const archive = new yazl.ZipFile();
  for (const entry of entries) archive.addBuffer(entry.bytes, entry.path);
  archive.end();

  const chunks: Buffer[] = [];
  for await (const chunk of archive.outputStream) {
    chunks.push(Buffer.isBuffer(chunk) ? chunk : Buffer.from(chunk));
  }
  return Buffer.concat(chunks);
}
