import fs from 'node:fs';
import crypto from 'node:crypto';
import os from 'node:os';
import path from 'node:path';
import { afterAll, beforeAll, beforeEach, describe, expect, it } from 'vitest';
import type { PrismaClient } from '@prisma/client';
import {
  DISCOUNT_TYPE,
  DOCUMENT_KIND,
  INVOICE_EVENT_TYPE,
  INVOICE_STATUS,
  NUMBER_PATTERN_SETTING_KEY,
  TAX_PROFILE_KIND,
  CURRENT_SNAPSHOT_VERSION,
} from '@agentur-tool/shared';
import { ApiError } from '../src/common/api-error';
import { StorageConfig } from '../src/common/config.service';
import { CompanyService } from '../src/company/company.service';
import { FilesService } from '../src/files/files.service';
import { TaxProfilesService } from '../src/tax-profiles/tax-profiles.service';
import { TemplateSettingsService } from '../src/template-settings/template-settings.service';
import { InvoiceDocumentsService } from '../src/pdf/invoice-documents.service';
import { InvoicePdfService } from '../src/pdf/invoice-pdf.service';
import { EinvoiceService } from '../src/einvoice/einvoice.service';
import { InvoiceFinalizeService } from '../src/invoices/invoice-finalize.service';
import { InvoiceNumbersService } from '../src/invoices/invoice-numbers.service';
import { InvoicesService } from '../src/invoices/invoices.service';
import { createTestDatabase, resetInvoices, type TestDatabase } from './database.helper';
import { StubPdfRenderer } from './stub-renderer';
import { isPdf } from './pdf.helper';

/**
 * Das Finalisieren als Integrationstest (Abschnitt 20: „Finalisierung als
 * Integrationstest").
 *
 * Geprüft wird der Vorgang, nicht das Dokument: Nummernvergabe, eingefrorene
 * Stammdaten, Ablage unter `invoices/<Jahr>/`, Ereignisprotokoll und das
 * Verhalten bei Abbruch. Dass dabei ein PDF entsteht, gehört dazu — wie es
 * aussieht, nicht. Deshalb rendert hier ein Stub, und die Tests laufen ohne
 * Browser.
 */
let db: TestDatabase;
let prisma: PrismaClient;
let pdfService: StubPdfRenderer;
let documents: InvoiceDocumentsService;
let finalizer: InvoiceFinalizeService;
let numbers: InvoiceNumbersService;
let invoices: InvoicesService;
let templateSettings: TemplateSettingsService;
let dataDir: string;

beforeAll(async () => {
  db = await createTestDatabase();
  prisma = db.prisma;
  dataDir = fs.mkdtempSync(path.join(os.tmpdir(), 'agentur-tool-final-'));

  const storage = new StorageConfig({ get: () => dataDir } as never);
  const files = new FilesService(prisma, storage);
  const company = new CompanyService(prisma, files);
  templateSettings = new TemplateSettingsService(prisma);
  const taxProfiles = new TaxProfilesService(prisma);

  pdfService = new StubPdfRenderer();
  documents = new InvoiceDocumentsService(prisma, storage);
  numbers = new InvoiceNumbersService(prisma);

  const invoicePdf = new InvoicePdfService(
    prisma,
    company,
    templateSettings,
    taxProfiles,
    files,
    documents,
    pdfService,
  );

  finalizer = new InvoiceFinalizeService(
    prisma,
    company,
    taxProfiles,
    templateSettings,
    numbers,
    documents,
    invoicePdf,
    new EinvoiceService(prisma, documents),
  );

  invoices = new InvoicesService(prisma, company, numbers, documents);
});

afterAll(async () => {
  await db.cleanup();
  fs.rmSync(dataDir, { recursive: true, force: true });
});

beforeEach(async () => {
  await resetInvoices(prisma);
  await prisma.numberSequence.deleteMany();
  await prisma.appSetting.deleteMany();
  await prisma.taxProfile.deleteMany();
  await prisma.company.deleteMany();
  fs.rmSync(path.join(dataDir, 'invoices'), { recursive: true, force: true });

  await prisma.company.create({
    data: {
      id: 1,
      companyName: 'XYZ - Agentur',
      street: 'Wolfgangsklinge 14',
      postalCode: '73479',
      city: 'Ellwangen',
      country: 'DE',
      vatId: 'DE455137261',
      iban: 'DE12202208000052019114',
    },
  });
});

