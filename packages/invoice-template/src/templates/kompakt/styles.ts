import { pageCss, type PageGeometry } from '../../design/page.js';
import { RESET_CSS } from '../../design/reset.js';

/**
 * Das Stylesheet des Designs „kompakt".
 *
 * Gedacht für Rechnungen mit vielen Positionen — eine abgerechnete
 * Zeiterfassung über einen Monat hat schnell dreißig Zeilen. Alles ist
 * enger gesetzt: kleinere Grundschrift, engere Zeilen, schmalere Ränder.
 * Damit passt spürbar mehr auf ein Blatt, was Papier und Porto spart und
 * dem Empfänger das Blättern erspart.
 *
 * Die Grenze nach unten ist die Lesbarkeit: 8,75 pt ist klein, aber auf
 * Papier noch bequem lesbar. Darunter wird aus „kompakt" „unzumutbar".
 */

export const KOMPAKT_PAGE: PageGeometry = {
  widthMm: 210,
  heightMm: 297,
  marginTopMm: 10,
  marginSideMm: 10,
  footerMm: 14,
  edgeGapMm: 0.75,
};

export const KOMPAKT_CSS = `${pageCss(KOMPAKT_PAGE)}
:root {
  --accent: #1e293b;
  --ink: #1f2328;
  --ink-soft: #52606d;
  --rule: #dfe3e8;
  --band: #f1f3f5;
  --logo-width: 30mm;
  --font-family: 'Open Sans';
  --density: 1;
}
${RESET_CSS}
.invoice-root {
  font-size: 8.75pt;
  line-height: 1.4;
}

/* ---------- Kopf ---------- */

/*
 * Absender und Zahlungsdetails stehen in einer Zeile, beide einzeilig
 * umbrechend: Der Kopf soll so wenig Höhe wie möglich kosten, denn jeder
 * Millimeter hier ist eine Position weniger auf Seite eins.
 */
.header {
  display: flex;
  align-items: flex-start;
  gap: 6mm;
}

.header__identity {
  display: flex;
  align-items: flex-start;
  gap: 4mm;
  flex: 1 1 auto;
  min-width: 0;
}

.header__logo {
  width: var(--logo-width);
  max-height: 22mm;
  object-fit: contain;
  flex: 0 0 auto;
}

.header__name {
  margin: 0 0 0.5mm;
  font-size: 11.5pt;
  font-weight: 700;
  line-height: 1.2;
  color: var(--accent);
}

.header__lines,
.payment__lines {
  margin: 0;
  padding: 0;
  list-style: none;
}

/* Die Absenderzeilen laufen nebeneinander statt untereinander. */
.header__lines {
  display: flex;
  flex-wrap: wrap;
  gap: 0 3mm;
  color: var(--ink-soft);
}

.header__payment {
  flex: 0 0 auto;
  max-width: 58mm;
  text-align: right;
  color: var(--ink-soft);
}

.payment__title {
  margin: 0;
  font-weight: 700;
  color: var(--ink);
}

.header__rule {
  border: 0;
  border-top: 1px solid var(--rule);
  margin: 4mm 0 0;
}

/* ---------- Empfänger und Eckdaten ---------- */

.parties {
  display: flex;
  gap: 8mm;
  margin-top: 4.5mm;
}

.parties__recipient {
  flex: 1 1 auto;
  min-width: 0;
}

.parties__label {
  margin: 0 0 0.5mm;
  font-weight: 700;
}

.recipient__placeholder {
  color: var(--ink-soft);
  font-style: italic;
}

.recipient__lines {
  margin: 0;
  padding: 0;
  list-style: none;
}

.recipient__lines li,
.header__lines li,
.payment__lines li {
  overflow-wrap: anywhere;
}

.parties__meta {
  flex: 0 0 auto;
  width: 66mm;
}

.meta__row {
  display: flex;
  justify-content: space-between;
  gap: 3mm;
}

.meta__value {
  text-align: right;
  white-space: nowrap;
}

.meta__value--placeholder {
  color: var(--ink-soft);
}

/* ---------- Titel ---------- */

.doc-title {
  margin: 5mm 0 2.5mm;
  font-size: 14pt;
  font-weight: 700;
  line-height: 1.2;
  color: var(--accent);
}

/* ---------- Positionen ---------- */

.items {
  width: 100%;
  border-collapse: collapse;
}

.items th {
  padding: calc(1.4mm * var(--density)) 1.5mm;
  background: var(--band);
  font-weight: 700;
  text-align: right;
  white-space: nowrap;
}

/*
 * Die engste Zeile des Satzes. 1,8 mm gegenüber 3 mm bei „classic" —
 * daher der Name.
 */
.items td {
  padding: calc(1.8mm * var(--density)) 1.5mm;
  border-bottom: 1px solid var(--rule);
  text-align: right;
  vertical-align: top;
}

.items .col-index {
  width: 6mm;
  text-align: left;
  color: var(--ink-soft);
}

.items .col-description {
  text-align: left;
  width: 100%;
}

.items .col-quantity,
.items .col-price,
.items .col-discount,
.items .col-tax,
.items .col-total {
  white-space: nowrap;
}

.item__description {
  white-space: pre-wrap;
  overflow-wrap: anywhere;
}

.item__description--empty {
  color: var(--ink-soft);
  font-style: italic;
}

/* ---------- Summen ---------- */

.totals {
  display: flex;
  justify-content: flex-end;
  margin-top: calc(4mm * var(--density));
}

.totals__table {
  width: 72mm;
  border-collapse: collapse;
}

.totals__table td {
  padding: calc(1.4mm * var(--density)) 1.5mm;
}

.totals__table td:last-child {
  text-align: right;
  white-space: nowrap;
}

.totals__row--grand td {
  background: var(--band);
  border-top: 1px solid var(--rule);
  font-weight: 700;
}

.totals__row--discount td {
  color: var(--ink-soft);
}

/* ---------- Hinweise ---------- */

.notes {
  margin-top: calc(7mm * var(--density));
}

.notes__block + .notes__block {
  margin-top: 3mm;
}

.notes__title {
  margin: 0 0 1mm;
  font-weight: 700;
}

.notes__text {
  margin: 0;
  white-space: pre-wrap;
  overflow-wrap: anywhere;
}

/* ---------- Fuß ---------- */

.doc-footer {
  margin-top: calc(7mm * var(--density));
  padding-top: 2.5mm;
  color: var(--ink-soft);
  text-align: center;
  white-space: pre-wrap;
  font-size: 8pt;
}

.doc-footer--ruled {
  border-top: 1px solid var(--rule);
}
`;
