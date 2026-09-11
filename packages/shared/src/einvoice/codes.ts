/**
 * Codelisten der EN 16931.
 *
 * Die Norm ist europäisch, nicht deutsch: XRechnung ist nur die deutsche
 * CIUS (ein Einschränkungsprofil), ZUGFeRD 2.3 und das französische
 * Factur-X 1.07 sind dieselbe Spezifikation unter zwei Namen. Deshalb
 * stehen hier die Codes der Norm und nicht die eines Landes — die Profile
 * schränken später ein, sie erfinden nichts dazu.
 *
 * Aufgebaut wie `enums.ts`: Objekt als einzige Quelle der zulässigen Werte,
 * Typ daraus abgeleitet, Werteliste für Zod und CHECK-Constraints daneben.
 *
 * Die Klammern hinter den Konstanten nennen die Feldnummer der Norm
 * (BT-… „business term"), damit beim Lesen des Serializers nachvollziehbar
 * bleibt, welches Feld gemeint ist.
 */

import { TAX_PROFILE_KIND, type TaxProfileKind } from '../enums.js';

/**
 * Steuerkategorie (BT-118, UNTDID 5305).
 *
 * Das ist der Code, an dem die ganze Steuerabbildung hängt. Er ist nicht
 * dasselbe wie `TaxProfileKind`: Ein Profil der Art `ZERO_RATED` kann je
 * nach Sachverhalt `Z`, `E`, `K` oder `G` sein, und das kann nur der
 * Benutzer wissen. Siehe D-E2 in Abschnitt 24 der Architektur.
 */
export const TAX_CATEGORY_CODE = {
  /** Regelsatz. */
  STANDARD: 'S',
  /** Nullsatz — steuerbar, aber mit 0 %. */
  ZERO_RATED: 'Z',
  /** Steuerbefreit. */
  EXEMPT: 'E',
  /** Umkehr der Steuerschuldnerschaft (Reverse Charge). */
  REVERSE_CHARGE: 'AE',
  /** Innergemeinschaftliche Lieferung. */
  INTRA_COMMUNITY: 'K',
  /** Ausfuhr in ein Drittland. */
  EXPORT: 'G',
  /** Nicht im Geltungsbereich der Steuer. */
  OUT_OF_SCOPE: 'O',
} as const;
export type TaxCategoryCode = (typeof TAX_CATEGORY_CODE)[keyof typeof TAX_CATEGORY_CODE];
export const TAX_CATEGORY_CODE_VALUES = Object.values(TAX_CATEGORY_CODE);

/**
 * Kategorien, die zwingend einen Befreiungsgrund brauchen (BR-E-10,
 * BR-AE-10, BR-IC-10, BR-G-10, BR-O-10 der Norm).
 *
 * „Zwingend" heißt: Code (BT-121) **oder** Text (BT-120), nicht beides.
 */
export const CATEGORIES_NEEDING_EXEMPTION_REASON: readonly TaxCategoryCode[] = [
  TAX_CATEGORY_CODE.EXEMPT,
  TAX_CATEGORY_CODE.REVERSE_CHARGE,
  TAX_CATEGORY_CODE.INTRA_COMMUNITY,
  TAX_CATEGORY_CODE.EXPORT,
  TAX_CATEGORY_CODE.OUT_OF_SCOPE,
];

/**
 * Vorschlag für die Kategorie aus der Art des Steuerprofils.
 *
 * Bewusst nur ein Vorschlag: `ZERO_RATED` wird auf `E` abgebildet, weil das
 * der häufigste Fall ist, aber wer innergemeinschaftlich liefert, muss auf
 * `K` umstellen. Die Migration benutzt dieselbe Abbildung für den Backfill,
 * damit Bestand und Neuanlage nicht auseinanderlaufen.
 */
export function defaultTaxCategoryForKind(kind: TaxProfileKind): TaxCategoryCode {
  switch (kind) {
    case TAX_PROFILE_KIND.STANDARD:
      return TAX_CATEGORY_CODE.STANDARD;
    case TAX_PROFILE_KIND.REVERSE_CHARGE:
      return TAX_CATEGORY_CODE.REVERSE_CHARGE;
    case TAX_PROFILE_KIND.ZERO_RATED:
    case TAX_PROFILE_KIND.SMALL_BUSINESS:
      return TAX_CATEGORY_CODE.EXEMPT;
  }
}