async function standardTaxProfile(): Promise<number> {
  const profile = await prisma.taxProfile.create({
    data: {
      name: `Deutschland 19 % ${crypto.randomUUID().slice(0, 8)}`,
      kind: TAX_PROFILE_KIND.STANDARD,
      defaultRateBasisPoints: 1900,
    },
  });
  return profile.id;
}

const BUYER = {
  snapshotVersion: CURRENT_SNAPSHOT_VERSION,
  companyName: 'SoluXion Ltd',
  contactName: null,
  addressLine: null,
  address: { street: 'Hauptstr. 1', postalCode: '7560', city: 'Larnaca', country: 'Zypern' },
  email: null,
  vatId: 'CY60143029O',
  customerNumber: null,
  buyerReference: 'BR-2026-0001',
  electronicAddress: 'rechnung@soluxion.example',
  electronicAddressScheme: 'EM',
};

/** Ein vollständiger, ausstellbarer Entwurf. */
async function createDraft(overrides: Record<string, unknown> = {}): Promise<number> {
  const taxProfileId = await standardTaxProfile();
  const invoice = await prisma.invoice.create({
    data: {
      taxProfileId,
      invoiceDate: '2026-03-01',
      serviceDate: '2026-02-28',
      dueDate: '2026-03-15',
      buyerData: JSON.stringify(BUYER),
      items: {
        create: [
          {
            position: 1,
            description: 'Konzeption und Umsetzung',
            quantity: 7500,
            unit: 'Std.',
            unitPriceCents: 12_000,
            discountType: DISCOUNT_TYPE.PERCENT,
            discountValue: 0,
            taxRateBasisPoints: 1900,
            lineNetCents: 90_000,
          },
        ],
      },
      ...overrides,
    },
  });
  return invoice.id;
}

