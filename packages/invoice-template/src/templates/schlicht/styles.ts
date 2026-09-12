import { pageCss, type PageGeometry } from '../../design/page.js';
import { RESET_CSS } from '../../design/reset.js';

/**
 * Das Stylesheet des Designs „schlicht".
 *
 * Keine Linien, keine Flächen, viel Weißraum. Was bei den anderen Designs
 * ein Rahmen leistet, leistet hier der Abstand: Blöcke stehen weiter
 * auseinander, Zeilen atmen, und die Spalten der Tabelle werden allein
 * durch ihre Ausrichtung gehalten.
 *
 * Deshalb meldet dieses Design auch weder eine Linien- noch eine
 * Flächenfarbe als Regler — beide hätten hier nichts zu färben.
 *
 * Größere Grundschrift als die anderen (10,25 pt), weil mehr Weißraum eine
 * zu kleine Schrift verloren wirken lässt.
 */

export const SCHLICHT_PAGE: PageGeometry = {
  widthMm: 210,
  heightMm: 297,
  marginTopMm: 20,
  marginSideMm: 22,
  footerMm: 18,
  edgeGapMm: 0.75,
};

export const SCHLICHT_CSS = `${pageCss(SCHLICHT_PAGE)}
:root {
  --accent: #1f2328;
  --ink: #1f2328;
  --ink-soft: #6b7280;
  --rule: transparent;
  --band: transparent;
  --logo-width: 34mm;
  --font-family: 'Source Serif 4';
  --density: 1;
}
${RESET_CSS}
.invoice-root {
  font-size: 10.25pt;
  line-height: 1.6;
}

/* ---------- Kopf ---------- */

.header {
  display: flex;
  align-items: flex-start;
  gap: 8mm;
}

.header__identity {
  display: flex;
  align-items: flex-start;
  gap: 6mm;
  flex: 1 1 auto;
  min-width: 0;
}

.header__logo {
  width: var(--logo-width);
  max-height: 30mm;
  object-fit: contain;
  flex: 0 0 auto;
}

.header__name {
  margin: 0 0 1mm;
  font-size: 13pt;
  font-weight: 700;
  letter-spacing: 0.02em;
  line-height: 1.3;
  color: var(--accent);
}

.header__lines,
.payment__lines {
  margin: 0;
  padding: 0;
  list-style: none;
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
  font-weight: 400;
}

/* Keine Linie unter dem Kopf — der Abstand trennt. */
.header__rule {
  display: none;
}

/* ---------- Empfänger und Eckdaten ---------- */

.parties {
  display: flex;
  gap: 12mm;
  margin-top: calc(14mm * var(--density));
}

.parties__recipient {
  flex: 1 1 auto;
  min-width: 0;
}

.parties__label {
  margin: 0 0 1.5mm;
  font-size: 8.5pt;
  font-weight: 400;
  letter-spacing: 0.09em;
  text-transform: uppercase;
  color: var(--ink-soft);
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
  width: 70mm;
}

.meta__row {
  display: flex;
  justify-content: space-between;
  gap: 4mm;
  padding: 0.4mm 0;
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
  margin: calc(14mm * var(--density)) 0 calc(6mm * var(--density));
  font-size: 17pt;
  font-weight: 400;
  letter-spacing: 0.04em;
  line-height: 1.2;
  color: var(--accent);
}

/* ---------- Positionen ---------- */

.items {
  width: 100%;
  border-collapse: collapse;
}

/*
 * Der Tabellenkopf trägt weder Fläche noch Linie: Er steht klein,
 * gesperrt und in Versalien — das genügt, um ihn als Kopf zu lesen.
 */
.items th {
  padding: 0 2mm calc(2.5mm * var(--density));
  font-size: 8.5pt;
  font-weight: 400;
  letter-spacing: 0.09em;
  text-transform: uppercase;
  text-align: right;
  white-space: nowrap;
  color: var(--ink-soft);
}

.items td {
  padding: calc(3.4mm * var(--density)) 2mm;
  text-align: right;
  vertical-align: top;
}

.items .col-index {
  width: 8mm;
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
  margin-top: calc(9mm * var(--density));
}

.totals__table {
  width: 82mm;
  border-collapse: collapse;
}

.totals__table td {
  padding: calc(1.6mm * var(--density)) 2mm;
}

.totals__table td:last-child {
  text-align: right;
  white-space: nowrap;
}

/*
 * Der Gesamtbetrag bekommt keine Fläche, sondern Gewicht und Größe. Eine
 * einzelne feine Linie darüber ist die einzige des ganzen Dokuments — sie
 * trennt die Summe von ihren Bestandteilen.
 */
.totals__row--grand td {
  padding-top: calc(2.4mm * var(--density));
  border-top: 1px solid var(--ink);
  font-size: 11.5pt;
  font-weight: 700;
}

.totals__row--discount td {
  color: var(--ink-soft);
}

/* ---------- Hinweise ---------- */

.notes {
  margin-top: calc(16mm * var(--density));
  max-width: 130mm;
}

.notes__block + .notes__block {
  margin-top: 6mm;
}

.notes__title {
  margin: 0 0 1.5mm;
  font-size: 8.5pt;
  font-weight: 400;
  letter-spacing: 0.09em;
  text-transform: uppercase;
  color: var(--ink-soft);
}

.notes__text {
  margin: 0;
  white-space: pre-wrap;
  overflow-wrap: anywhere;
}

/* ---------- Fuß ---------- */

.doc-footer {
  margin-top: calc(16mm * var(--density));
  padding-top: 4mm;
  color: var(--ink-soft);
  text-align: center;
  white-space: pre-wrap;
  font-size: 9pt;
}

/*
 * Auch die Fußlinie bleibt zurückhaltend — sie ist hier abschaltbar wie
 * überall, aber selbst eingeschaltet kaum mehr als ein Schatten.
 */
.doc-footer--ruled {
  border-top: 1px solid #e5e7eb;
}
`;
