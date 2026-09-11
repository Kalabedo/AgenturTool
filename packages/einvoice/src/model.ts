import {
  DEFAULT_UNIT_CODE,
  DOCUMENT_TYPE,
  DOCUMENT_TYPE_CODE,
  PAYMENT_MEANS_CODE,
  calculateInvoice,
  type DocumentTypeCode,
  type PaymentMeansCode,
  type TaxCategoryCode,
  type TotalsSnapshot,
  type UnitCode,
} from '@agentur-tool/shared';
import type { RenderModelSource } from '@agentur-tool/invoice-template';

/**
 * Das Zwischenmodell der E-Rechnung.
 *
 * Bewusst spiegelbildlich zu `buildRenderModel` im Template-Paket — und mit
 * **derselben Eingabe**, `RenderModelSource`. Das ist der ganze Kniff:
 *
 * > Ein Template, zwei Konsumenten. (Abschnitt 12)
 *
 * Hier wird daraus: eine Quelle, drei Ausgaben — Vorschau, PDF und
 * E-Rechnung. Eine eigene Quelle für das XML wäre genau der stille Fehler,
 * den die Architektur an dieser Stelle beschreibt: Die Datei zeigte etwas
 * anderes als das Papier, und auffallen würde es beim Empfänger.
 *
 * Warum überhaupt ein Zwischenmodell und nicht direkt XML? Weil dann jede
 * Prüfung am fertigen Text hinge. So lässt sich die Abbildung testen, ohne
 * eine Zeile XML zu lesen — und ZUGFeRD bekommt später dasselbe Modell,
 * ohne dass hier etwas anzufassen wäre.
 */

/** Eine Anschrift, wie EN 16931 sie kennt (BG-5, BG-8). */
export interface EinvoiceAddress {
  line: string;
  postalCode: string;
  city: string;
  /** BT-40 / BT-55: der Ländercode nach ISO 3166-1 alpha-2. */
  countryCode: string;
}

/** Eine Partei — Verkäufer (BG-4) oder Käufer (BG-7). */
export interface EinvoiceParty {
  name: string;
  address: EinvoiceAddress;
  /** BT-31 / BT-48: Umsatzsteuer-Identifikationsnummer. */
  vatId: string | null;
  /** BT-32: steuerliche Kennung ohne USt-IdNr., also die Steuernummer. */
  taxNumber: string | null;
  /** BT-34 / BT-49 samt Schema. */
  electronicAddress: string | null;
  electronicAddressScheme: string | null;
  contactName: string | null;
  email: string | null;
  /** BT-42: Telefonnummer der Kontaktstelle. In XRechnung Pflicht. */
  phone: string | null;
}

/** Eine Steuergruppe der Aufstellung (BG-23). */
export interface EinvoiceTaxBreakdown {
  categoryCode: TaxCategoryCode;
  /** BT-119, in Basispunkten. */
  rateBasisPoints: number;
  /** BT-116 */
  basisCents: number;
  /** BT-117 */
  taxCents: number;
  /** BT-120 */
  exemptionReasonText: string | null;
  /** BT-121 */
  exemptionReasonCode: string | null;
}

/** Eine Position (BG-25). */
export interface EinvoiceLine {
  /** BT-126 */
  id: string;
  /** BT-153 */
  name: string;
  /** BT-129 in Tausendsteln, BT-130 als Code. */
  quantity: number;
  unitCode: UnitCode;
  /** BT-146, der Nettopreis je Einheit. */
  unitPriceCents: number;
  /** BT-131, der Nettobetrag der Zeile. */
  netCents: number;
  /** BT-136: Nachlass auf die Zeile, 0 heißt keiner. */
  discountCents: number;
  categoryCode: TaxCategoryCode;
  /** BT-152 */
  rateBasisPoints: number;
}