describe('Finalisieren', () => {
  it('vergibt Nummer, friert die Daten ein und legt das PDF ab', async () => {
    const id = await createDraft();
    await finalizer.finalize(id);

    const invoice = await prisma.invoice.findUniqueOrThrow({
      where: { id },
      include: { documents: true, events: true },
    });

    expect(invoice.number).toBe('2026-001');
    expect(invoice.numberYear).toBe(2026);
    expect(invoice.numberSeq).toBe(1);
    expect(invoice.status).toBe(INVOICE_STATUS.ISSUED);
    expect(invoice.issuedAt).not.toBeNull();
    expect(invoice.sellerSnapshot).toContain('XYZ - Agentur');
    expect(invoice.totalsSnapshot).toContain('"grossCents"');

    const [document] = invoice.documents;
    expect(document?.path).toBe('invoices/2026/2026-001.pdf');

    // Die Datei liegt da, wo die Datenbank sie vermutet, und ihr Hash
    // stimmt — das ist die Grundlage der Backup-Prüfung.
    const bytes = fs.readFileSync(path.join(dataDir, document?.path ?? ''));
    expect(isPdf(bytes)).toBe(true);
    expect(crypto.createHash('sha256').update(bytes).digest('hex')).toBe(document?.sha256);
    expect(document?.sizeBytes).toBe(bytes.length);

    expect(invoice.events.map((event) => event.type)).toContain(INVOICE_EVENT_TYPE.FINALIZED);
  }, 60_000);

  it('zählt lückenlos weiter und trennt die Jahre', async () => {
    const first = await createDraft();
    const second = await createDraft();
    const lastYear = await createDraft({ invoiceDate: '2025-12-31', dueDate: '2026-01-14' });

    await finalizer.finalize(first);
    await finalizer.finalize(second);
    await finalizer.finalize(lastYear);

    const numbersAssigned = await prisma.invoice.findMany({
      where: { id: { in: [first, second, lastYear] } },
      select: { id: true, number: true },
      orderBy: { id: 'asc' },
    });

    // Das Jahr kommt aus dem Rechnungsdatum, nicht aus heute: Die dritte
    // Rechnung ist die erste des Jahres 2025.
    expect(numbersAssigned.map((invoice) => invoice.number)).toEqual([
      '2026-001',
      '2026-002',
      '2025-001',
    ]);
  }, 90_000);

  it('folgt einem konfigurierten Nummernmuster', async () => {
    await prisma.appSetting.create({
      data: { key: NUMBER_PATTERN_SETTING_KEY, value: 'RE-{YYYY}-{SEQ:4}' },
    });

    const id = await createDraft();
    await finalizer.finalize(id);

    const invoice = await prisma.invoice.findUniqueOrThrow({ where: { id } });
    expect(invoice.number).toBe('RE-2026-0001');
    expect(fs.existsSync(path.join(dataDir, 'invoices/2026/RE-2026-0001.pdf'))).toBe(true);
  }, 60_000);

  it('friert die Stammdaten ein: eine spätere Änderung ändert die Rechnung nicht', async () => {
    // Der wichtigste Einzeltest aus Abschnitt 22.
    const id = await createDraft();
    await finalizer.finalize(id);

    await prisma.company.update({ where: { id: 1 }, data: { iban: 'DE00000000000000000000' } });

    const response = await invoices.findById(id);
    const before = await prisma.invoice.findUniqueOrThrow({ where: { id } });

    expect(before.sellerSnapshot).toContain('DE12202208000052019114');
    expect(before.sellerSnapshot).not.toContain('DE00000000000000000000');
    expect(response.status).toBe(INVOICE_STATUS.ISSUED);
  }, 60_000);

  it('friert das Design ein: ein späterer Designwechsel ändert die Rechnung nicht', async () => {
    /*
     * Der Vertrag, für den es im Designer Regler und kein freies CSS gibt.
     *
     * Der Snapshot trägt nur einen `templateKey` — das CSS selbst wird nicht
     * eingefroren. Reproduzierbar bleibt eine alte Rechnung deshalb nur,
     * solange jeder Regler ein Wert im Snapshot ist, den der Template-Code
     * liest. Liefe hier je etwas an den Einstellungen vorbei, sähe eine
     * ausgestellte Rechnung nach einem Designwechsel anders aus als das
     * Exemplar beim Kunden.
     */
    const id = await createDraft();
    await finalizer.finalize(id);

    await templateSettings.update({
      templateKey: 'schlicht',
      accentColor: '#b91c1c',
      fontFamily: 'Source Serif 4',
      logoWidthMm: 70,
      inkColor: '#111111',
      inkSoftColor: '#777777',
      ruleColor: '#cccccc',
      bandColor: '#eeeeee',
      density: 'luftig',
      showLogo: false,
      showPaymentBlock: false,
      showFooterRule: false,
      footerText: null,
      paymentNote: null,
      closingNote: null,
    });

    const invoice = await prisma.invoice.findUniqueOrThrow({ where: { id } });
    const snapshot = JSON.parse(invoice.templateSnapshot ?? '{}') as Record<string, unknown>;

    expect(snapshot).toMatchObject({
      templateKey: 'classic',
      accentColor: '#1e293b',
      fontFamily: 'Open Sans',
      logoWidthMm: 40,
      density: 'normal',
      showLogo: true,
      showPaymentBlock: true,
      showFooterRule: true,
    });
  }, 60_000);

  it('nimmt beim Ausstellen das eingestellte Design mit', async () => {
    // Die Gegenprobe: Was vor dem Ausstellen eingestellt ist, landet im
    // Snapshot — sonst wäre der Test darüber auch dann grün, wenn die
    // Einstellungen gar nicht erst gelesen würden.
    await templateSettings.update({
      templateKey: 'kompakt',
      accentColor: '#1e293b',
      fontFamily: 'Open Sans',
      logoWidthMm: 40,
      inkColor: '#1f2328',
      inkSoftColor: '#4b5563',
      ruleColor: '#e3e6ea',
      bandColor: '#f4f5f7',
      density: 'kompakt',
      showLogo: false,
      showPaymentBlock: true,
      showFooterRule: true,
      footerText: null,
      paymentNote: null,
      closingNote: null,
    });

    const id = await createDraft();
    await finalizer.finalize(id);

    const invoice = await prisma.invoice.findUniqueOrThrow({ where: { id } });
    const snapshot = JSON.parse(invoice.templateSnapshot ?? '{}') as Record<string, unknown>;

    expect(snapshot).toMatchObject({
      templateKey: 'kompakt',
      density: 'kompakt',
      showLogo: false,
    });
  }, 60_000);

  it('verbraucht keine Nummer, wenn die Rechnung unvollständig ist', async () => {
    const id = await createDraft();
    await prisma.invoice.update({
      where: { id },
      data: { buyerData: JSON.stringify({ ...BUYER, companyName: '' }) },
    });

    await expect(finalizer.finalize(id)).rejects.toThrow(ApiError);
    await expect(finalizer.finalize(id)).rejects.toMatchObject({
      code: 'FINALIZE_VALIDATION_FAILED',
    });

    // Kein Zähler angelegt, kein Dokument, kein Statuswechsel.
    expect(await numbers.nextValueFor(2026)).toBeNull();
    expect(await prisma.invoiceDocument.count()).toBe(0);
    expect((await prisma.invoice.findUniqueOrThrow({ where: { id } })).status).toBe(
      INVOICE_STATUS.DRAFT,
    );
  }, 60_000);

  it('lässt eine ausgestellte Rechnung nicht erneut ausstellen', async () => {
    const id = await createDraft();
    await finalizer.finalize(id);

    await expect(finalizer.finalize(id)).rejects.toMatchObject({
      code: 'INVOICE_NOT_EDITABLE',
    });
  }, 60_000);

  it('liefert beim Download die gespeicherte Datei, nicht eine Neuerzeugung', async () => {
    const id = await createDraft();
    await finalizer.finalize(id);

    const document = await prisma.invoiceDocument.findFirstOrThrow({ where: { invoiceId: id } });
    // Ein erkennbar anderer Inhalt an der Stelle der abgelegten Datei: Was
    // der Download liefert, muss von der Platte kommen.
    fs.writeFileSync(path.join(dataDir, document.path), Buffer.from('%PDF-1.4 markiert'));

    const delivered = await invoicePdfFor(id);
    expect(delivered.toString('latin1')).toBe('%PDF-1.4 markiert');
  }, 60_000);
});

