import { amount, dateString, percent, quantity } from './format.js';
import type { EinvoiceLine, EinvoiceModel, EinvoiceParty, EinvoiceTaxBreakdown } from './model.js';
import { DEFAULT_EINVOICE_PROFILE, type EinvoiceProfile } from './profiles.js';
import { compact, el, group, renderXmlDocument, type XmlNode } from './xml.js';

/**
 * Der Serializer nach CII — UN/CEFACT Cross Industry Invoice, Fassung D16B.
 *
 * ## Die Reihenfolge ist die Regel
 *
 * CII ist ein sequenzstrenges Format: Das Schema schreibt vor, in welcher
 * Reihenfolge die Elemente stehen. Ein vertauschtes Paar ist kein
 * Schönheitsfehler, sondern ein Dokument, das der Prüfer abweist — und es
 * fällt beim Lesen nicht auf, weil beide Fassungen gleich plausibel
 * aussehen.
 *
 * Deshalb steht jede Gruppe hier als eine durchgehende Liste, in der
 * Reihenfolge des Schemas, mit der Feldnummer der Norm daneben. Wer ein
 * Feld ergänzt, fügt es an der richtigen Stelle der Liste ein — und der
 * KoSIT-Validator in der CI sagt, ob es gestimmt hat.
 *
 * ## Weglassen statt leer schreiben
 *
 * `el` und `group` geben `null` zurück, wenn nichts da ist, und `compact`
 * wirft das aus der Liste. Ein leeres `<ram:IBANID></ram:IBANID>` wäre
 * schlechter als gar keines: Die Norm unterscheidet zwischen „nicht
 * angegeben" und „angegeben, aber leer", und das Zweite ist ein Fehler.
 */

const NS = {
  rsm: 'urn:un:unece:uncefact:data:standard:CrossIndustryInvoice:100',
  ram: 'urn:un:unece:uncefact:data:standard:ReusableAggregateBusinessInformationEntity:100',
  udt: 'urn:un:unece:uncefact:data:standard:UnqualifiedDataType:100',
  qdt: 'urn:un:unece:uncefact:data:standard:QualifiedDataType:100',
};

/** Ein Pflichtelement mit Text — im Gegensatz zu `el` verschwindet es nie. */
function required(name: string, text: string, attributes?: Record<string, string>): XmlNode {
  return { name, text, attributes };
}

/**
 * Ein Betrag — **ohne** Währungskennzeichen.
 *
 * Das ist die Stelle, an der CII anders tickt, als man erwartet: Die
 * Währung steht einmal im Kopf (BT-5), und `currencyID` an einem Betrag
 * ist dann nicht etwa überflüssig, sondern verboten. Die Regel heißt
 * CII-DT-031, und sie trifft jeden Betrag der Datei.
 *
 * Die einzige Ausnahme ist `ram:TaxTotalAmount` (BT-110): Dort ist das
 * Attribut Pflicht. Dafür gibt es `taxTotal` weiter unten.
 */
function money(name: string, cents: number): XmlNode {
  return required(name, amount(cents));
}

/** BT-110 — der einzige Betrag, der ein `currencyID` tragen muss. */
function taxTotal(cents: number, currency: string): XmlNode {
  return required('ram:TaxTotalAmount', amount(cents), { currencyID: currency });
}

/** Ein Datum im Format 102 — `YYYYMMDD`, wie die Norm es verlangt. */
function dateTime(name: string, isoDate: string | null): XmlNode | null {
  if (isoDate === null) return null;
  return {
    name,
    children: [required('udt:DateTimeString', dateString(isoDate), { format: '102' })],
  };
}

/** Eine steuerliche Kennung: BT-31 mit Schema `VA`, BT-32 mit `FC`. */
function taxRegistration(id: string | null, schemeId: 'VA' | 'FC'): XmlNode | null {
  if (id === null) return null;
  return {
    name: 'ram:SpecifiedTaxRegistration',
    children: [required('ram:ID', id, { schemeID: schemeId })],
  };
}

