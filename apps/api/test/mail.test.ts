import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { afterAll, beforeAll, beforeEach, describe, expect, it, vi } from 'vitest';
import type { PrismaClient } from '@prisma/client';
import {
  CURRENT_SNAPSHOT_VERSION,
  DISCOUNT_TYPE,
  INVOICE_EVENT_TYPE,
  MAIL_ATTACHMENT_KIND,
  MAIL_HANDOFF_METHOD,
  MAIL_SECURITY,
  MAIL_STATUS,
  MAIL_TEMPLATE_DEFAULTS,
  MAIL_TEMPLATE_KEY,
  MAIL_TRANSPORT,
  TAX_PROFILE_KIND,
} from '@agentur-tool/shared';
import { StorageConfig } from '../src/common/config.service';
import { CompanyService } from '../src/company/company.service';
import { CustomersService } from '../src/customers/customers.service';
import { FilesService } from '../src/files/files.service';
import { TaxProfilesService } from '../src/tax-profiles/tax-profiles.service';
import { TemplateSettingsService } from '../src/template-settings/template-settings.service';
import { InvoiceDocumentsService } from '../src/pdf/invoice-documents.service';
import { InvoicePdfService } from '../src/pdf/invoice-pdf.service';
import { TimeReportService } from '../src/pdf/time-report.service';
import { InvoiceFinalizeService } from '../src/invoices/invoice-finalize.service';
import { InvoiceNumbersService } from '../src/invoices/invoice-numbers.service';
import { InvoicesService } from '../src/invoices/invoices.service';
import { EinvoiceService } from '../src/einvoice/einvoice.service';
import { TimeEntriesService } from '../src/time-entries/time-entries.service';
import { MailComposerService } from '../src/mail/mail-composer.service';
import type { MailDraft, MailHandoff } from '../src/mail/mail-handoff';
import { MailSenderService, type OutgoingMail } from '../src/mail/mail-sender.service';
import { MailSettingsService, type ResolvedMailSettings } from '../src/mail/mail-settings.service';
import { MailTemplatesService } from '../src/mail/mail-templates.service';
import { MailService } from '../src/mail/mail.service';
import type { SecretStore } from '../src/mail/secret-store';
import { createTestDatabase, resetInvoices, type TestDatabase } from './database.helper';
import { StubPdfRenderer } from './stub-renderer';

/**
 * Der E-Mail-Versand als Integrationstest.
 *
 * Geprüft wird die Buchführung, nicht das SMTP-Protokoll: Der Sender ist
 * ausgetauscht, weil ein echter Mailserver im Test nichts beweist, was
 * nodemailer nicht schon beweist. Was hier zählt, sind die Zusagen, die
 * diese Anwendung darüber hinaus macht — dass ein Versand protokolliert
 * wird, auch wenn er scheitert; dass ein Versandvermerk nur dort entsteht,
 * wo er gedeckt ist; und dass das SMTP-Passwort weder in einer Antwort noch
 * in einem Backup auftaucht.
 */
let db: TestDatabase;
let prisma: PrismaClient;
let dataDir: string;

let settings: MailSettingsService;
let templates: MailTemplatesService;
let composer: MailComposerService;
let mail: MailService;
let finalizer: InvoiceFinalizeService;
let invoices: InvoicesService;

/**
 * Ein Sender, der nichts verschickt, sich aber merkt, was er bekommen hat.
 *
 * Abgeleitet statt nachgebaut: Nur `send` und `verify` gehen ins Netz und
 * werden ersetzt. `buildMessageFile` bleibt das Original — die Nachricht,
 * die der Test anschließend aus der `.eml` liest, ist damit genau die, die
 * im Betrieb entsteht.
 */
class FakeSender extends MailSenderService {
  sent: OutgoingMail[] = [];
  failWith: Error | null = null;
  verifyFailWith: Error | null = null;

  override send(_settings: ResolvedMailSettings, outgoing: OutgoingMail): Promise<void> {
    if (this.failWith !== null) return Promise.reject(this.failWith);
    this.sent.push(outgoing);
    return Promise.resolve();
  }

  override verify(): Promise<void> {
    return this.verifyFailWith === null ? Promise.resolve() : Promise.reject(this.verifyFailWith);
  }
}