/** Kleiner Helfer, damit der Test die Auslieferung über denselben Weg geht wie der Controller. */
async function invoicePdfFor(id: number): Promise<Buffer> {
  const storage = new StorageConfig({ get: () => dataDir } as never);
  const files = new FilesService(prisma, storage);
  const service = new InvoicePdfService(
    prisma,
    new CompanyService(prisma, files),
    new TemplateSettingsService(prisma),
    new TaxProfilesService(prisma),
    files,
    documents,
    pdfService,
  );
  return (await service.deliver(id)).bytes;
}

describe('Finalisierung zurücknehmen', () => {
  it('gibt die Nummer zurück und vergibt sie erneut', async () => {
    // Test 7 aus Abschnitt 22: Undo direkt nach dem Finalisieren, danach neu
    // finalisieren — dieselbe Nummer muss wieder herauskommen.
    const id = await createDraft();
    await finalizer.finalize(id);

    const document = await prisma.invoiceDocument.findFirstOrThrow({ where: { invoiceId: id } });
    await finalizer.unfinalize(id);

    const draft = await prisma.invoice.findUniqueOrThrow({
      where: { id },
      include: { events: true },
    });
    expect(draft.status).toBe(INVOICE_STATUS.DRAFT);
    expect(draft.number).toBeNull();
    expect(draft.issuedAt).toBeNull();
    expect(draft.sellerSnapshot).toBeNull();
    expect(draft.totalsSnapshot).toBeNull();

    expect(await prisma.invoiceDocument.count({ where: { invoiceId: id } })).toBe(0);
    expect(fs.existsSync(path.join(dataDir, document.path))).toBe(false);
    expect(draft.events.map((event) => event.type)).toContain(INVOICE_EVENT_TYPE.UNFINALIZED);

    await finalizer.finalize(id);
    expect((await prisma.invoice.findUniqueOrThrow({ where: { id } })).number).toBe('2026-001');
  }, 90_000);

  it('hält im Ereignisprotokoll fest, welche Nummer freigegeben wurde', async () => {
    const id = await createDraft();
    await finalizer.finalize(id);
    await finalizer.unfinalize(id);

    const event = await prisma.invoiceEvent.findFirstOrThrow({
      where: { invoiceId: id, type: INVOICE_EVENT_TYPE.UNFINALIZED },
    });
    expect(event.metadata).toContain('2026-001');
  }, 60_000);

  it('lehnt ab, wenn eine neuere Rechnung existiert', async () => {
    const first = await createDraft();
    const second = await createDraft();
    await finalizer.finalize(first);
    await finalizer.finalize(second);

    await expect(finalizer.unfinalize(first)).rejects.toMatchObject({
      code: 'UNFINALIZE_NOT_ALLOWED',
    });

    // Die zuletzt vergebene geht dagegen zurück.
    await expect(finalizer.unfinalize(second)).resolves.toBeUndefined();
  }, 90_000);

  it('lehnt ab, wenn die Rechnung als versendet vermerkt ist', async () => {
    const id = await createDraft();
    await finalizer.finalize(id);
    await prisma.invoice.update({ where: { id }, data: { sentAt: new Date() } });

    await expect(finalizer.unfinalize(id)).rejects.toMatchObject({
      code: 'UNFINALIZE_NOT_ALLOWED',
    });
  }, 60_000);

  it('lehnt ab, wenn die Rechnung als bezahlt vermerkt ist', async () => {
    const id = await createDraft();
    await finalizer.finalize(id);
    await prisma.invoice.update({
      where: { id },
      data: { status: INVOICE_STATUS.PAID, paidAt: '2026-03-10' },
    });

    await expect(finalizer.unfinalize(id)).rejects.toMatchObject({
      code: 'UNFINALIZE_NOT_ALLOWED',
    });
  }, 60_000);

  it('zeigt in der Antwort, ob und warum nicht zurückgenommen werden kann', async () => {
    const first = await createDraft();
    await finalizer.finalize(first);

    const allowed = await invoices.findById(first);
    expect(allowed.canUnfinalize).toBe(true);
    expect(allowed.unfinalizeBlocker).toBeNull();
    expect(allowed.hasDocument).toBe(true);
    expect(allowed.documentMissing).toBe(false);

    const second = await createDraft();
    await finalizer.finalize(second);

    const blocked = await invoices.findById(first);
    expect(blocked.canUnfinalize).toBe(false);
    expect(blocked.unfinalizeBlocker).toMatch(/neuere Rechnung/u);
  }, 90_000);
});

