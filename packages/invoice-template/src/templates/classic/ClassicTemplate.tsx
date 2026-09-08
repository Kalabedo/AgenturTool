import {
  DISCOUNT_TYPE,
  formatBasisPoints,
  formatCents,
  formatDateDe,
  formatQuantity,
} from '@agentur-tool/shared';
import type { InvoiceRenderItem, InvoiceRenderModel } from '../../types.js';

/**
 * Das Template „classic".
 *
 * Reines Darstellen: keine Berechnung, kein Datenzugriff, keine Zustände.
 * Genau deshalb kann dieselbe Komponente im iframe der Live-Vorschau laufen
 * und im Backend durch renderToStaticMarkup für das PDF — und genau deshalb
 * zeigt die Vorschau verlässlich das, was später auf dem Papier steht.
 */

const DOCUMENT_TITLES: Record<string, string> = {
  INVOICE: 'Rechnung',
  CANCELLATION: 'Stornorechnung',
};

function joinNonEmpty(parts: (string | null | undefined)[], separator = ' '): string {
  return parts
    .map((part) => (part ?? '').trim())
    .filter((part) => part !== '')
    .join(separator);
}

/**
 * Zeigt die Menge mit ihrer Einheit, sofern eine gepflegt ist.
 * „7,5 Std." liest sich als Rechnungszeile besser als eine nackte 7,5.
 */
function formatQuantityWithUnit(item: InvoiceRenderItem): string {
  return joinNonEmpty([formatQuantity(item.quantity), item.unit]);
}

function formatDiscount(item: InvoiceRenderItem, currency: string): string {
  if (item.discountValue === 0) return '–';
  return item.discountType === DISCOUNT_TYPE.PERCENT
    ? formatBasisPoints(item.discountValue)
    : formatCents(-Math.abs(item.discountCents), currency);
}

/**
 * Das Land wird nur gedruckt, wenn es von dem des Absenders abweicht.
 * Auf einer deutschen Rechnung an einen deutschen Kunden ist „Deutschland"
 * eine Zeile ohne Information.
 */
function foreignCountry(buyerCountry: string, sellerCountry: string): string | null {
  const buyer = buyerCountry.trim();
  if (buyer === '') return null;
  return buyer.toLowerCase() === sellerCountry.trim().toLowerCase() ? null : buyer;
}