/** Eine Partei: BG-4 (Verkäufer) beziehungsweise BG-7 (Käufer). */
function tradeParty(name: string, party: EinvoiceParty): XmlNode {
  // Schema-Reihenfolge: Name, SpecifiedLegalOrganization,
  // DefinedTradeContact, PostalTradeAddress, URIUniversalCommunication,
  // SpecifiedTaxRegistration.
  return {
    name,
    children: compact([
      required('ram:Name', party.name),
      // BG-6: die Kontaktstelle. XRechnung verlangt beim Verkäufer Name
      // (BT-41), Telefon (BT-42) und E-Mail (BT-43) — BR-DE-5 bis BR-DE-7.
      // Schema-Reihenfolge: PersonName, DepartmentName, TypeCode,
      // TelephoneUniversalCommunication, FaxUniversalCommunication,
      // EmailURIUniversalCommunication.
      group('ram:DefinedTradeContact', [
        el('ram:PersonName', party.contactName),
        group('ram:TelephoneUniversalCommunication', [el('ram:CompleteNumber', party.phone)]),
        group('ram:EmailURIUniversalCommunication', [el('ram:URIID', party.email)]),
      ]),
      {
        name: 'ram:PostalTradeAddress',
        children: compact([
          el('ram:PostcodeCode', party.address.postalCode),
          el('ram:LineOne', party.address.line),
          el('ram:CityName', party.address.city),
          // BT-40 / BT-55 ist Pflicht: `required`, damit ein fehlender
          // Ländercode auffällt statt stillschweigend zu verschwinden.
          required('ram:CountryID', party.address.countryCode),
        ]),
      },
      // BT-34 / BT-49. Ohne Schema keine Adresse: `schemeID` ist im Schema
      // ein Pflichtattribut, ein Wert ohne Schema wäre ungültig.
      party.electronicAddress === null || party.electronicAddressScheme === null
        ? null
        : {
            name: 'ram:URIUniversalCommunication',
            children: [
              required('ram:URIID', party.electronicAddress, {
                schemeID: party.electronicAddressScheme,
              }),
            ],
          },
      // Beide dürfen nebeneinanderstehen; § 14 UStG verlangt ohnehin
      // mindestens eines von beiden.
      taxRegistration(party.vatId, 'VA'),
      taxRegistration(party.taxNumber, 'FC'),
    ]),
  };
}

/** Eine Position: BG-25. */
function lineItem(line: EinvoiceLine): XmlNode {
  return {
    name: 'ram:IncludedSupplyChainTradeLineItem',
    children: [
      {
        name: 'ram:AssociatedDocumentLineDocument',
        children: [required('ram:LineID', line.id)],
      },
      {
        name: 'ram:SpecifiedTradeProduct',
        children: [required('ram:Name', line.name)],
      },
      {
        name: 'ram:SpecifiedLineTradeAgreement',
        children: [
          // BT-146: der Nettopreis je Einheit. Einen Bruttopreis (BT-148)
          // gibt es hier nicht — Nachlässe gelten in dieser Anwendung für
          // die Zeile, nicht für den Einzelpreis.
          {
            name: 'ram:NetPriceProductTradePrice',
            children: [required('ram:ChargeAmount', amount(line.unitPriceCents))],
          },
        ],
      },
      {
        name: 'ram:SpecifiedLineTradeDelivery',
        children: [
          required('ram:BilledQuantity', quantity(line.quantity), { unitCode: line.unitCode }),
        ],
      },
      {
        name: 'ram:SpecifiedLineTradeSettlement',
        children: compact([
          {
            name: 'ram:ApplicableTradeTax',
            children: [
              required('ram:TypeCode', 'VAT'),
              required('ram:CategoryCode', line.categoryCode),
              required('ram:RateApplicablePercent', percent(line.rateBasisPoints)),
            ],
          },
          // BT-136: der Nachlass auf die Zeile. `ChargeIndicator false`
          // heißt Nachlass, `true` hieße Zuschlag.
          //
          // Der Grund (BT-139/BT-140) ist Pflicht — BR-42 und BR-CO-23
          // verlangen Code oder Text. `95` ist „Rabatt" nach UNTDID 5189
          // und trifft das, was diese Anwendung als Nachlass kennt: Ein
          // Feld, in dem der Benutzer den Grund selbst benennen könnte,
          // gibt es (noch) nicht.
          line.discountCents === 0
            ? null
            : {
                name: 'ram:SpecifiedTradeAllowanceCharge',
                // Schema-Reihenfolge: ChargeIndicator, SequenceNumeric,
                // CalculationPercent, BasisAmount, ActualAmount,
                // ReasonCode, Reason, CategoryTradeTax.
                children: [
                  {
                    name: 'ram:ChargeIndicator',
                    children: [required('udt:Indicator', 'false')],
                  },
                  money('ram:ActualAmount', line.discountCents),
                  required('ram:ReasonCode', '95'),
                  required('ram:Reason', 'Rabatt'),
                ],
              },
          {
            name: 'ram:SpecifiedTradeSettlementLineMonetarySummation',
            children: [money('ram:LineTotalAmount', line.netCents)],
          },
        ]),
      },
    ],
  };
}