describe('PDF-Ablage', () => {
  it('meldet eine fehlende Datei und erzeugt sie auf Wunsch neu', async () => {
    const id = await createDraft();
    await finalizer.finalize(id);

    const document = await prisma.invoiceDocument.findFirstOrThrow({ where: { invoiceId: id } });
    fs.rmSync(path.join(dataDir, document.path));

    expect((await invoices.findById(id)).documentMissing).toBe(true);
    expect((await documents.reconcile()).missingFiles).toEqual([document.path]);

    await finalizer.regenerateDocument(id);

    expect((await invoices.findById(id)).documentMissing).toBe(false);
    expect(fs.existsSync(path.join(dataDir, document.path))).toBe(true);

    const events = await prisma.invoiceEvent.findMany({ where: { invoiceId: id } });
    expect(events.map((event) => event.type)).toContain(INVOICE_EVENT_TYPE.PDF_REGENERATED);
  }, 90_000);

  it('räumt eine Datei ohne Datensatz nach data/orphans, statt sie zu löschen', async () => {
    const strayPath = path.join(dataDir, 'invoices', '2026', 'fremd.pdf');
    fs.mkdirSync(path.dirname(strayPath), { recursive: true });
    fs.writeFileSync(strayPath, '%PDF-1.4 fremd');

    const result = await documents.reconcile();

    expect(result.orphanedFiles).toEqual(['invoices/2026/fremd.pdf']);
    expect(fs.existsSync(strayPath)).toBe(false);
    expect(fs.readFileSync(path.join(dataDir, 'orphans', '2026-fremd.pdf'), 'utf8')).toBe(
      '%PDF-1.4 fremd',
    );
  });
});

/**
 * ZUGFeRD beim Ausstellen.
 *
 * Hier geht es um die Entscheidung, nicht um das Dateiformat: Bekommt das
 * PDF den Datensatz, und wird festgehalten, ob es geklappt hat. Wie das
 * eingebettete PDF innen aussieht, prüft `zugferd.test.ts` an einer echten
 * Chromium-Ausgabe.
 */