/**
 * Eine Mail-Anwendung, die sich merkt, was sie bekommen hat.
 *
 * `canOpenDraft` schaltet zwischen den beiden Wegen um — dem echten Entwurf
 * und der Nachrichtendatei —, weil genau dieser Unterschied davon abhängt,
 * welches Programm auf dem Rechner steht.
 */
class FakeHandoff implements MailHandoff {
  canOpenDraft = false;
  drafts: MailDraft[] = [];
  openedMessages: string[] = [];

  openDraft(draft: MailDraft): Promise<boolean> {
    if (!this.canOpenDraft) return Promise.resolve(false);

    this.drafts.push(draft);
    return Promise.resolve(true);
  }

  openMessage(filePath: string): Promise<void> {
    this.openedMessages.push(filePath);
    return Promise.resolve();
  }

  applicationName(): string | null {
    return this.canOpenDraft ? 'Mail' : 'Microsoft Outlook';
  }
}

let sender: FakeSender;
let handoff: FakeHandoff;

beforeAll(async () => {
  db = await createTestDatabase();
  prisma = db.prisma;
  dataDir = fs.mkdtempSync(path.join(os.tmpdir(), 'agentur-tool-mail-'));

  const storage = new StorageConfig({ get: () => dataDir } as never);
  const files = new FilesService(prisma, storage);
  const company = new CompanyService(prisma, files);
  const templateSettings = new TemplateSettingsService(prisma);
  const taxProfiles = new TaxProfilesService(prisma);
  const documents = new InvoiceDocumentsService(prisma, storage);
  const renderer = new StubPdfRenderer();

  const invoicePdf = new InvoicePdfService(
    prisma,
    company,
    templateSettings,
    taxProfiles,
    files,
    documents,
    renderer,
  );

  invoices = new InvoicesService(prisma, company, new InvoiceNumbersService(prisma), documents);
  finalizer = new InvoiceFinalizeService(
    prisma,
    company,
    taxProfiles,
    templateSettings,
    new InvoiceNumbersService(prisma),
    documents,
    invoicePdf,
  );

  settings = new MailSettingsService(prisma, storage);
  templates = new MailTemplatesService(prisma);
  composer = new MailComposerService(
    invoices,
    company,
    new CustomersService(prisma),
    templates,
    settings,
    invoicePdf,
    new EinvoiceService(prisma, documents),
    new TimeEntriesService(prisma),
    new TimeReportService(company, renderer),
  );

  sender = new FakeSender();
  handoff = new FakeHandoff();
  mail = new MailService(prisma, settings, composer, sender, storage, handoff);
});

afterAll(async () => {
  await db.cleanup();
  fs.rmSync(dataDir, { recursive: true, force: true });
});

beforeEach(async () => {
  await resetInvoices(prisma);
  await prisma.mailMessage.deleteMany();
  await prisma.mailTemplate.deleteMany();
  await prisma.mailSettings.deleteMany();
  await prisma.numberSequence.deleteMany();
  await prisma.timeEntry.deleteMany();
  await prisma.customer.deleteMany();
  await prisma.taxProfile.deleteMany();
  await prisma.company.deleteMany();
  fs.rmSync(path.join(dataDir, 'invoices'), { recursive: true, force: true });
  fs.rmSync(path.join(dataDir, 'mail-anhaenge'), { recursive: true, force: true });

  sender.sent = [];
  sender.failWith = null;
  sender.verifyFailWith = null;
  handoff.canOpenDraft = false;
  handoff.drafts = [];
  handoff.openedMessages = [];

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
      phone: '+49 7961 1234567',
      email: 'hello@xyz-agentur.de',
      electronicAddress: 'rechnung@xyz-agentur.de',
      electronicAddressScheme: 'EM',
    },
  });
});

const BUYER = {
  snapshotVersion: CURRENT_SNAPSHOT_VERSION,
  companyName: 'SoluXion Ltd',
  contactName: 'Frau Meyer',
  addressLine: null,
  address: { street: 'Hauptstr. 1', postalCode: '7560', city: 'Larnaca', country: 'Zypern' },
  email: 'rechnung@soluxion.example',
  vatId: 'CY60143029O',
  customerNumber: null,
  buyerReference: 'BR-2026-0001',
  electronicAddress: 'rechnung@soluxion.example',
  electronicAddressScheme: 'EM',
};

