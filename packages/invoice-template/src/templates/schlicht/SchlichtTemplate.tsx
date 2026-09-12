import { templateStyleVars } from '../../design/variables.js';
import {
  ItemsTable,
  MetaBlock,
  NotesAndFooter,
  RecipientBlock,
  TotalsBlock,
  documentParts,
} from '../../design/document.jsx';
import type { PageGeometry } from '../../design/page.js';
import type { InvoiceRenderModel } from '../../types.js';

/**
 * Das Design „schlicht".
 *
 * Wie „classic" im Aufbau, aber ohne Linien und mit deutlich mehr Luft.
 * Die Zahlungsdetails stehen nicht im Kopf, sondern am Fuß bei den
 * Hinweisen — der Kopf soll nur Absender und Empfänger tragen.
 */
export function SchlichtTemplate({ model }: { model: InvoiceRenderModel }): JSX.Element {
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
              <p className="payment__title">Zahlungsdetails</p>
              <ul className="payment__lines">
                {paymentLines.map((line) => (
                  <li key={line}>{line}</li>
                ))}
              </ul>
            </div>
          )}
        </header>

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

/**
 * Die Fußzeile von „schlicht": nur die Seitenzahl, mittig.
 *
 * Die gemeinsame Fußzeile stellt links das Dokumentkennzeichen daneben.
 * Das ist nützlich, passt aber nicht zu einem Design, dessen ganzer Gedanke
 * darin besteht, nur das Nötige zu zeigen — die Rechnungsnummer steht schon
 * oben auf jeder Seite, an der sie jemand sucht.
 *
 * Wie die gemeinsame gilt: Chromium rendert dieses Fragment in einem
 * eigenen Dokument ohne Stylesheet und ohne die eingebettete Schrift.
 * Deshalb alles inline und eine generische Familie.
 */
export function schlichtFooter(model: InvoiceRenderModel, page: PageGeometry): string {
  return [
    '<div style="width:100%;box-sizing:border-box;',
    `padding:0 ${page.marginSideMm + page.edgeGapMm}mm 0 ${page.marginSideMm}mm;`,
    `font-family:Helvetica,Arial,sans-serif;font-size:7.5pt;color:${model.template.inkSoftColor};`,
    'text-align:center">',
    '<span class="pageNumber"></span>',
    '</div>',
  ].join('');
}