/** Das vollständige Modell einer E-Rechnung. */
export interface EinvoiceModel {
  /** BT-1 */
  number: string;
  /** BT-3 */
  typeCode: DocumentTypeCode;
  /** BT-2 */
  issueDate: string;
  /** BT-9 */
  dueDate: string;
  /** BT-72 beziehungsweise BG-14, wenn ein Zeitraum abgerechnet wird. */
  deliveryDate: string;
  periodStart: string | null;
  periodEnd: string | null;
  /** BT-5 */
  currency: string;
  /** BT-10 */
  buyerReference: string | null;
  /** BT-22 */
  note: string | null;
  seller: EinvoiceParty;
  buyer: EinvoiceParty;
  lines: EinvoiceLine[];
  taxBreakdown: EinvoiceTaxBreakdown[];
  /** BG-17 */
  paymentMeansCode: PaymentMeansCode;
  iban: string | null;
  bic: string | null;
  accountHolder: string | null;
  /** BT-106, BT-107, BT-109, BT-110, BT-112, BT-115 */
  lineTotalCents: number;
  allowanceTotalCents: number;
  taxBasisTotalCents: number;
  taxTotalCents: number;
  grandTotalCents: number;
  duePayableCents: number;
  /** BT-25: die aufgehobene Rechnung, wenn dies ein Storno ist. */
  precedingInvoiceNumber: string | null;
}

/**
 * Ländercode aus dem Freitextfeld.
 *
 * `Company.country` und `Customer.country` sind bewusst Freitext — sie
 * erscheinen so auf der Rechnung und müssen „Schweiz" ebenso aufnehmen
 * können wie „DE". Die Norm will hingegen ISO 3166-1 alpha-2.
 *
 * Die Tabelle deckt ab, was in den Stammdaten einer deutschen Agentur
 * vorkommt. Was nicht getroffen wird und schon wie ein Code aussieht, geht
 * unverändert durch; alles andere wird zu `DE`. Das ist die ehrlichste
 * Vorgabe für eine Anwendung, die in Deutschland betrieben wird — und der
 * Prüfbericht nennt das Feld, falls sie falsch ist.
 */
const COUNTRY_CODES: Record<string, string> = {
  deutschland: 'DE',
  germany: 'DE',
  österreich: 'AT',
  oesterreich: 'AT',
  austria: 'AT',
  schweiz: 'CH',
  switzerland: 'CH',
  frankreich: 'FR',
  france: 'FR',
  niederlande: 'NL',
  belgien: 'BE',
  luxemburg: 'LU',
  italien: 'IT',
  spanien: 'ES',
  polen: 'PL',
  zypern: 'CY',
  dänemark: 'DK',
  schweden: 'SE',
  tschechien: 'CZ',
};

export function toCountryCode(country: string): string {
  const trimmed = country.trim();
  if (trimmed === '') return 'DE';
  if (/^[A-Za-z]{2}$/.test(trimmed)) return trimmed.toUpperCase();
  return COUNTRY_CODES[trimmed.toLowerCase()] ?? 'DE';
}

export interface BuildEinvoiceOptions {
  /**
   * BT-25: die Nummer der Rechnung, die dieses Storno aufhebt.
   *
   * Wird von außen gereicht statt aus der Quelle gelesen, weil
   * `RenderModelSource` die Beziehung nicht kennt — sie steht als
   * `cancelsInvoiceId` an der Rechnung und wird dort aufgelöst.
   */
  precedingInvoiceNumber?: string | null;
}

/**
 * Setzt das Modell zusammen.
 *
 * `frozenTotals` ist hier — anders als beim Render-Modell — **nicht**
 * optional. Eine E-Rechnung entsteht ausschließlich aus einer
 * finalisierten Rechnung, und deren Beträge stehen im Snapshot. Sie neu
 * auszurechnen wäre der Fehler, vor dem Abschnitt 8 warnt: Dieselbe
 * Rechnung zeigte plötzlich andere Beträge als das Exemplar, das der
 * Kunde schon hat.
 *
 * Die Zeilenbeträge stammen wie beim PDF aus der Berechnung — sie sind aus
 * den unveränderlichen Positionen jederzeit reproduzierbar, und für sie
 * gibt es keinen eigenen Snapshot.
 */