async function issuedInvoice(buyer: Record<string, unknown> = BUYER): Promise<number> {
  const profile = await prisma.taxProfile.create({
    data: {
      name: 'Deutschland 19 %',
      kind: TAX_PROFILE_KIND.STANDARD,
      defaultRateBasisPoints: 1900,
      taxCategoryCode: 'S',
    },
  });

  const invoice = await prisma.invoice.create({
    data: {
      taxProfileId: profile.id,
      invoiceDate: '2026-03-01',
      serviceDate: '2026-02-01',
      serviceDateTo: '2026-02-28',
      dueDate: '2026-03-15',
      buyerData: JSON.stringify(buyer),
      items: {
        create: [
          {
            position: 1,
            description: 'Beratung',
            quantity: 7500,
            unit: 'Std.',
            unitCode: 'HUR',
            unitPriceCents: 12000,
            discountType: DISCOUNT_TYPE.PERCENT,
            discountValue: 0,
            taxRateBasisPoints: 1900,
            lineDiscountCents: 0,
            lineNetCents: 90000,
          },
        ],
      },
    },
  });

  await finalizer.finalize(invoice.id);
  return invoice.id;
}

/** Richtet den SMTP-Versand vollständig ein. */
async function setUpSmtp(): Promise<void> {
  await settings.update({
    transport: MAIL_TRANSPORT.SMTP,
    fromName: 'XYZ - Agentur',
    fromAddress: 'rechnung@xyz-agentur.de',
    replyTo: null,
    bccSelf: false,
    host: 'mail.xyz-agentur.de',
    port: 587,
    security: MAIL_SECURITY.STARTTLS,
    username: 'rechnung@xyz-agentur.de',
    password: 'geheim',
  });
}

async function setUpMailApp(): Promise<void> {
  await settings.update({
    transport: MAIL_TRANSPORT.MAIL_APP,
    fromName: null,
    fromAddress: 'rechnung@xyz-agentur.de',
    replyTo: null,
    bccSelf: false,
    host: null,
    port: null,
    security: MAIL_SECURITY.STARTTLS,
    username: null,
  });
}