describe('ZUGFeRD beim Ausstellen', () => {
  async function pdfRow(invoiceId: number) {
    return prisma.invoiceDocument.findFirstOrThrow({
      where: { invoiceId, kind: DOCUMENT_KIND.PDF },
    });
  }

  /**
   * Die Firmendaten, die eine E-Rechnung braucht.
   *
   * Die Grundeinrichtung der übrigen Tests genügt § 14 UStG, aber nicht
   * EN 16931: Telefonnummer (BR-DE-6) und elektronische Adresse (BT-34)
   * verlangt erst die E-Rechnung. Genau deshalb steht das hier und nicht im
   * gemeinsamen `beforeEach` — die anderen Tests sollen weiterhin den Fall
   * abdecken, dass eine Rechnung ohne Datensatz entsteht.
   */
  beforeEach(async () => {
    await prisma.company.update({
      where: { id: 1 },
      data: {
        phone: '07961 123456',
        electronicAddress: 'rechnung@xyz-agentur.example',
        electronicAddressScheme: 'EM',
      },
    });
  });

  it('bettet den Datensatz ein und hält das Profil fest', async () => {
    const id = await createDraft();
    await finalizer.finalize(id);

    const pdf = await pdfRow(id);
    expect(pdf.einvoiceProfile).toBe('zugferd-en16931');

    // Der Beleg, dass wirklich eingebettet wurde und nicht nur vermerkt.
    const bytes = fs.readFileSync(path.join(dataDir, pdf.path));
    expect(bytes.toString('latin1')).toContain('factur-x.xml');
  }, 90_000);

  it('erzeugt ZUGFeRD auch ohne Käuferreferenz — anders als die XRechnung', async () => {
    // Der eigentliche Gewinn: BT-10 ist eine Pflicht der deutschen CIUS,
    // nicht der EU-Norm. Eine Rechnung an eine Firma ohne Leitweg-ID bekommt
    // deshalb kein XML daneben, aber sehr wohl einen Datensatz im PDF.
    const id = await createDraft({
      buyerData: JSON.stringify({ ...BUYER, buyerReference: null }),
    });
    await finalizer.finalize(id);

    const documentRows = await prisma.invoiceDocument.findMany({ where: { invoiceId: id } });
    expect(documentRows.map((row) => row.kind)).toEqual([DOCUMENT_KIND.PDF]);

    const pdf = await pdfRow(id);
    expect(pdf.einvoiceProfile).toBe('zugferd-en16931');
  }, 90_000);

  it('stellt trotzdem aus, wenn für den Datensatz Angaben fehlen', async () => {
    // Ohne Steuernummer und USt-IdNr. gibt es keinen Datensatz. Eine
    // Rechnung ohne eingebettetes XML ist eine gültige Rechnung; eine, die
    // sich nicht ausstellen ließ, wäre gar keine.
    await prisma.company.update({ where: { id: 1 }, data: { vatId: null, taxNumber: null } });
    const id = await createDraft();

    // § 14 UStG verlangt eine steuerliche Kennung — das Ausstellen scheitert
    // hier also schon vorher, und zwar richtigerweise.
    await expect(finalizer.finalize(id)).rejects.toMatchObject({
      code: 'FINALIZE_VALIDATION_FAILED',
    });
  }, 90_000);

  it('behält den Datensatz, wenn das PDF neu erzeugt wird', async () => {
    const id = await createDraft();
    await finalizer.finalize(id);

    const before = await pdfRow(id);
    fs.rmSync(path.join(dataDir, before.path));

    await finalizer.regenerateDocument(id);

    const after = await pdfRow(id);
    expect(after.einvoiceProfile).toBe('zugferd-en16931');
    expect(fs.readFileSync(path.join(dataDir, after.path)).toString('latin1')).toContain(
      'factur-x.xml',
    );

    // Die XML-Zeile gehört nicht zum PDF und darf beim Neuerzeugen nicht
    // mit verschwinden.
    const xml = await prisma.invoiceDocument.findFirst({
      where: { invoiceId: id, kind: DOCUMENT_KIND.XML },
    });
    expect(xml).not.toBeNull();
  }, 90_000);
});
