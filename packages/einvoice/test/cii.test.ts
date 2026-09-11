import { describe, expect, it } from 'vitest';
import { DOCUMENT_TYPE } from '@agentur-tool/shared';
import { renderCii } from '../src/cii.js';
import { buildEinvoiceModel } from '../src/model.js';
import { EN16931_CII, XRECHNUNG_3_0 } from '../src/profiles.js';
import { escapeXml } from '../src/xml.js';
import { SOURCE, TOTALS } from './fixtures.js';

const xml = renderCii(buildEinvoiceModel(SOURCE, TOTALS));

/**
 * Die Reihenfolge zweier Elemente im Text.
 *
 * CII ist sequenzstreng; die Prüfung, dass A vor B steht, ist deshalb eine
 * echte fachliche Prüfung und keine Formsache.
 */
function comesBefore(haystack: string, first: string, second: string): boolean {
  const a = haystack.indexOf(first);
  const b = haystack.indexOf(second);
  return a !== -1 && b !== -1 && a < b;
}

describe('renderCii', () => {
  it('schreibt eine wohlgeformte Datei mit Deklaration', () => {
    expect(xml.startsWith('<?xml version="1.0" encoding="UTF-8"?>')).toBe(true);
    expect(xml).toContain('<rsm:CrossIndustryInvoice');
    expect(xml.trimEnd().endsWith('</rsm:CrossIndustryInvoice>')).toBe(true);
  });

  it('nennt das Profil, gegen das geprüft werden soll', () => {
    expect(xml).toContain(XRECHNUNG_3_0.specificationId);

    // Für Empfänger außerhalb Deutschlands die reine Norm.
    const neutral = renderCii(buildEinvoiceModel(SOURCE, TOTALS), EN16931_CII);
    expect(neutral).toContain('<ram:ID>urn:cen.eu:en16931:2017</ram:ID>');
  });

  it('schreibt Nummer, Art und Datum im Format der Norm', () => {
    expect(xml).toContain('<ram:ID>2026-0007</ram:ID>');
    expect(xml).toContain('<ram:TypeCode>380</ram:TypeCode>');
    // Format 102: YYYYMMDD, ohne Bindestriche und ohne Zeitzone.
    expect(xml).toContain('<udt:DateTimeString format="102">20260301</udt:DateTimeString>');
  });

  it('schreibt die Käuferreferenz vor die Parteien', () => {
    expect(xml).toContain('<ram:BuyerReference>04011000-1234512345-06</ram:BuyerReference>');
    expect(comesBefore(xml, '<ram:BuyerReference>', '<ram:SellerTradeParty>')).toBe(true);
    expect(comesBefore(xml, '<ram:SellerTradeParty>', '<ram:BuyerTradeParty>')).toBe(true);
  });

  it('schreibt beide elektronischen Adressen mit Schema', () => {
    expect(xml).toContain('<ram:URIID schemeID="EM">rechnung@xyz-agentur.de</ram:URIID>');
    expect(xml).toContain('<ram:URIID schemeID="EM">rechnung@nordwind.example</ram:URIID>');
  });

  it('schreibt die USt-IdNr. mit Schema VA', () => {
    expect(xml).toContain('<ram:ID schemeID="VA">DE455137261</ram:ID>');
    expect(xml).toContain('<ram:ID schemeID="VA">DE987654321</ram:ID>');
  });

  it('schreibt Beträge mit zwei Nachkommastellen', () => {
    expect(xml).toContain('<ram:GrandTotalAmount>1504.35</ram:GrandTotalAmount>');
    expect(xml).toContain('<ram:TaxBasisTotalAmount>1305.00</ram:TaxBasisTotalAmount>');
  });

  it('setzt das Währungskennzeichen nur an die Gesamtsteuer', () => {
    // CII-DT-031: Die Währung steht einmal im Kopf. An einem Betrag ist
    // `currencyID` nicht überflüssig, sondern verboten — mit der einen
    // Ausnahme BT-110, wo es Pflicht ist.
    expect(xml).toContain('<ram:TaxTotalAmount currencyID="EUR">199.35</ram:TaxTotalAmount>');
    expect(xml.match(/currencyID="EUR"/g) ?? []).toHaveLength(1);
  });

  it('hält die Reihenfolge der Summenelemente ein', () => {
    // Schema-Reihenfolge; vertauscht sähe die Datei genauso plausibel aus
    // und wäre trotzdem ungültig.
    expect(comesBefore(xml, 'ram:LineTotalAmount', 'ram:TaxBasisTotalAmount')).toBe(true);
    expect(comesBefore(xml, 'ram:TaxBasisTotalAmount', 'ram:TaxTotalAmount')).toBe(true);
    expect(comesBefore(xml, 'ram:TaxTotalAmount', 'ram:GrandTotalAmount')).toBe(true);
    expect(comesBefore(xml, 'ram:GrandTotalAmount', 'ram:DuePayableAmount')).toBe(true);
  });

  it('hält die Reihenfolge innerhalb der Steuergruppe ein', () => {
    // Nur im Kopfteil suchen: `ram:CategoryCode` steht auch in jeder
    // Position, und zwar weiter oben in der Datei.
    const settlement = xml.slice(xml.indexOf('<ram:ApplicableHeaderTradeSettlement>'));
    const firstGroup = settlement.slice(
      settlement.indexOf('<ram:ApplicableTradeTax>'),
      settlement.indexOf('</ram:ApplicableTradeTax>'),
    );

    expect(comesBefore(firstGroup, 'ram:CalculatedAmount', 'ram:BasisAmount')).toBe(true);
    expect(comesBefore(firstGroup, 'ram:BasisAmount', 'ram:CategoryCode')).toBe(true);
    expect(comesBefore(firstGroup, 'ram:CategoryCode', 'ram:RateApplicablePercent')).toBe(true);
  });

  it('schreibt beide Steuergruppen', () => {
    expect(xml).toContain('<ram:RateApplicablePercent>19.00</ram:RateApplicablePercent>');
    expect(xml).toContain('<ram:RateApplicablePercent>7.00</ram:RateApplicablePercent>');
    expect(xml).toContain('<ram:CalculatedAmount>171.00</ram:CalculatedAmount>');
    expect(xml).toContain('<ram:CalculatedAmount>28.35</ram:CalculatedAmount>');
  });

  it('schreibt Menge mit Einheitencode', () => {
    expect(xml).toContain('<ram:BilledQuantity unitCode="HUR">7.500</ram:BilledQuantity>');
    expect(xml).toContain('<ram:BilledQuantity unitCode="E48">1.000</ram:BilledQuantity>');
  });

  it('schreibt den Zeilenrabatt nur, wo es einen gibt', () => {
    const allowances = xml.match(/ram:SpecifiedTradeAllowanceCharge/g) ?? [];
    // Öffnendes und schließendes Tag einer einzigen Zeile.
    expect(allowances).toHaveLength(2);
    expect(xml).toContain('<ram:ActualAmount>45.00</ram:ActualAmount>');
    // BR-42 und BR-CO-23: ohne Grund kein Nachlass.
    expect(xml).toContain('<ram:ReasonCode>95</ram:ReasonCode>');
  });

  it('nennt den Geschäftsprozess nur dort, wo er verlangt ist', () => {
    // BT-23 ist in XRechnung Pflicht, in der reinen EU-Norm nicht.
    expect(xml).toContain('urn:fdc:peppol.eu:2017:poacc:billing:01:1.0');
    const neutral = renderCii(buildEinvoiceModel(SOURCE, TOTALS), EN16931_CII);
    expect(neutral).not.toContain('ram:BusinessProcessSpecifiedDocumentContextParameter');
  });

  it('schreibt die Kontaktstelle des Verkäufers vollständig', () => {
    // BR-DE-5 bis BR-DE-7: Name, Telefon und E-Mail sind in XRechnung
    // Pflicht — eine Strenge der deutschen CIUS.
    expect(xml).toContain('<ram:PersonName>XYZ - Agentur</ram:PersonName>');
    expect(xml).toContain('<ram:CompleteNumber>+49 7961 1234567</ram:CompleteNumber>');
    expect(xml).toContain('<ram:URIID>hello@xyz-agentur.de</ram:URIID>');
  });

  it('schreibt die Bankverbindung', () => {
    expect(xml).toContain('<ram:TypeCode>58</ram:TypeCode>');
    expect(xml).toContain('<ram:IBANID>DE12202208000052019114</ram:IBANID>');
    expect(xml).toContain('<ram:BICID>SXPYDEHHXXX</ram:BICID>');
  });

  it('lässt die Zahlungsgruppe weg, wenn es keine IBAN gibt', () => {
    const ohneIban = renderCii(
      buildEinvoiceModel(
        { ...SOURCE, seller: { ...SOURCE.seller, iban: null, bic: null } },
        TOTALS,
      ),
    );
    expect(ohneIban).not.toContain('ram:SpecifiedTradeSettlementPaymentMeans');
    // Ein leeres Element wäre schlechter als gar keines.
    expect(ohneIban).not.toContain('<ram:IBANID></ram:IBANID>');
  });

  it('schreibt den Abrechnungszeitraum', () => {
    expect(xml).toContain('<udt:DateTimeString format="102">20260201</udt:DateTimeString>');
    expect(xml).toContain('<udt:DateTimeString format="102">20260228</udt:DateTimeString>');
  });

  it('verweist beim Storno auf die aufgehobene Rechnung', () => {
    const storno = renderCii(
      buildEinvoiceModel(
        { ...SOURCE, documentType: DOCUMENT_TYPE.CANCELLATION, number: '2026-0008' },
        TOTALS,
        { precedingInvoiceNumber: '2026-0007' },
      ),
    );
    expect(storno).toContain('<ram:TypeCode>381</ram:TypeCode>');
    expect(storno).toContain('<ram:IssuerAssignedID>2026-0007</ram:IssuerAssignedID>');
  });

  it('lässt den Befreiungsgrund nur erscheinen, wo es einen gibt', () => {
    expect(xml).not.toContain('ram:ExemptionReason');

    const reverseCharge = renderCii(
      buildEinvoiceModel(
        {
          ...SOURCE,
          tax: {
            ...SOURCE.tax,
            taxCategoryCode: 'AE',
            exemptionReasonCode: 'VATEX-EU-AE',
            exemptionReasonText: 'Steuerschuldnerschaft des Leistungsempfängers.',
          },
        },
        TOTALS,
      ),
    );
    expect(reverseCharge).toContain(
      '<ram:ExemptionReason>Steuerschuldnerschaft des Leistungsempfängers.</ram:ExemptionReason>',
    );
    expect(reverseCharge).toContain(
      '<ram:ExemptionReasonCode>VATEX-EU-AE</ram:ExemptionReasonCode>',
    );
    expect(reverseCharge).toContain('<ram:CategoryCode>AE</ram:CategoryCode>');
  });

  it('maskiert Sonderzeichen in Freitexten', () => {
    // „Müller & Söhne" kommt im Alltag vor. Ohne Maskierung entstünde eine
    // Datei, die kein Prüfwerkzeug mehr liest.
    const heikel = renderCii(
      buildEinvoiceModel(
        {
          ...SOURCE,
          buyer: { ...SOURCE.buyer, companyName: 'Müller & Söhne <GmbH>' },
        },
        TOTALS,
      ),
    );
    expect(heikel).toContain('Müller &amp; Söhne &lt;GmbH&gt;');
    expect(heikel).not.toContain('<GmbH>');
  });
});

describe('escapeXml', () => {
  it('maskiert alle fünf Zeichen', () => {
    expect(escapeXml(`&<>"'`)).toBe('&amp;&lt;&gt;&quot;&apos;');
  });

  it('maskiert das kaufmännische Und zuerst', () => {
    // Andernfalls würde aus `&` erst `&amp;` und daraus `&amp;amp;`.
    expect(escapeXml('&lt;')).toBe('&amp;lt;');
  });
});