/**
 * Befreiungsgründe (BT-121, Codeliste VATEX).
 *
 * Nur die vier, die aus den vorhandenen Profilarten überhaupt entstehen
 * können. Die vollständige Liste hat über hundert Einträge; sie hier
 * abzuschreiben hieße, eine Codeliste zu pflegen, die niemand benutzt.
 *
 * Für die Kleinunternehmerregelung steht hier bewusst kein Code: § 19 UStG
 * ist eine nationale Regelung ohne eigenen VATEX-Eintrag. Die Norm lässt
 * in diesem Fall den Freitext (BT-120) genügen.
 */
export const VAT_EXEMPTION_REASON_CODE = {
  REVERSE_CHARGE: 'VATEX-EU-AE',
  INTRA_COMMUNITY: 'VATEX-EU-IC',
  EXPORT: 'VATEX-EU-G',
  OUT_OF_SCOPE: 'VATEX-EU-O',
} as const;
export type VatExemptionReasonCode =
  (typeof VAT_EXEMPTION_REASON_CODE)[keyof typeof VAT_EXEMPTION_REASON_CODE];
export const VAT_EXEMPTION_REASON_CODE_VALUES = Object.values(VAT_EXEMPTION_REASON_CODE);

/**
 * Mengeneinheit (BT-130, UN/ECE Recommendation 20).
 *
 * Eine kuratierte Teilmenge: die Einheiten, die eine Agentur wirklich
 * abrechnet. Die vollständige Liste umfasst mehrere tausend Codes, von
 * „Fass" bis „Curie".
 *
 * `C62` („Stück", wörtlich: eins) ist die Vorgabe — es ist der Code, mit dem
 * eine Position ohne gedachte Einheit korrekt bleibt.
 */
export const UNIT_CODE = {
  /** Stück / Einheit. Die Vorgabe. */
  PIECE: 'C62',
  HOUR: 'HUR',
  DAY: 'DAY',
  WEEK: 'WEE',
  MONTH: 'MON',
  YEAR: 'ANN',
  /** Dienstleistungseinheit — für Pauschalen ohne zählbare Menge. */
  SERVICE_UNIT: 'E48',
  KILOMETRE: 'KMT',
  METRE: 'MTR',
  SQUARE_METRE: 'MTK',
  KILOGRAM: 'KGM',
  LITRE: 'LTR',
  SET: 'SET',
} as const;
export type UnitCode = (typeof UNIT_CODE)[keyof typeof UNIT_CODE];
export const UNIT_CODE_VALUES = Object.values(UNIT_CODE);

/** Die Vorgabe für neue Positionen und für den Backfill der Migration. */
export const DEFAULT_UNIT_CODE: UnitCode = UNIT_CODE.PIECE;

/**
 * Deutsche Beschriftung je Einheitencode, für die Auswahl in der Oberfläche.
 *
 * Getrennt vom gedruckten Etikett (`InvoiceItem.unit`): Was auf der Rechnung
 * steht, bestimmt weiterhin der Benutzer (D-E3). Diese Tabelle beschriftet
 * nur das Auswahlfeld.
 */
export const UNIT_CODE_LABELS: Record<UnitCode, string> = {
  [UNIT_CODE.PIECE]: 'Stück',
  [UNIT_CODE.HOUR]: 'Stunde',
  [UNIT_CODE.DAY]: 'Tag',
  [UNIT_CODE.WEEK]: 'Woche',
  [UNIT_CODE.MONTH]: 'Monat',
  [UNIT_CODE.YEAR]: 'Jahr',
  [UNIT_CODE.SERVICE_UNIT]: 'Pauschale',
  [UNIT_CODE.KILOMETRE]: 'Kilometer',
  [UNIT_CODE.METRE]: 'Meter',
  [UNIT_CODE.SQUARE_METRE]: 'Quadratmeter',
  [UNIT_CODE.KILOGRAM]: 'Kilogramm',
  [UNIT_CODE.LITRE]: 'Liter',
  [UNIT_CODE.SET]: 'Satz',
};

/**
 * Rät den Einheitencode aus einem gedruckten Etikett.
 *
 * Nur für den Backfill der Migration und als Vorschlag beim Tippen gedacht.
 * Wer nichts trifft, bekommt `C62` — und nicht etwa einen Fehler: Ein
 * unbekanntes Etikett ist kein Grund, eine bestehende Rechnung
 * unbrauchbar zu machen.
 */