export function ClassicTemplate({ model }: { model: InvoiceRenderModel }): JSX.Element {
  const { seller, buyer, tax, template, totals, items, currency } = model;

  const showDiscountColumn = items.some((item) => item.discountValue !== 0);
  const showTaxColumn = tax.showTaxColumn;

  const serviceDateText =
    model.serviceDateTo === null || model.serviceDateTo === model.serviceDate
      ? formatDateDe(model.serviceDate)
      : `${formatDateDe(model.serviceDate)} – ${formatDateDe(model.serviceDateTo)}`;

  const sellerLines = [
    joinNonEmpty(
      [seller.address.street, joinNonEmpty([seller.address.postalCode, seller.address.city])],
      ', ',
    ),
    seller.website,
    seller.email,
    seller.phone,
    seller.vatId === null ? null : `Ust.-ID: ${seller.vatId}`,
    seller.taxNumber === null ? null : `Steuernummer: ${seller.taxNumber}`,
  ].filter((line): line is string => line !== null && line.trim() !== '');

  const paymentLines = [
    seller.bankAccountHolder === null ? null : `Kontoinhaber: ${seller.bankAccountHolder}`,
    seller.iban === null ? null : `IBAN: ${seller.iban}`,
    seller.bic === null ? null : `BIC: ${seller.bic}`,
    seller.bankName === null ? null : seller.bankName,
  ].filter((line): line is string => line !== null && line.trim() !== '');

  const buyerCountry = foreignCountry(buyer.address.country, seller.address.country);
  const buyerLines = [
    buyer.contactName,
    buyer.addressLine,
    buyer.address.street,
    joinNonEmpty([buyer.address.postalCode, buyer.address.city]),
    buyerCountry,
    buyer.vatId === null ? null : `Ust.-ID: ${buyer.vatId}`,
  ].filter((line): line is string => line !== null && line.trim() !== '');

  /**
   * Steuerzeilen entstehen aus den Gruppen des Rechenwegs (D12), nicht aus
   * den Positionen. Eine Rechnung mit 19 % und 7 % bekommt zwei Zeilen.
   * Eine Gruppe mit 0 % bekommt keine: Warum keine Steuer anfällt, sagt der
   * Hinweistext des Steuerprofils, eine Zeile „0,00 €" sagt es nicht.
   */
  const taxRows = totals.taxGroups.filter((group) => group.rateBasisPoints !== 0);

  const notesBlocks = [tax.noteText, model.notes].filter(
    (text): text is string => text !== null && text.trim() !== '',
  );
  const loseNotes = [template.paymentNote, template.closingNote, model.footerNote].filter(
    (text): text is string => text !== null && text.trim() !== '',
  );

  const columnCount = 4 + (showDiscountColumn ? 1 : 0) + (showTaxColumn ? 1 : 0);

  return (
    <div
      className="invoice-root"
      style={
        {
          '--accent': template.accentColor,
          '--font-family': `'${template.fontFamily}'`,
          '--logo-width': `${template.logoWidthMm}mm`,
        } as React.CSSProperties
      }
    >
      <div className="page">
        <header className="header">
          <div className="header__identity">
            {model.logoSrc !== null && <img className="header__logo" src={model.logoSrc} alt="" />}
            <div>
              <p className="header__name">{seller.companyName}</p>
              <ul className="header__lines">
                {sellerLines.map((line) => (
                  <li key={line}>{line}</li>
                ))}
              </ul>
            </div>
          </div>

          {paymentLines.length > 0 && (
            <div className="header__payment">
              <p className="payment__title">Zahlungsdetails:</p>
              <ul className="payment__lines">
                {paymentLines.map((line) => (
                  <li key={line}>{line}</li>
                ))}
              </ul>
            </div>
          )}
        </header>
        <hr className="header__rule" />

        <section className="parties">
          <div className="parties__recipient">
            <p className="parties__label">Empfänger:</p>
            <ul className="recipient__lines">
              {buyer.companyName.trim() === '' && buyerLines.length === 0 ? (
                <li className="recipient__placeholder">Noch kein Kunde ausgewählt</li>
              ) : (
                <li>{buyer.companyName}</li>
              )}
              {buyerLines.map((line) => (
                <li key={line}>{line}</li>
              ))}
            </ul>
          </div>

          <div className="parties__meta">
            <div className="meta__row">
              <span>Rechnungs-Nr.:</span>
              {model.number === null ? (
                <span className="meta__value meta__value--placeholder">Entwurf</span>
              ) : (
                <span className="meta__value">{model.number}</span>
              )}
            </div>
            <div className="meta__row">
              <span>Rechnungsdatum:</span>
              <span className="meta__value">{formatDateDe(model.invoiceDate)}</span>
            </div>
            <div className="meta__row">
              <span>Leistungsdatum:</span>
              <span className="meta__value">{serviceDateText}</span>
            </div>
            <div className="meta__row">
              <span>Fälligkeitsdatum:</span>
              <span className="meta__value">{formatDateDe(model.dueDate)}</span>
            </div>
            {buyer.customerNumber !== null && buyer.customerNumber.trim() !== '' && (
              <div className="meta__row">
                <span>Kundennummer:</span>
                <span className="meta__value">{buyer.customerNumber}</span>
              </div>
            )}
          </div>
        </section>

        <h1 className="doc-title">{DOCUMENT_TITLES[model.documentType] ?? 'Rechnung'}</h1>

        <table className="items">
          <thead>
            <tr>
              <th className="col-index" />
              <th className="col-description" style={{ textAlign: 'left' }}>
                Position
              </th>
              <th className="col-quantity">Anzahl</th>
              <th className="col-price">Preis</th>
              {showDiscountColumn && <th className="col-discount">Rabatt</th>}
              {showTaxColumn && <th className="col-tax">Steuer</th>}
              <th className="col-total">Gesamt</th>
            </tr>
          </thead>
          <tbody>
            {items.length === 0 ? (
              <tr>
                <td className="col-index" />
                <td colSpan={columnCount - 1} style={{ textAlign: 'left' }}>
                  <span className="item__description item__description--empty">
                    Noch keine Positionen erfasst.
                  </span>
                </td>
              </tr>
            ) : (
              items.map((item) => (
                <tr key={item.position}>
                  <td className="col-index">{item.position}</td>
                  <td className="col-description">
                    {item.description.trim() === '' ? (
                      <span className="item__description item__description--empty">
                        Ohne Beschreibung
                      </span>
                    ) : (
                      <span className="item__description">{item.description}</span>
                    )}
                  </td>
                  <td className="col-quantity">{formatQuantityWithUnit(item)}</td>
                  <td className="col-price">{formatCents(item.unitPriceCents, currency)}</td>
                  {showDiscountColumn && (
                    <td className="col-discount">{formatDiscount(item, currency)}</td>
                  )}
                  {showTaxColumn && (
                    <td className="col-tax">{formatBasisPoints(item.taxRateBasisPoints)}</td>
                  )}
                  <td className="col-total">{formatCents(item.netCents, currency)}</td>
                </tr>
              ))
            )}
          </tbody>
        </table>

        <section className="totals">
          <table className="totals__table">
            <tbody>
              {totals.totalDiscountCents !== 0 && (
                <>
                  <tr>
                    <td>Zwischensumme:</td>
                    <td>{formatCents(totals.netCents + totals.totalDiscountCents, currency)}</td>
                  </tr>
                  <tr className="totals__row--discount">
                    <td>Rabatt:</td>
                    <td>{formatCents(-totals.totalDiscountCents, currency)}</td>
                  </tr>
                </>
              )}
              <tr>
                <td>Nettobetrag:</td>
                <td>{formatCents(totals.netCents, currency)}</td>
              </tr>
              {taxRows.map((group) => (
                <tr key={group.rateBasisPoints}>
                  <td>{`zzgl. ${formatBasisPoints(group.rateBasisPoints)} USt.:`}</td>
                  <td>{formatCents(group.taxCents, currency)}</td>
                </tr>
              ))}
              <tr className="totals__row--grand">
                <td>Rechnungsbetrag:</td>
                <td>{formatCents(totals.grossCents, currency)}</td>
              </tr>
            </tbody>
          </table>
        </section>

        {(notesBlocks.length > 0 || loseNotes.length > 0) && (
          <section className="notes">
            {notesBlocks.length > 0 && (
              <div className="notes__block">
                <p className="notes__title">Hinweise und Anmerkungen</p>
                {notesBlocks.map((text) => (
                  <p className="notes__text" key={text}>
                    {text}
                  </p>
                ))}
              </div>
            )}
            {loseNotes.map((text) => (
              <div className="notes__block" key={text}>
                <p className="notes__text">{text}</p>
              </div>
            ))}
          </section>
        )}

        {template.footerText !== null && template.footerText.trim() !== '' && (
          <footer className="doc-footer">{template.footerText}</footer>
        )}
      </div>
    </div>
  );
}