describe('Einrichtung des Versandwegs', () => {
  it('beginnt ohne Versandweg und sagt das als Grund', async () => {
    const current = await settings.get();

    expect(current.transport).toBe(MAIL_TRANSPORT.NONE);
    expect(current.ready).toBe(false);
    expect(current.problems).toEqual(['Es ist noch kein Versandweg eingerichtet.']);
  });

  it('gibt das Passwort nie heraus, meldet aber, dass eines da ist', async () => {
    await setUpSmtp();
    const current = await settings.get();

    expect(current.hasPassword).toBe(true);
    expect(current.passwordReadable).toBe(true);
    expect(current.ready).toBe(true);
    // Der eigentliche Punkt: Nirgends in der Antwort steht das Passwort.
    expect(JSON.stringify(current)).not.toContain('geheim');
  });

  it('legt das Passwort verschlüsselt ab, nicht im Klartext', async () => {
    await setUpSmtp();
    const row = await prisma.mailSettings.findUniqueOrThrow({ where: { id: 1 } });

    expect(row.passwordSecret).not.toBeNull();
    expect(row.passwordSecret).not.toContain('geheim');
    expect(row.passwordSecret).toMatch(/^file:/u);
  });

  it('behält das Passwort, wenn beim Speichern keines mitkommt', async () => {
    await setUpSmtp();
    const before = await prisma.mailSettings.findUniqueOrThrow({ where: { id: 1 } });

    // Der Alltagsfall: Jemand ändert den Absendernamen und speichert.
    await settings.update({
      transport: MAIL_TRANSPORT.SMTP,
      fromName: 'XYZ',
      fromAddress: 'rechnung@xyz-agentur.de',
      replyTo: null,
      bccSelf: false,
      host: 'mail.xyz-agentur.de',
      port: 587,
      security: MAIL_SECURITY.STARTTLS,
      username: 'rechnung@xyz-agentur.de',
    });

    const after = await prisma.mailSettings.findUniqueOrThrow({ where: { id: 1 } });
    expect(after.passwordSecret).toBe(before.passwordSecret);
    expect((await settings.get()).hasPassword).toBe(true);
  });

  it('entfernt das Passwort bei einer leeren Eingabe', async () => {
    await setUpSmtp();
    await settings.update({
      transport: MAIL_TRANSPORT.SMTP,
      fromName: null,
      fromAddress: 'rechnung@xyz-agentur.de',
      replyTo: null,
      bccSelf: false,
      host: 'mail.xyz-agentur.de',
      port: 587,
      security: MAIL_SECURITY.STARTTLS,
      username: 'rechnung@xyz-agentur.de',
      password: '',
    });

    const current = await settings.get();
    expect(current.hasPassword).toBe(false);
    expect(current.problems).toContain('Zum Benutzernamen fehlt das Passwort.');
  });

  it('erkennt ein Passwort, das von einem anderen Rechner stammt', async () => {
    // Genau die Lage nach einem eingespielten Backup: Die Zeile ist da, der
    // Schlüssel nicht. Die Einstellungen sollen das sagen, statt den ersten
    // Versand daran scheitern zu lassen.
    await setUpSmtp();
    await prisma.mailSettings.update({
      where: { id: 1 },
      data: { passwordSecret: 'os:dGhpcyBjYW1lIGZyb20gc29tZXdoZXJlIGVsc2U=' },
    });

    const current = await settings.get();
    expect(current.hasPassword).toBe(true);
    expect(current.passwordReadable).toBe(false);
    expect(current.ready).toBe(false);
    expect(current.problems.join(' ')).toContain('neu eingeben');
  });

  it('nimmt die Ablage des Gastgebers, wenn es eine gibt', async () => {
    const vault = new Map<string, string>();
    const store: SecretStore = {
      id: 'os',
      encrypt: (plaintext) => {
        const handle = `handle-${String(vault.size)}`;
        vault.set(handle, plaintext);
        return handle;
      },
      decrypt: (payload) => vault.get(payload) ?? null,
    };

    const storage = new StorageConfig({ get: () => dataDir } as never);
    const hosted = new MailSettingsService(prisma, storage, store);

    await hosted.update({
      transport: MAIL_TRANSPORT.SMTP,
      fromName: null,
      fromAddress: 'rechnung@xyz-agentur.de',
      replyTo: null,
      bccSelf: false,
      host: 'mail.xyz-agentur.de',
      port: 587,
      security: MAIL_SECURITY.STARTTLS,
      username: 'rechnung@xyz-agentur.de',
      password: 'geheim',
    });

    const row = await prisma.mailSettings.findUniqueOrThrow({ where: { id: 1 } });
    expect(row.passwordSecret).toMatch(/^os:/u);
    expect(vault.get('handle-0')).toBe('geheim');

    // Und ein Dienst mit der Schlüsseldatei kann damit nichts anfangen.
    expect((await settings.get()).passwordReadable).toBe(false);
  });

  it('prüft die Verbindung, ohne etwas zu verschicken', async () => {
    await setUpSmtp();
    expect(await mail.checkConnection()).toEqual({
      ok: true,
      message: 'Verbindung zu mail.xyz-agentur.de steht, die Anmeldung wird angenommen.',
    });

    sender.verifyFailWith = new Error('Der Mailserver hat das Passwort abgelehnt.');
    const failed = await mail.checkConnection();
    expect(failed.ok).toBe(false);
    expect(failed.message).toContain('abgelehnt');
    expect(sender.sent).toHaveLength(0);
  });
});

describe('Vorlagen', () => {
  it('legt die drei Vorlagen im Auslieferungsstand an', async () => {
    const list = await templates.list();

    expect(list.map((template) => template.key)).toEqual([
      MAIL_TEMPLATE_KEY.INVOICE,
      MAIL_TEMPLATE_KEY.CANCELLATION,
      MAIL_TEMPLATE_KEY.TIME_REPORT,
    ]);
    expect(list.every((template) => template.isDefault)).toBe(true);
  });

  it('merkt sich eine Änderung und findet zurück', async () => {
    await templates.update(MAIL_TEMPLATE_KEY.INVOICE, {
      subject: 'Ihre Rechnung {{rechnungsnummer}}',
      body: 'Kurz und knapp.',
    });

    const changed = await templates.get(MAIL_TEMPLATE_KEY.INVOICE);
    expect(changed.subject).toBe('Ihre Rechnung {{rechnungsnummer}}');
    expect(changed.isDefault).toBe(false);

    const reset = await templates.reset(MAIL_TEMPLATE_KEY.INVOICE);
    expect(reset.subject).toBe(MAIL_TEMPLATE_DEFAULTS.INVOICE.subject);
    expect(reset.isDefault).toBe(true);
  });
});