export function guessUnitCode(label: string | null): UnitCode {
  if (label === null) return DEFAULT_UNIT_CODE;
  const normalized = label.trim().toLowerCase().replace(/\./g, '');
  if (normalized === '') return DEFAULT_UNIT_CODE;

  const table: Record<string, UnitCode> = {
    h: UNIT_CODE.HOUR,
    hr: UNIT_CODE.HOUR,
    std: UNIT_CODE.HOUR,
    stunde: UNIT_CODE.HOUR,
    stunden: UNIT_CODE.HOUR,
    tag: UNIT_CODE.DAY,
    tage: UNIT_CODE.DAY,
    pt: UNIT_CODE.DAY,
    woche: UNIT_CODE.WEEK,
    wochen: UNIT_CODE.WEEK,
    monat: UNIT_CODE.MONTH,
    monate: UNIT_CODE.MONTH,
    jahr: UNIT_CODE.YEAR,
    jahre: UNIT_CODE.YEAR,
    stk: UNIT_CODE.PIECE,
    stück: UNIT_CODE.PIECE,
    st: UNIT_CODE.PIECE,
    pauschal: UNIT_CODE.SERVICE_UNIT,
    pauschale: UNIT_CODE.SERVICE_UNIT,
    km: UNIT_CODE.KILOMETRE,
    m: UNIT_CODE.METRE,
    m2: UNIT_CODE.SQUARE_METRE,
    'm²': UNIT_CODE.SQUARE_METRE,
    qm: UNIT_CODE.SQUARE_METRE,
    kg: UNIT_CODE.KILOGRAM,
    l: UNIT_CODE.LITRE,
    satz: UNIT_CODE.SET,
  };

  return table[normalized] ?? DEFAULT_UNIT_CODE;
}

/**
 * Zahlungsart (BT-81, UNTDID 4461).
 *
 * `58` ist die SEPA-Überweisung und der einzige Weg, den diese Anwendung
 * kennt — sie druckt eine IBAN auf die Rechnung und erwartet eine
 * Überweisung darauf. Die übrigen stehen hier, damit der Serializer nicht
 * mit einer nackten Zahl im Code arbeiten muss.
 */
export const PAYMENT_MEANS_CODE = {
  NOT_DEFINED: '1',
  CREDIT_TRANSFER: '30',
  SEPA_CREDIT_TRANSFER: '58',
} as const;
export type PaymentMeansCode = (typeof PAYMENT_MEANS_CODE)[keyof typeof PAYMENT_MEANS_CODE];

/**
 * Dokumentart (BT-3, UNTDID 1001).
 *
 * Ein Storno ist nach der Norm keine eigene Art, sondern eine Gutschrift
 * mit Verweis auf die Vorgängerrechnung (BT-25). Das passt zum
 * Datenmodell: `DOCUMENT_TYPE.CANCELLATION` trägt bereits
 * `cancelsInvoiceId`.
 */
export const DOCUMENT_TYPE_CODE = {
  INVOICE: '380',
  CREDIT_NOTE: '381',
} as const;
export type DocumentTypeCode = (typeof DOCUMENT_TYPE_CODE)[keyof typeof DOCUMENT_TYPE_CODE];

/**
 * Schema der elektronischen Adresse (BT-34-1 / BT-49-1, Codeliste EAS).
 *
 * Nur die vier, die in Deutschland und Frankreich vorkommen. `EM` — die
 * E-Mail-Adresse — ist der Normalfall für eine Agentur, die keine
 * Peppol-Kennung hat.
 */
export const ELECTRONIC_ADDRESS_SCHEME = {
  /** E-Mail-Adresse. */
  EMAIL: 'EM',
  /** GLN (Global Location Number). */
  GLN: '0088',
  /** Leitweg-ID — die Kennung der deutschen öffentlichen Verwaltung. */
  LEITWEG_ID: '0204',
  /** Deutsche Umsatzsteuer-Identifikationsnummer. */
  DE_VAT_ID: '9930',
} as const;
export type ElectronicAddressScheme =
  (typeof ELECTRONIC_ADDRESS_SCHEME)[keyof typeof ELECTRONIC_ADDRESS_SCHEME];
export const ELECTRONIC_ADDRESS_SCHEME_VALUES = Object.values(ELECTRONIC_ADDRESS_SCHEME);

/** Beschriftungen für die Auswahl in der Oberfläche. */
export const ELECTRONIC_ADDRESS_SCHEME_LABELS: Record<ElectronicAddressScheme, string> = {
  [ELECTRONIC_ADDRESS_SCHEME.EMAIL]: 'E-Mail-Adresse',
  [ELECTRONIC_ADDRESS_SCHEME.GLN]: 'GLN',
  [ELECTRONIC_ADDRESS_SCHEME.LEITWEG_ID]: 'Leitweg-ID',
  [ELECTRONIC_ADDRESS_SCHEME.DE_VAT_ID]: 'USt-IdNr. (DE)',
};