/** Eine Steuergruppe: BG-23. */
function tradeTax(entry: EinvoiceTaxBreakdown): XmlNode {
  // Schema-Reihenfolge: CalculatedAmount, TypeCode, ExemptionReason,
  // BasisAmount, CategoryCode, ExemptionReasonCode, RateApplicablePercent.
  return {
    name: 'ram:ApplicableTradeTax',
    children: compact([
      money('ram:CalculatedAmount', entry.taxCents),
      required('ram:TypeCode', 'VAT'),
      el('ram:ExemptionReason', entry.exemptionReasonText),
      money('ram:BasisAmount', entry.basisCents),
      required('ram:CategoryCode', entry.categoryCode),
      el('ram:ExemptionReasonCode', entry.exemptionReasonCode),
      required('ram:RateApplicablePercent', percent(entry.rateBasisPoints)),
    ]),
  };
}

/** Schreibt das Dokument. */
export function renderCii(
  model: EinvoiceModel,
  profile: EinvoiceProfile = DEFAULT_EINVOICE_PROFILE,
): string {
  const currency = model.currency;

  const root: XmlNode = {
    name: 'rsm:CrossIndustryInvoice',
    attributes: {
      'xmlns:rsm': NS.rsm,
      'xmlns:ram': NS.ram,
      'xmlns:udt': NS.udt,
      'xmlns:qdt': NS.qdt,
    },
    children: [
      {
        name: 'rsm:ExchangedDocumentContext',
        // Schema-Reihenfolge: BusinessProcess… vor GuidelineSpecified….
        children: compact([
          // BT-23: der Geschäftsprozess. In XRechnung Pflicht, in der
          // reinen Norm nicht — deshalb am Profil und nicht fest verdrahtet.
          profile.businessProcessId === null
            ? null
            : {
                name: 'ram:BusinessProcessSpecifiedDocumentContextParameter',
                children: [required('ram:ID', profile.businessProcessId)],
              },
          {
            name: 'ram:GuidelineSpecifiedDocumentContextParameter',
            // BT-24: woran ein Prüfwerkzeug erkennt, gegen welche Regeln
            // es prüfen soll.
            children: [required('ram:ID', profile.specificationId)],
          },
        ]),
      },
      {
        name: 'rsm:ExchangedDocument',
        children: compact([
          required('ram:ID', model.number),
          required('ram:TypeCode', model.typeCode),
          dateTime('ram:IssueDateTime', model.issueDate),
          // BT-22: eine freie Anmerkung. Was auf dem Papier unter den
          // Positionen steht, steht hier.
          group('ram:IncludedNote', [el('ram:Content', model.note)]),
        ]),
      },
      {
        name: 'rsm:SupplyChainTradeTransaction',
        children: [
          ...model.lines.map((line) => lineItem(line)),
          {
            name: 'ram:ApplicableHeaderTradeAgreement',
            children: compact([
              // BT-10 steht vor den Parteien. Das ist die Stelle, an der
              // XRechnung strenger ist als die EU-Norm: dort Pflicht, hier
              // nur vorhanden, wenn erfasst.
              el('ram:BuyerReference', model.buyerReference),
              tradeParty('ram:SellerTradeParty', model.seller),
              tradeParty('ram:BuyerTradeParty', model.buyer),
            ]),
          },
          {
            name: 'ram:ApplicableHeaderTradeDelivery',
            children: compact([
              // BT-72: der Tag der Leistung. Wird ein Zeitraum
              // abgerechnet, steht er zusätzlich als BG-14 weiter unten.
              group('ram:ActualDeliverySupplyChainEvent', [
                dateTime('ram:OccurrenceDateTime', model.deliveryDate),
              ]),
            ]),
          },
          {
            name: 'ram:ApplicableHeaderTradeSettlement',
            // Schema-Reihenfolge: InvoiceCurrencyCode,
            // SpecifiedTradeSettlementPaymentMeans, ApplicableTradeTax,
            // BillingSpecifiedPeriod, SpecifiedTradePaymentTerms,
            // HeaderMonetarySummation, InvoiceReferencedDocument.
            children: compact([
              required('ram:InvoiceCurrencyCode', currency),
              // BG-17: die Überweisung. Ohne IBAN entfällt die Gruppe —
              // dann gibt es nichts, worauf gezahlt werden könnte, und der
              // Prüfbericht sagt das deutlicher als ein leeres Element.
              model.iban === null
                ? null
                : group('ram:SpecifiedTradeSettlementPaymentMeans', [
                    required('ram:TypeCode', model.paymentMeansCode),
                    group('ram:PayeePartyCreditorFinancialAccount', [
                      el('ram:IBANID', model.iban),
                      el('ram:AccountName', model.accountHolder),
                    ]),
                    group('ram:PayeeSpecifiedCreditorFinancialInstitution', [
                      el('ram:BICID', model.bic),
                    ]),
                  ]),
              ...model.taxBreakdown.map((entry) => tradeTax(entry)),
              // BG-14: der Abrechnungszeitraum, wenn einer angegeben ist.
              group('ram:BillingSpecifiedPeriod', [
                dateTime('ram:StartDateTime', model.periodStart),
                dateTime('ram:EndDateTime', model.periodEnd),
              ]),
              group('ram:SpecifiedTradePaymentTerms', [
                dateTime('ram:DueDateDateTime', model.dueDate),
              ]),
              {
                name: 'ram:SpecifiedTradeSettlementHeaderMonetarySummation',
                // Schema-Reihenfolge: LineTotal, ChargeTotal,
                // AllowanceTotal, TaxBasisTotal, TaxTotal, GrandTotal,
                // TotalPrepaid, DuePayable.
                children: [
                  money('ram:LineTotalAmount', model.lineTotalCents),
                  money('ram:TaxBasisTotalAmount', model.taxBasisTotalCents),
                  taxTotal(model.taxTotalCents, currency),
                  money('ram:GrandTotalAmount', model.grandTotalCents),
                  money('ram:DuePayableAmount', model.duePayableCents),
                ],
              },
              // BT-25: die Rechnung, die dieses Storno aufhebt.
              group('ram:InvoiceReferencedDocument', [
                el('ram:IssuerAssignedID', model.precedingInvoiceNumber),
              ]),
            ]),
          },
        ],
      },
    ],
  };

  return renderXmlDocument(root);
}