describe('Entwurf einer Rechnungsmail', () => {
  it('füllt Betreff und Text aus der Vorlage mit den Werten der Rechnung', async () => {
    const id = await issuedInvoice();
    const draft = await composer.draft({ kind: 'INVOICE', invoiceId: id });

    expect(draft.to).toEqual(['rechnung@soluxion.example']);
    expect(draft.subject).toBe('Rechnung 2026-001');
    // 900,00 € netto + 19 % = 1.071,00 € brutto, und die Anrede kennt den
    // Ansprechpartner aus dem eingefrorenen Empfängersatz.
    expect(draft.body).toContain('Guten Tag Frau Meyer');
    expect(draft.body).toContain('1.071,00');
    expect(draft.body).toContain('01.03.2026');
    expect(draft.body).toContain('15.03.2026');
    // Kein Platzhalter bleibt unaufgelöst stehen.
    expect(draft.body).not.toContain('{{');
  });

  it('bietet PDF und XML vorausgewählt an, den Zeitnachweis nicht', async () => {
    const id = await issuedInvoice();
    const draft = await composer.draft({ kind: 'INVOICE', invoiceId: id });

    const byKind = Object.fromEntries(draft.attachments.map((option) => [option.kind, option]));
    expect(byKind[MAIL_ATTACHMENT_KIND.INVOICE_PDF]).toMatchObject({
      available: true,
      selected: true,
      filename: 'Rechnung-2026-001.pdf',
    });
    expect(byKind[MAIL_ATTACHMENT_KIND.INVOICE_XML]).toMatchObject({
      available: true,
      selected: true,
    });
    expect(byKind[MAIL_ATTACHMENT_KIND.TIME_REPORT]).toMatchObject({
      available: false,
      selected: false,
    });
  });

  it('nennt den Grund, wenn die E-Rechnung noch Angaben braucht', async () => {
    // Ohne USt-ID und ohne elektronische Adresse ist der Käufersatz für
    // EN 16931 unvollständig.
    const id = await issuedInvoice({
      ...BUYER,
      vatId: null,
      electronicAddress: null,
      electronicAddressScheme: null,
    });

    const draft = await composer.draft({ kind: 'INVOICE', invoiceId: id });
    const xml = draft.attachments.find(
      (option) => option.kind === MAIL_ATTACHMENT_KIND.INVOICE_XML,
    );

    expect(xml?.available).toBe(false);
    expect(xml?.reason).toContain('fehlen Angaben');
  });

  it('warnt, wenn der Empfänger keine Adresse hat', async () => {
    const id = await issuedInvoice({ ...BUYER, email: null });
    const draft = await composer.draft({ kind: 'INVOICE', invoiceId: id });

    expect(draft.to).toEqual([]);
    expect(draft.warnings.join(' ')).toContain('keine E-Mail-Adresse');
  });

  it('lehnt einen Entwurf ab — der hat noch keine Nummer', async () => {
    const invoice = await prisma.invoice.create({
      data: {
        invoiceDate: '2026-03-01',
        serviceDate: '2026-03-01',
        dueDate: '2026-03-15',
        buyerData: JSON.stringify(BUYER),
      },
    });

    await expect(composer.draft({ kind: 'INVOICE', invoiceId: invoice.id })).rejects.toThrow(
      /Zuerst ausstellen/u,
    );
  });
});

