/**
 * Die Dokumente, an denen der PDF-Weg gemessen wird.
 *
 * Kein Test, sondern seine Eingabe: fertige HTML-Dokumente samt
 * Fußzeilenvorlage — genau das, was ein `PdfRenderer` entgegennimmt.
 * Dadurch prüft `pdf-electron.test.ts` den Renderer und sonst nichts:
 * keine Datenbank, kein Nest, keine Snapshots.
 *
 * Das ist der Sinn der Sache: Die Frage „erzeugt der Renderer noch dasselbe
 * Dokument?" soll beantwortbar sein, ohne dass sich gleichzeitig die
 * Eingabe ändert. Beim Wechsel von Puppeteer zu Electron hat genau das die
 * Antwort geliefert.
 *
 * Die Zahlen sind an `packages/invoice-template/test/fixtures.ts` angelehnt:
 * eine echte Rechnung mit Reverse Charge und einer ausländischen Anschrift,
 * weil sich an ihr zeigt, ob das Layout hält.
 */
import {
  CURRENT_SNAPSHOT_VERSION,
  DISCOUNT_TYPE,
  DOCUMENT_TYPE,
  TAX_PROFILE_KIND,
  toIsoDate,
  summarizeTimeEntries,
  type BuyerData,
  type SellerSnapshot,
  type TaxSnapshot,
  type TemplateSnapshot,
  type TimeEntryRangeQuery,
  type TimeEntryResponse,
} from '@agentur-tool/shared';
import { buildRenderModel, type RenderModelSource } from '@agentur-tool/invoice-template';
import {
  renderInvoiceDocument,
  renderInvoiceFooterTemplate,
} from '@agentur-tool/invoice-template/server';
import { TimeReportService } from '../src/pdf/time-report.service';

/** Ein fertiges Dokument, so wie es beim Renderer ankommt. */
export interface ReferenceDocument {
  readonly name: string;
  readonly html: string;
  readonly footerTemplate: string;
}

const SELLER: SellerSnapshot = {
  snapshotVersion: CURRENT_SNAPSHOT_VERSION,
  companyName: 'XYZ - Agentur',
  address: { street: 'Wolfgangsklinge 14', postalCode: '73479', city: 'Ellwangen', country: 'DE' },
  email: 'hello@xyz-agentur.de',
  website: 'xyz-agentur.de',
  phone: null,
  vatId: 'DE455137261',
  taxNumber: null,
  bankAccountHolder: 'Tom Wenczel',
  iban: 'DE12202208000052019114',
  bic: 'SXPYDEHHXXX',
  bankName: null,
  electronicAddress: 'hello@xyz-agentur.de',
  electronicAddressScheme: 'EM',
  logoAssetId: null,
};

const BUYER: BuyerData = {
  snapshotVersion: CURRENT_SNAPSHOT_VERSION,
  companyName: 'SoluXion Ltd',
  contactName: null,
  addressLine: 'Flat/Office 102 Pervolia',
  address: {
    street: 'Georgiou Karaiskaki, 11-13 CARISA SALONICA',
    postalCode: '7560',
    city: 'Larnaca',
    country: 'Zypern',
  },
  email: null,
  vatId: 'CY60143029O',
  customerNumber: null,
  buyerReference: 'BR-2026-0001',
  electronicAddress: 'rechnung@soluxion.example',
  electronicAddressScheme: 'EM',
};

const REVERSE_CHARGE: TaxSnapshot = {
  snapshotVersion: CURRENT_SNAPSHOT_VERSION,
  profileName: 'EU B2B Reverse Charge',
  kind: TAX_PROFILE_KIND.REVERSE_CHARGE,
  defaultRateBasisPoints: 0,
  noteText:
    'Steuerschuldnerschaft des Leistungsempfängers. Die Umsatzsteuer schuldet der Leistungsempfänger gemäß Art. 196 MwStSystRL und §13b UStG (Reverse Charge).',
  showTaxColumn: true,
  taxCategoryCode: 'AE',
  exemptionReasonCode: 'VATEX-EU-AE',
  exemptionReasonText: 'Steuerschuldnerschaft des Leistungsempfängers.',
};