export function buildEinvoiceModel(
  source: RenderModelSource,
  frozenTotals: TotalsSnapshot,
  options: BuildEinvoiceOptions = {},
): EinvoiceModel {
  if (source.number === null) {
    // Ein Entwurf hat keine Nummer, und BT-1 ist Pflicht. Das ist kein
    // Eingabefehler, sondern ein Aufruf an der falschen Stelle.
    throw new Error('Eine E-Rechnung lässt sich nur aus einer ausgestellten Rechnung erzeugen.');
  }

  const calculation = calculateInvoice(
    source.items.map((item) => ({
      quantity: item.quantity,
      unitPriceCents: item.unitPriceCents,
      discountType: item.discountType,
      discountValue: item.discountValue,
      taxRateBasisPoints: item.taxRateBasisPoints,
    })),
  );

  const categoryCode = source.tax.taxCategoryCode as TaxCategoryCode;

  const lines: EinvoiceLine[] = source.items.map((item, index) => {
    const line = calculation.items[index];
    return {
      id: String(index + 1),
      name: item.description,
      quantity: item.quantity,
      unitCode: item.unitCode ?? DEFAULT_UNIT_CODE,
      unitPriceCents: item.unitPriceCents,
      netCents: line?.netCents ?? 0,
      discountCents: line?.discountCents ?? 0,
      categoryCode,
      rateBasisPoints: item.taxRateBasisPoints,
    };
  });

  // Die Steuergruppen kommen aus dem Snapshot, nicht aus der Berechnung.
  const taxBreakdown: EinvoiceTaxBreakdown[] = frozenTotals.taxGroups.map((groupEntry) => ({
    categoryCode,
    rateBasisPoints: groupEntry.rateBasisPoints,
    basisCents: groupEntry.netCents,
    taxCents: groupEntry.taxCents,
    exemptionReasonText: source.tax.exemptionReasonText,
    exemptionReasonCode: source.tax.exemptionReasonCode,
  }));

  // BT-106 ist die Summe der Zeilenbeträge, BT-107 die Summe der Nachlässe.
  // Beide stehen im Snapshot beziehungsweise ergeben sich aus ihm: Der
  // Nettobetrag ist bereits um die Nachlässe gemindert, weil diese in
  // dieser Anwendung ausschließlich auf Zeilenebene vorkommen.
  const lineTotalCents = frozenTotals.netCents;

  return {
    number: source.number,
    typeCode:
      source.documentType === DOCUMENT_TYPE.CANCELLATION
        ? DOCUMENT_TYPE_CODE.CREDIT_NOTE
        : DOCUMENT_TYPE_CODE.INVOICE,
    issueDate: source.invoiceDate,
    dueDate: source.dueDate,
    deliveryDate: source.serviceDate,
    periodStart: source.serviceDateTo === null ? null : source.serviceDate,
    periodEnd: source.serviceDateTo,
    currency: source.currency,
    buyerReference: source.buyer.buyerReference,
    note: source.notes,
    seller: {
      name: source.seller.companyName,
      address: {
        line: source.seller.address.street,
        postalCode: source.seller.address.postalCode,
        city: source.seller.address.city,
        countryCode: toCountryCode(source.seller.address.country),
      },
      vatId: source.seller.vatId,
      taxNumber: source.seller.taxNumber,
      electronicAddress: source.seller.electronicAddress,
      electronicAddressScheme: source.seller.electronicAddressScheme,
      // BT-41 verlangt eine Kontaktstelle, kein bestimmtes Gegenüber. Ohne
      // eigenes Feld für einen Ansprechpartner ist der Firmenname die
      // ehrlichste Angabe — er benennt genau die Stelle, die erreichbar ist.
      contactName: source.seller.companyName,
      email: source.seller.email,
      phone: source.seller.phone,
    },
    buyer: {
      name: source.buyer.companyName,
      address: {
        line: source.buyer.address.street,
        postalCode: source.buyer.address.postalCode,
        city: source.buyer.address.city,
        countryCode: toCountryCode(source.buyer.address.country),
      },
      vatId: source.buyer.vatId,
      taxNumber: null,
      electronicAddress: source.buyer.electronicAddress,
      electronicAddressScheme: source.buyer.electronicAddressScheme,
      contactName: source.buyer.contactName,
      email: source.buyer.email,
      phone: null,
    },
    lines,
    taxBreakdown,
    paymentMeansCode: PAYMENT_MEANS_CODE.SEPA_CREDIT_TRANSFER,
    iban: source.seller.iban,
    bic: source.seller.bic,
    accountHolder: source.seller.bankAccountHolder ?? source.seller.companyName,
    lineTotalCents,
    allowanceTotalCents: 0,
    taxBasisTotalCents: frozenTotals.netCents,
    taxTotalCents: frozenTotals.taxCents,
    grandTotalCents: frozenTotals.grossCents,
    duePayableCents: frozenTotals.grossCents,
    precedingInvoiceNumber: options.precedingInvoiceNumber ?? null,
  };
}