describe('Versand über SMTP', () => {
  it('verschickt, protokolliert und vermerkt den Versand', async () => {
    await setUpSmtp();
    const id = await issuedInvoice();

    const result = await mail.send({
      source: { kind: 'INVOICE', invoiceId: id },
      to: ['rechnung@soluxion.example'],
      cc: [],
      bcc: [],
      subject: 'Rechnung 2026-001',
      body: 'Guten Tag Frau Meyer',
      attachments: [MAIL_ATTACHMENT_KIND.INVOICE_PDF, MAIL_ATTACHMENT_KIND.INVOICE_XML],
    });

    expect(sender.sent).toHaveLength(1);
    expect(sender.sent[0]?.attachments.map((attachment) => attachment.filename)).toEqual([
      'Rechnung-2026-001.pdf',
      '2026-001.xml',
    ]);

    expect(result.message.status).toBe(MAIL_STATUS.SENT);
    expect(result.message.attachments).toHaveLength(2);
    expect(result.handoff).toBeNull();
    expect(result.markedSentAt).not.toBeNull();

    const invoice = await invoices.findById(id);
    expect(invoice.sentAt).toBe(result.markedSentAt);

    const events = await prisma.invoiceEvent.findMany({ where: { invoiceId: id } });
    const mailEvent = events.find((event) => event.type === INVOICE_EVENT_TYPE.MAIL_SENT);
    expect(mailEvent).toBeDefined();
    expect(JSON.parse(mailEvent?.metadata ?? '{}')).toMatchObject({
      recipients: ['rechnung@soluxion.example'],
      transport: MAIL_TRANSPORT.SMTP,
      mailMessageId: result.message.id,
    });
  });

  it('überschreibt einen bestehenden Versandvermerk nicht', async () => {
    await setUpSmtp();
    const id = await issuedInvoice();

    const first = await mail.send({
      source: { kind: 'INVOICE', invoiceId: id },
      to: ['rechnung@soluxion.example'],
      cc: [],
      bcc: [],
      subject: 'Rechnung 2026-001',
      body: 'Text',
      attachments: [],
    });

    const second = await mail.send({
      source: { kind: 'INVOICE', invoiceId: id },
      to: ['buchhaltung@soluxion.example'],
      cc: [],
      bcc: [],
      subject: 'Nachfrage zu 2026-001',
      body: 'Text',
      attachments: [],
    });

    // Von diesem Datum aus zählt das Zahlungsziel; eine Nachfrage darf es
    // nicht nach hinten schieben.
    expect(second.markedSentAt).toBe(first.markedSentAt);
    expect(await prisma.mailMessage.count({ where: { invoiceId: id } })).toBe(2);
  });

  it('protokolliert auch den fehlgeschlagenen Versuch — aber nicht im Verlauf', async () => {
    await setUpSmtp();
    const id = await issuedInvoice();
    sender.failWith = new Error('Der Mailserver hat die Adresse abgelehnt.');

    await expect(
      mail.send({
        source: { kind: 'INVOICE', invoiceId: id },
        to: ['rechnung@soluxion.example'],
        cc: [],
        bcc: [],
        subject: 'Rechnung 2026-001',
        body: 'Text',
        attachments: [],
      }),
    ).rejects.toThrow(/abgelehnt/u);

    const logged = await prisma.mailMessage.findFirstOrThrow({ where: { invoiceId: id } });
    expect(logged.status).toBe(MAIL_STATUS.FAILED);
    expect(logged.error).toContain('abgelehnt');

    // Im Verlauf der Rechnung steht nichts: Es ist nichts geschehen.
    const events = await prisma.invoiceEvent.findMany({
      where: { invoiceId: id, type: INVOICE_EVENT_TYPE.MAIL_SENT },
    });
    expect(events).toEqual([]);
    expect((await invoices.findById(id)).sentAt).toBeNull();
  });

  it('legt die Blindkopie an sich selbst dazu, wenn sie eingerichtet ist', async () => {
    await settings.update({
      transport: MAIL_TRANSPORT.SMTP,
      fromName: null,
      fromAddress: 'rechnung@xyz-agentur.de',
      replyTo: null,
      bccSelf: true,
      host: 'mail.xyz-agentur.de',
      port: 587,
      security: MAIL_SECURITY.STARTTLS,
      username: null,
    });
    const id = await issuedInvoice();

    await mail.send({
      source: { kind: 'INVOICE', invoiceId: id },
      to: ['rechnung@soluxion.example'],
      cc: [],
      bcc: [],
      subject: 'Rechnung 2026-001',
      body: 'Text',
      attachments: [],
    });

    expect(sender.sent[0]?.bcc).toEqual(['rechnung@xyz-agentur.de']);
  });

  it('verweigert den Versand, solange nichts eingerichtet ist', async () => {
    const id = await issuedInvoice();

    await expect(
      mail.send({
        source: { kind: 'INVOICE', invoiceId: id },
        to: ['rechnung@soluxion.example'],
        cc: [],
        bcc: [],
        subject: 'Rechnung 2026-001',
        body: 'Text',
        attachments: [],
      }),
    ).rejects.toThrow(/kein Versandweg/u);

    expect(await prisma.mailMessage.count()).toBe(0);
  });
});