const STANDARD_TAX: TaxSnapshot = {
  snapshotVersion: CURRENT_SNAPSHOT_VERSION,
  profileName: 'Deutschland 19 %',
  kind: TAX_PROFILE_KIND.STANDARD,
  defaultRateBasisPoints: 1900,
  noteText: null,
  showTaxColumn: true,
  taxCategoryCode: 'S',
  exemptionReasonCode: null,
  exemptionReasonText: null,
};

const TEMPLATE: TemplateSnapshot = {
  snapshotVersion: CURRENT_SNAPSHOT_VERSION,
  templateKey: 'classic',
  accentColor: '#1e293b',
  fontFamily: 'Open Sans',
  logoWidthMm: 40,
  footerText: null,
  paymentNote: null,
  closingNote: null,
};

/**
 * Ein 1×1-Pixel-PNG als Data-URI.
 *
 * Das Logo kommt im Betrieb ebenfalls als Data-URI ins Dokument
 * (`InvoicePdfService.logoDataUri()`), nicht als URL — dass der Renderer
 * eingebettete Bilder zeichnet, gehört deshalb zur Referenz.
 */
const LOGO_DATA_URI =
  'data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mP8z8BQDwAEhQGAhKmMIQAAAABJRU5ErkJggg==';

function item(description: string, unitPriceCents: number, taxRateBasisPoints: number) {
  return {
    description,
    quantity: 1000,
    unit: null,
    unitPriceCents,
    discountType: DISCOUNT_TYPE.PERCENT,
    discountValue: 0,
    taxRateBasisPoints,
  };
}

const BASE: RenderModelSource = {
  documentType: DOCUMENT_TYPE.INVOICE,
  number: '2025-003',
  invoiceDate: toIsoDate('2025-07-26'),
  serviceDate: toIsoDate('2025-07-26'),
  serviceDateTo: null,
  dueDate: toIsoDate('2025-08-09'),
  currency: 'EUR',
  seller: SELLER,
  buyer: BUYER,
  tax: REVERSE_CHARGE,
  template: TEMPLATE,
  notes: null,
  footerNote: null,
  logoSrc: null,
  items: [
    item('Erstellung Redirect Links', 6500, 0),
    item('Links', 800, 0),
    item('Hosting', 4000, 0),
  ],
};

function document(name: string, source: RenderModelSource): ReferenceDocument {
  const model = buildRenderModel(source);
  return {
    name,
    html: renderInvoiceDocument(model),
    footerTemplate: renderInvoiceFooterTemplate(model),
  };
}

/**
 * Der Zeitnachweis als Dokument.
 *
 * Er ist der zweite Konsument des Renderers und bringt eigenes CSS und ein
 * eigenes `@page` mit — 14 mm Rand statt 12 mm. Ohne ihn in der Referenz
 * bliebe genau das ungeprüft.
 *
 * `buildHtml` und `footerTemplate` sind reine Funktionen ihrer Eingabe; der
 * Dienst braucht seine beiden Abhängigkeiten nur in `render`, das hier
 * nicht aufgerufen wird. Deshalb genügen Platzhalter — dasselbe Muster wie
 * bei `new StorageConfig({ get: … } as never)` in den übrigen Tests.
 */
function timeReport(): ReferenceDocument {
  const service = new TimeReportService(undefined as never, undefined as never);
  const title = 'Zeitnachweis Alpha AG September 2026';

  const query: TimeEntryRangeQuery = { from: '2026-09-01', to: '2026-09-30' } as never;
  const entries: TimeEntryResponse[] = [
    entry(1, '2026-09-07', 'Alpha AG', 540, 750, 30, 'Konzept und Abstimmung'),
    entry(2, '2026-09-08', 'Alpha AG', 600, 720, 0, 'Umsetzung Startseite'),
    entry(3, '2026-09-14', 'Zeta GmbH', 540, 600, 0, null),
  ];

  return {
    name: 'zeitnachweis',
    html: service.buildHtml({
      title,
      companyName: 'XYZ - Agentur',
      query,
      entries,
      summary: summarizeTimeEntries(entries),
    }),
    footerTemplate: service.footerTemplate(title),
  };
}

