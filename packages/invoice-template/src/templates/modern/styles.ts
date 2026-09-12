import { pageCss, type PageGeometry } from '../../design/page.js';
import { RESET_CSS } from '../../design/reset.js';

/**
 * Das Stylesheet des Designs „modern".
 *
 * Der Unterschied zu „classic" ist das Farbband im Kopf, das bis an den
 * Blattrand läuft. Deshalb steht der obere Seitenrand auf 0 — den Abstand
 * zum Text bringt das Band selbst mit. Auf Folgeseiten erscheint es nicht:
 * Der Kopf steht einmal im Fluss und wiederholt sich nicht, anders als der
 * Tabellenkopf.
 */

export const MODERN_PAGE: PageGeometry = {
  widthMm: 210,
  heightMm: 297,
  /*
   * Null, weil das Band randlos sitzt. Alle anderen Blöcke holen sich den
   * Abstand über `.page__body` zurück — sonst klebte auf Seite zwei die
   * Tabelle am oberen Blattrand.
   */
  marginTopMm: 0,
  marginSideMm: 14,
  footerMm: 16,
  edgeGapMm: 0.75,
};

export const MODERN_CSS = `${pageCss(MODERN_PAGE)}
:root {
  --accent: #1d4ed8;
  --ink: #111827;
  --ink-soft: #6b7280;
  --rule: #e5e7eb;
  --band: #eff6ff;
  --logo-width: 40mm;
  --font-family: 'Open Sans';
  --density: 1;
}
${RESET_CSS}
.invoice-root {
  font-size: 9.75pt;
}

/*
 * Der Inhalt unterhalb des Bandes bekommt seitlich nichts zusätzlich — das
 * erledigt .page —, wohl aber oben Luft. Auf Folgeseiten sorgt @page für
 * denselben Abstand.
 */
.page__body {
  padding-top: calc(9mm * var(--density));
}

/* ---------- Kopf mit Farbband ---------- */

/*
 * Das Band zieht sich über die volle Blattbreite. Die negativen Ränder
 * heben die seitlichen Ränder der Seite auf; im Druck greift dafür die
 * Regel weiter unten, weil dort die Ränder von @page kommen und nicht vom
 * Padding.
 */
.header {
  display: flex;
  align-items: flex-start;
  justify-content: space-between;
  gap: 8mm;
  margin: 0 -${MODERN_PAGE.marginSideMm + MODERN_PAGE.edgeGapMm}mm 0 -${MODERN_PAGE.marginSideMm}mm;
  padding: 12mm ${MODERN_PAGE.marginSideMm + MODERN_PAGE.edgeGapMm}mm 10mm ${MODERN_PAGE.marginSideMm}mm;
  background: var(--accent);
  color: #ffffff;
}

@media print {
  .header {
    margin: 0 -${MODERN_PAGE.marginSideMm + MODERN_PAGE.edgeGapMm}mm 0 -${MODERN_PAGE.marginSideMm}mm;
  }
}

.header__name {
  margin: 0 0 1.5mm;
  font-size: 16pt;
  font-weight: 700;
  line-height: 1.2;
  /* Auf dem Band steht die Schrift weiß, nicht in der Akzentfarbe. */
  color: inherit;
}

.header__lines,
.payment__lines {
  margin: 0;
  padding: 0;
  list-style: none;
}

.header__identity {
  flex: 1 1 auto;
  min-width: 0;
}

/* Das Logo steht rechts — der auffälligste Unterschied zu „classic". */
.header__logo {
  order: 2;
  width: var(--logo-width);
  max-height: 30mm;
  object-fit: contain;
  flex: 0 0 auto;
  /*
   * Logos sind meist dunkle Tinte. Auf dem farbigen Band wären sie kaum zu
   * sehen, deshalb sitzen sie auf einem weißen Feld — wie ein aufgeklebtes
   * Etikett.
   */
  background: #ffffff;
  border-radius: 1.5mm;
  padding: 2mm;
}

.header__lines li {
  overflow-wrap: anywhere;
  opacity: 0.88;
}

/* ---------- Zahlungsdetails ---------- */

/*
 * Nicht im Kopf wie bei „classic", sondern als eigener Streifen darunter:
 * Auf dem Band stünden IBAN und BIC in weißer Schrift und wären beim
 * Abtippen schwer zu lesen.
 */
.header__payment {
  margin-top: calc(7mm * var(--density));
  padding: 3.5mm 4mm;
  background: var(--band);
  border-radius: 1.5mm;
  display: flex;
  flex-wrap: wrap;
  gap: 1mm 6mm;
}

.payment__title {
  margin: 0;
  font-weight: 700;
}

.payment__lines {
  display: flex;
  flex-wrap: wrap;
  gap: 1mm 6mm;
}

.header__rule {
  display: none;
}

/* ---------- Empfänger und Eckdaten ---------- */

.parties {
  display: flex;
  gap: 10mm;
  margin-top: calc(8mm * var(--density));
}

.parties__recipient {
  flex: 1 1 auto;
  min-width: 0;
}

.parties__label {
  margin: 0 0 1mm;
  font-weight: 700;
  color: var(--accent);
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
.payment__lines li {
  overflow-wrap: anywhere;
}

.parties__meta {
  flex: 0 0 auto;
  width: 74mm;
}

.meta__row {
  display: flex;
  justify-content: space-between;
  gap: 4mm;
  padding: 0.6mm 0;
}

.meta__value {
  text-align: right;
  white-space: nowrap;
  font-weight: 700;
}

/* Aufrecht, nicht kursiv — siehe die Begründung in classic/styles.ts. */
.meta__value--placeholder {
  color: var(--ink-soft);
  font-weight: 400;
}

/* ---------- Titel ---------- */

.doc-title {
  margin: calc(10mm * var(--density)) 0 4mm;
  font-size: 20pt;
  font-weight: 700;
  line-height: 1.15;
  letter-spacing: -0.01em;
  color: var(--accent);
}

/* ---------- Positionen ---------- */

.items {
  width: 100%;
  border-collapse: collapse;
}

/*
 * Kein Flächenton hinter dem Kopf, sondern eine kräftige Linie darunter.
 * Das ist der zweite prägende Unterschied zu „classic".
 */
.items th {
  padding: calc(2.4mm * var(--density)) 2mm;
  border-bottom: 0.6mm solid var(--accent);
  font-weight: 700;
  text-align: right;
  white-space: nowrap;
  color: var(--accent);
}

.items td {
  padding: calc(3mm * var(--density)) 2mm;
  border-bottom: 1px solid var(--rule);
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
  margin-top: calc(6mm * var(--density));
}

.totals__table {
  width: 82mm;
  border-collapse: collapse;
}

.totals__table td {
  padding: calc(2mm * var(--density)) 2mm;
}

.totals__table td:last-child {
  text-align: right;
  white-space: nowrap;
}

.totals__row--grand td {
  background: var(--accent);
  color: #ffffff;
  font-weight: 700;
}

.totals__row--discount td {
  color: var(--ink-soft);
}

/* ---------- Hinweise ---------- */

.notes {
  margin-top: calc(12mm * var(--density));
}

.notes__block + .notes__block {
  margin-top: 5mm;
}

.notes__title {
  margin: 0 0 1.5mm;
  font-weight: 700;
  color: var(--accent);
}

.notes__text {
  margin: 0;
  white-space: pre-wrap;
  overflow-wrap: anywhere;
}

/* ---------- Fuß ---------- */

.doc-footer {
  margin-top: calc(12mm * var(--density));
  padding-top: 4mm;
  color: var(--ink-soft);
  text-align: center;
  white-space: pre-wrap;
}

.doc-footer--ruled {
  border-top: 1px solid var(--rule);
}
`;