describe('Übergabe an die Mail-Anwendung', () => {
  it('legt einen echten Entwurf an, wo das Mailprogramm es zulässt', async () => {
    await setUpMailApp();
    handoff.canOpenDraft = true;
    const id = await issuedInvoice();

    const result = await mail.send({
      source: { kind: 'INVOICE', invoiceId: id },
      to: ['rechnung@soluxion.example'],
      cc: ['kopie@soluxion.example'],
      bcc: [],
      subject: 'Rechnung 2026-001',
      body: 'Guten Tag Frau Meyer',
      attachments: [MAIL_ATTACHMENT_KIND.INVOICE_PDF],
    });

    expect(result.handoff).toMatchObject({
      method: MAIL_HANDOFF_METHOD.DRAFT,
      application: 'Mail',
      // Kein Pfad: Es gibt keine Datei, auf die jemand ausweichen müsste.
      path: null,
    });

    const draft = handoff.drafts[0];
    expect(draft?.to).toEqual(['rechnung@soluxion.example']);
    expect(draft?.cc).toEqual(['kopie@soluxion.example']);
    expect(draft?.subject).toBe('Rechnung 2026-001');
    // Das Mailprogramm bekommt Dateipfade gereicht, keine Bytes — die
    // Anhänge müssen also wirklich auf der Platte liegen.
    expect(draft?.attachmentPaths).toHaveLength(1);
    expect(fs.existsSync(draft?.attachmentPaths[0] ?? '')).toBe(true);
    expect(draft?.attachmentPaths[0]).toMatch(/Rechnung-2026-001\.pdf$/u);

    // Keine Nachrichtendatei: Der erste Weg hat getragen.
    expect(handoff.openedMessages).toEqual([]);
    expect(result.markedSentAt).toBeNull();
  });

  it('schreibt die vollständige Nachricht samt Anhang und öffnet sie', async () => {
    await setUpMailApp();
    const id = await issuedInvoice();

    const result = await mail.send({
      source: { kind: 'INVOICE', invoiceId: id },
      to: ['rechnung@soluxion.example'],
      cc: [],
      bcc: [],
      subject: 'Rechnung 2026-001',
      body: 'Guten Tag Frau Meyer',
      attachments: [MAIL_ATTACHMENT_KIND.INVOICE_PDF],
    });

    expect(result.message.status).toBe(MAIL_STATUS.PREPARED);
    expect(result.handoff).toMatchObject({
      method: MAIL_HANDOFF_METHOD.MESSAGE_FILE,
      application: 'Microsoft Outlook',
    });
    expect(result.handoff?.path).toMatch(/\.eml$/u);
    expect(handoff.openedMessages).toEqual([result.handoff?.path]);

    // Der eigentliche Punkt dieses Wegs: Die Rechnung steckt **in** der
    // Nachricht und liegt nicht in einem Ordner daneben.
    const eml = fs.readFileSync(result.handoff?.path ?? '', 'utf8');
    expect(eml).toContain('To: rechnung@soluxion.example');
    expect(eml).toContain('Rechnung-2026-001.pdf');
    expect(eml).toContain('Content-Type: application/pdf');
    // Outlook erkennt daran einen Entwurf statt einer eingegangenen Nachricht.
    expect(eml).toContain('X-Unsent: 1');

    // Ob die Nachricht abging, weiß die Anwendung nicht — und behauptet es
    // deshalb nicht.
    expect(result.markedSentAt).toBeNull();
    expect((await invoices.findById(id)).sentAt).toBeNull();

    const events = await prisma.invoiceEvent.findMany({
      where: { invoiceId: id, type: INVOICE_EVENT_TYPE.MAIL_PREPARED },
    });
    expect(events).toHaveLength(1);
  });

  it('schreibt auch ohne Anhang eine Nachricht', async () => {
    await setUpMailApp();
    const id = await issuedInvoice();

    const result = await mail.send({
      source: { kind: 'INVOICE', invoiceId: id },
      to: ['rechnung@soluxion.example'],
      cc: [],
      bcc: [],
      subject: 'Nachfrage',
      body: 'Guten Tag',
      attachments: [],
    });

    expect(result.handoff?.path).not.toBeNull();
    expect(fs.readFileSync(result.handoff?.path ?? '', 'utf8')).toContain('Subject: Nachfrage');
  });

  it('sagt es, wenn kein Fenster da ist, das etwas öffnen könnte', async () => {
    const storage = new StorageConfig({ get: () => dataDir } as never);
    const headless = new MailService(prisma, settings, composer, sender, storage, null);

    await setUpMailApp();
    const id = await issuedInvoice();

    await expect(
      headless.send({
        source: { kind: 'INVOICE', invoiceId: id },
        to: ['rechnung@soluxion.example'],
        cc: [],
        bcc: [],
        subject: 'Rechnung 2026-001',
        body: 'Text',
        attachments: [],
      }),
    ).rejects.toThrow(/Desktop-Anwendung/u);
  });
});

