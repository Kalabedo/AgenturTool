import {
  DISCOUNT_TYPE,
  formatBasisPoints,
  formatCents,
  formatDateDe,
  formatQuantity,
} from '@agentur-tool/shared';
import type { InvoiceRenderItem, InvoiceRenderModel } from '../types.js';

/**
 * Die Teile des Dokuments, die jedes Design gleich zeigt.
 *
 * Vier Designs unterscheiden sich im Kopf, in der Typografie und in den
 * Linien — nicht darin, welche Angaben eine Rechnung trägt. Die
 * Positionstabelle, die Summen und die Hinweise viermal abzuschreiben
 * hieße, vier Gelegenheiten zu schaffen, dass eine Rechnung irgendwo eine
 * Steuerzeile verliert.
 *
 * Jedes Design setzt diese Bausteine in seinen eigenen Rahmen und bringt
 * seinen Kopf selbst mit.
 */

export const DOCUMENT_TITLES: Record<string, string> = {
  INVOICE: 'Rechnung',
  CANCELLATION: 'Stornorechnung',
};

export function joinNonEmpty(parts: (string | null | undefined)[], separator = ' '): string {
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

/** Die aufbereiteten Textzeilen eines Dokuments, fertig zum Setzen. */
export interface DocumentParts {
  sellerLines: string[];
  paymentLines: string[];
  buyerLines: string[];
  serviceDateText: string;
  showDiscountColumn: boolean;
  showTaxColumn: boolean;
  notesBlocks: string[];
  loseNotes: string[];
  title: string;
}

export function documentParts(model: InvoiceRenderModel): DocumentParts {
  const { seller, buyer, tax, template, items } = model;

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

  return {
    sellerLines,
    paymentLines,
    buyerLines,
    serviceDateText:
      model.serviceDateTo === null || model.serviceDateTo === model.serviceDate
        ? formatDateDe(model.serviceDate)
        : `${formatDateDe(model.serviceDate)} – ${formatDateDe(model.serviceDateTo)}`,
    showDiscountColumn: items.some((item) => item.discountValue !== 0),
    showTaxColumn: tax.showTaxColumn,
    notesBlocks: [tax.noteText, model.notes].filter(
      (text): text is string => text !== null && text.trim() !== '',
    ),
    loseNotes: [template.paymentNote, template.closingNote, model.footerNote].filter(
      (text): text is string => text !== null && text.trim() !== '',
    ),
    title: DOCUMENT_TITLES[model.documentType] ?? 'Rechnung',
  };
}

/** Empfängeranschrift. */
export function RecipientBlock({ model }: { model: InvoiceRenderModel }): JSX.Element {
  const { buyer } = model;
  const { buyerLines } = documentParts(model);

  return (
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
  );
}

/** Nummer, Daten, Kundennummer. */
export function MetaBlock({ model }: { model: InvoiceRenderModel }): JSX.Element {
  const { buyer } = model;
  const { serviceDateText } = documentParts(model);

  return (
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
  );
}

/** Die Positionstabelle. */
export function ItemsTable({ model }: { model: InvoiceRenderModel }): JSX.Element {
  const { items, currency } = model;
  const { showDiscountColumn, showTaxColumn } = documentParts(model);
  const columnCount = 4 + (showDiscountColumn ? 1 : 0) + (showTaxColumn ? 1 : 0);

  return (
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
  );
}

/**
 * Die Summen.
 *
 * Steuerzeilen entstehen aus den Gruppen des Rechenwegs (D12), nicht aus
 * den Positionen. Eine Rechnung mit 19 % und 7 % bekommt zwei Zeilen. Eine
 * Gruppe mit 0 % bekommt keine: Warum keine Steuer anfällt, sagt der
 * Hinweistext des Steuerprofils, eine Zeile „0,00 €" sagt es nicht.
 */
export function TotalsBlock({ model }: { model: InvoiceRenderModel }): JSX.Element {
  const { totals, currency } = model;
  const taxRows = totals.taxGroups.filter((group) => group.rateBasisPoints !== 0);

  return (
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
  );
}

/** Hinweistexte und Fußtext. */
export function NotesAndFooter({ model }: { model: InvoiceRenderModel }): JSX.Element | null {
  const { template } = model;
  const { notesBlocks, loseNotes } = documentParts(model);
  const hasNotes = notesBlocks.length > 0 || loseNotes.length > 0;
  const hasFooter = template.footerText !== null && template.footerText.trim() !== '';

  if (!hasNotes && !hasFooter) return null;

  return (
    <>
      {hasNotes && (
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

      {hasFooter && (
        <footer className={template.showFooterRule ? 'doc-footer doc-footer--ruled' : 'doc-footer'}>
          {template.footerText}
        </footer>
      )}
    </>
  );
}
