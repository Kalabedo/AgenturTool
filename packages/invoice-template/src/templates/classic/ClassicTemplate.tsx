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
 * Das Template „classic".
 *
 * Reines Darstellen: keine Berechnung, kein Datenzugriff, keine Zustände.
 * Genau deshalb kann dieselbe Komponente im iframe der Live-Vorschau laufen
 * und im Backend durch renderToStaticMarkup für das PDF — und genau deshalb
 * zeigt die Vorschau verlässlich das, was später auf dem Papier steht.
 *
 * Der Kopf steht hier, die Bausteine darunter kommen aus `design/document`:
 * Was eine Rechnung an Angaben trägt, ist bei allen vier Designs dasselbe.
 * Eigen ist classic die Anordnung — Absender links, Zahlungsdetails rechts,
 * darunter eine feine Linie.
 */
export function ClassicTemplate({ model }: { model: InvoiceRenderModel }): JSX.Element {
  const { seller, template } = model;
  const { sellerLines, paymentLines, title } = documentParts(model);

  return (
    <div className="invoice-root" style={templateStyleVars(template) as React.CSSProperties}>
      <div className="page">
        <header className="header">
          <div className="header__identity">
            {template.showLogo && model.logoSrc !== null && (
              <img className="header__logo" src={model.logoSrc} alt="" />
            )}
            <div>
              <p className="header__name">{seller.companyName}</p>
              <ul className="header__lines">
                {sellerLines.map((line) => (
                  <li key={line}>{line}</li>
                ))}
              </ul>
            </div>
          </div>

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
        </header>
        <hr className="header__rule" />

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
  );
}