describe('Zeitnachweis per E-Mail', () => {
  it('nimmt Empfänger und Zeitraum aus Kunde und Anfrage', async () => {
    await setUpSmtp();
    const customer = await prisma.customer.create({
      data: {
        companyName: 'SoluXion Ltd',
        contactName: 'Frau Meyer',
        email: 'zeiten@soluxion.example',
      },
    });
    await prisma.timeEntry.create({
      data: {
        date: '2026-02-10',
        customerId: customer.id,
        startMinutes: 540,
        endMinutes: 720,
        breakMinutes: 0,
        description: 'Beratung',
      },
    });

    const draft = await composer.draft({
      kind: 'TIME_REPORT',
      customerId: customer.id,
      from: '2026-02-01',
      to: '2026-02-28',
    });

    expect(draft.to).toEqual(['zeiten@soluxion.example']);
    expect(draft.subject).toBe('Zeitnachweis 01.02.2026 – 28.02.2026');
    expect(draft.body).toContain('3:00 Stunden');
    expect(draft.body).toContain('1 Einträgen');
    expect(draft.warnings).toEqual([]);

    const result = await mail.send({
      source: {
        kind: 'TIME_REPORT',
        customerId: customer.id,
        from: '2026-02-01',
        to: '2026-02-28',
      },
      to: draft.to,
      cc: [],
      bcc: [],
      subject: draft.subject,
      body: draft.body,
      attachments: [MAIL_ATTACHMENT_KIND.TIME_REPORT],
    });

    expect(result.message.invoiceId).toBeNull();
    expect(result.message.attachments[0]?.filename).toContain('Zeitnachweis');
    expect(result.markedSentAt).toBeNull();
  });
});

describe('Versandprotokoll', () => {
  it('liefert die Einträge neueste zuerst und lässt sich auf eine Rechnung einschränken', async () => {
    await setUpSmtp();
    const id = await issuedInvoice();

    for (const subject of ['Erste', 'Zweite']) {
      await mail.send({
        source: { kind: 'INVOICE', invoiceId: id },
        to: ['rechnung@soluxion.example'],
        cc: [],
        bcc: [],
        subject,
        body: 'Text',
        attachments: [],
      });
      // Zwei Einträge in derselben Millisekunde wären nicht mehr zu
      // ordnen — der Test darf sich nicht auf die Einfügereihenfolge
      // verlassen, die er prüfen will.
      await vi.waitFor(() => undefined, { timeout: 10, interval: 5 });
    }

    const all = await mail.messages({ limit: 50 });
    expect(all.map((message) => message.subject)).toEqual(['Zweite', 'Erste']);

    const filtered = await mail.messages({ invoiceId: id, limit: 50 });
    expect(filtered).toHaveLength(2);
  });
});
