import { templateStyleVars } from '../../design/variables.js';
import {
  ItemsTable,
  MetaBlock,
  NotesAndFooter,
  RecipientBlock,
  TotalsBlock,
  documentParts,
} from '../../design/document.jsx';
import type { InvoiceRenderModel } from '../../types.js';

/**
 * Das Design „modern".
 *
 * Ein Farbband über die volle Blattbreite, das Logo rechts darin, die
 * Zahlungsdetails als eigener Streifen darunter. Der Rumpf sitzt in einem
 * `.page__body`, weil die Seite oben keinen Rand hat — das Band braucht
 * den Platz, alles andere holt ihn sich zurück.
 */
export function ModernTemplate({ model }: { model: InvoiceRenderModel }): JSX.Element {
  const { seller, template } = model;
  const { sellerLines, paymentLines, title } = documentParts(model);

  return (
    <div className="invoice-root" style={templateStyleVars(template) as React.CSSProperties}>
      <div className="page">
        <header className="header">
          <div className="header__identity">
            <p className="header__name">{seller.companyName}</p>
            <ul className="header__lines">
              {sellerLines.map((line) => (
                <li key={line}>{line}</li>
              ))}
            </ul>
          </div>

          {template.showLogo && model.logoSrc !== null && (
            <img className="header__logo" src={model.logoSrc} alt="" />
          )}
        </header>

        <div className="page__body">
          {template.showPaymentBlock && paymentLines.length > 0 && (
            <div className="header__payment">
              <p className="payment__title">Zahlungsdetails:</p>
              <ul className="payment__lines">
                {paymentLines.map((line) => (
                  <li key={line}>{line}</li>
                ))}
              </ul>
            </div>
          )}

          <section className="parties">
            <RecipientBlock model={model} />
            <MetaBlock model={model} />
          </section>

          <h1 className="doc-title">{title}</h1>

          <ItemsTable model={model} />
          <TotalsBlock model={model} />
          <NotesAndFooter model={model} />
        </div>
      </div>
    </div>
  );
}