function entry(
  id: number,
  date: string,
  customerName: string,
  startMinutes: number,
  endMinutes: number,
  breakMinutes: number,
  description: string | null,
): TimeEntryResponse {
  return {
    id,
    date,
    customerId: customerName === 'Alpha AG' ? 1 : 2,
    customerName,
    startMinutes,
    endMinutes,
    breakMinutes,
    durationMinutes: endMinutes - startMinutes - breakMinutes,
    description,
    billedAt: null,
    createdAt: '2026-09-15T08:00:00.000Z',
    updatedAt: '2026-09-15T08:00:00.000Z',
  };
}

/**
 * Fünf Dokumente, die zusammen alles abdecken, was am Renderer schiefgehen
 * kann: Seitenmaß, Seitenumbruch mit durchgehenden Rändern, eingebettete
 * Schrift, eingebettetes Bild, eine gefüllte Fußzeile — und mit dem
 * Zeitnachweis ein zweites Dokument mit eigenen Rändern.
 */
export function referenceDocuments(): ReferenceDocument[] {
  return [
    timeReport(),
    document('einseitig', BASE),

    // 34 Positionen erzwingen mehrere Umbrüche. Der Fall ist der Beleg für
    // D31: Die Ränder kommen aus @page und müssen deshalb auf jeder
    // Folgeseite genauso stimmen wie auf der ersten.
    document('mehrseitig', {
      ...BASE,
      items: Array.from({ length: 34 }, (_, index) =>
        item(`Position ${String(index + 1)}`, 6500 + index * 10, 0),
      ),
    }),

    document('mit-logo', { ...BASE, logoSrc: LOGO_DATA_URI }),

    // Steuerspalte, Rabatte, Mehrzeiler und alle drei Notiztexte — das
    // Dokument mit der höchsten Satzdichte.
    document('voll', {
      ...BASE,
      tax: STANDARD_TAX,
      notes: 'Die Abnahme erfolgte am 24.07.2025 durch Frau Meier.',
      buyer: { ...BUYER, customerNumber: 'K-1042', contactName: 'z. Hd. Frau Meier' },
      template: {
        ...TEMPLATE,
        paymentNote: 'Bitte überweisen Sie den Rechnungsbetrag bis zum Fälligkeitsdatum.',
        closingNote: 'Vielen Dank für die gute Zusammenarbeit.',
        footerText:
          'XYZ - Agentur · Wolfgangsklinge 14 · 73479 Ellwangen · Amtsgericht Ulm HRB 12345',
      },
      items: [
        {
          description: 'Konzeption und Umsetzung Relaunch\nInklusive Abstimmungsrunden',
          quantity: 32_500,
          unit: 'Std.',
          unitPriceCents: 9500,
          discountType: DISCOUNT_TYPE.PERCENT,
          discountValue: 1000,
          taxRateBasisPoints: 1900,
        },
        {
          description: 'Lizenz Bildmaterial',
          quantity: 1000,
          unit: null,
          unitPriceCents: 24_900,
          discountType: DISCOUNT_TYPE.AMOUNT,
          discountValue: 4900,
          taxRateBasisPoints: 1900,
        },
        {
          description: 'Fachbuch „Barrierefreies Web"',
          quantity: 2000,
          unit: 'Stk.',
          unitPriceCents: 3990,
          discountType: DISCOUNT_TYPE.PERCENT,
          discountValue: 0,
          taxRateBasisPoints: 700,
        },
      ],
    }),
  ];
}
