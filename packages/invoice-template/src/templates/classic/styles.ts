import { EMBEDDED_FONT_CSS } from '../../fonts.generated.js';

/**
 * Das Stylesheet des Templates „classic".
 *
 * Bewusst ein String und keine .css-Datei: Dieses CSS muss an zwei sehr
 * verschiedenen Orten landen — in einem <style> im iframe der Live-Vorschau
 * und im HTML-Dokument, das gedruckt wird. Ein Bundler-Import wäre in
 * beiden Fällen im Weg, im Backend gäbe es ihn gar nicht.
 *
 * Maßangaben durchgehend in Millimetern und Punkten, nicht in Pixeln: Das
 * Ziel ist ein Blatt Papier, kein Bildschirm.
 */

/** Seitenmaße an einer Stelle, damit sie nicht auseinanderlaufen. */
export const PAGE = {
  widthMm: 210,
  heightMm: 297,
  marginMm: 12,
  /** Platz am Fuß für die Seitenzahl, die Chromium beisteuert. */
  footerMm: 16,
  /**
   * Der Streifen am rechten Rand, den der Inhalt frei lässt.
   *
   * Chromium beschneidet die gedruckte Seite auf einen Kasten, der eine
   * Winzigkeit schmaler ist als der, an dem es vorher ausrichtet — gemessen
   * 0,7 pt. Buchstaben, die bündig am rechten Rand stehen, verlieren dadurch
   * eine Scheibe: Die „6" der Datumsangaben und die „4" der IBAN standen im
   * PDF mit senkrecht abgeschnittener Rundung.
   *
   * 0,75 mm sind rund das Dreifache des gemessenen Fehlers — genug Luft
   * dafür, dass eine andere Chromium-Fassung anders rundet, und zu wenig,
   * als dass der Unterschied zum linken Rand auffiele.
   *
   * Der Abstand gehört zur Seitengeometrie und nicht etwa nur zum Druck:
   * Bildschirm und Druck müssen denselben Textbereich haben, sonst bricht
   * die Vorschau anders um als das PDF.
   */
  edgeGapMm: 0.75,
} as const;

export const CLASSIC_CSS = `${EMBEDDED_FONT_CSS}

/*
 * Die Seitenränder kommen im Druck von @page, nicht vom Padding der Seite.
 * Ein Padding wirkt nur auf der ersten Seite — auf Folgeseiten klebte die
 * Tabelle sonst am oberen Blattrand. Der Renderer muss dafür mit
 * "preferCSSPageSize: true" und ohne eigene margin-Angabe aufgerufen werden,
 * sonst überschreibt es diese Werte (Schritt 8).
 */
@page {
  size: A4;
  margin: ${PAGE.marginMm}mm ${PAGE.marginMm}mm ${PAGE.footerMm}mm;
}

:root {
  --accent: #1e293b;
  --ink: #1f2328;
  --ink-soft: #4b5563;
  --rule: #e3e6ea;
  --band: #f4f5f7;
  --logo-width: 40mm;
}

.invoice-root *,
.invoice-root *::before,
.invoice-root *::after {
  box-sizing: border-box;
}

.invoice-root {
  margin: 0;
  padding: 0;
  color: var(--ink);
  font-family: var(--font-family), 'Open Sans', 'Helvetica Neue', Arial, sans-serif;
  font-size: 9.75pt;
  line-height: 1.55;
  -webkit-font-smoothing: antialiased;
  text-rendering: geometricPrecision;
}

/*
 * Am Bildschirm ist die Seite ein sichtbares Blatt mit eigenen Rändern.
 * Bewusst kein Flex-Container: Ein Flex-Layout, das über mehrere Druckseiten
 * läuft, bricht in Chromium unzuverlässig um.
 */
.page {
  width: ${PAGE.widthMm}mm;
  min-height: ${PAGE.heightMm}mm;
  padding: ${PAGE.marginMm}mm ${PAGE.marginMm + PAGE.edgeGapMm}mm ${PAGE.footerMm}mm
    ${PAGE.marginMm}mm;
  background: #ffffff;
}

/*
 * Im Druck kommen die Ränder von @page — bis auf den rechten Spielraum
 * (PAGE.edgeGapMm), der hier stehen bleibt: Er gehört in den Textbereich und
 * nicht in den Seitenrand, sonst wanderte der rechtsbündige Text einfach mit
 * dem Rand nach links und stünde wieder bündig am Beschnitt.
 */
@media print {
  .page {
    width: auto;
    min-height: 0;
    padding: 0 ${PAGE.edgeGapMm}mm 0 0;
  }
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
  max-height: 34mm;
  object-fit: contain;
  flex: 0 0 auto;
}

.header__name {
  margin: 0 0 1mm;
  font-size: 14pt;
  font-weight: 700;
  line-height: 1.25;
  color: var(--accent);
}

.header__lines,
.payment__lines {
  margin: 0;
  padding: 0;
  list-style: none;
}

.header__payment {
  flex: 0 0 auto;
  max-width: 62mm;
  text-align: right;
}

.payment__title {
  margin: 0;
  font-weight: 400;
}

.header__rule {
  border: 0;
  border-top: 1px solid var(--rule);
  margin: 7mm 0 0;
}

/* ---------- Empfänger und Eckdaten ---------- */

.parties {
  display: flex;
  gap: 10mm;
  margin-top: 7mm;
}

.parties__recipient {
  flex: 1 1 auto;
  min-width: 0;
}

.parties__label {
  margin: 0 0 1mm;
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

/*
 * Firmennamen und Straßen können lang sein und enthalten keine
 * Trennmöglichkeit. Ohne dieses Umbrechen schöbe eine einzige lange Zeile
 * die Eckdaten rechts aus dem Blatt.
 */
.recipient__lines li,
.header__lines li,
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
}

.meta__value {
  text-align: right;
  white-space: nowrap;
}

/*
 * „Entwurf" statt einer Nummer — als einziger Platzhalter des Dokuments
 * aufrecht und nicht kursiv.
 *
 * Eingebettet sind nur Regular und Bold (D29). Ein font-style: italic
 * bekommt deshalb keine echte Kursive, sondern eine von Chromium schräg
 * gestellte Regular — und deren Tinte steht bis zu 2 pt über die Laufweite
 * des Buchstabens hinaus. Am rechten Rand fiel damit das halbe „f" dem
 * Beschnitt zum Opfer. Die graue Farbe kennzeichnet den Platzhalter
 * genauso, ohne dass ein Buchstabe aus seinem Kasten tritt; die kursiven
 * Platzhalter im Fließtext bleiben, sie stehen linksbündig.
 */
.meta__value--placeholder {
  color: var(--ink-soft);
}

/* ---------- Titel ---------- */

.doc-title {
  margin: 10mm 0 4mm;
  font-size: 19pt;
  font-weight: 700;
  line-height: 1.2;
  color: var(--accent);
}

/* ---------- Positionen ---------- */

.items {
  width: 100%;
  border-collapse: collapse;
}

.items thead {
  /* Auf Folgeseiten den Kopf wiederholen, sonst steht dort eine Zahlenwüste. */
  display: table-header-group;
}

.items tr {
  break-inside: avoid;
  page-break-inside: avoid;
}

.items th {
  padding: 2.4mm 2mm;
  background: var(--band);
  font-weight: 700;
  text-align: right;
  white-space: nowrap;
}

.items td {
  padding: 3mm 2mm;
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
  /* Nimmt den Rest der Breite; die Zahlenspalten bestimmt ihr Inhalt. */
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
  /*
   * Mehrzeilige Leistungsbeschreibungen behalten ihre Zeilenumbrüche.
   * Wer im Editor eine Aufzählung eintippt, will sie auf dem Papier
   * wiederfinden.
   */
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
  margin-top: 6mm;
  break-inside: avoid;
  page-break-inside: avoid;
}

.totals__table {
  width: 82mm;
  border-collapse: collapse;
}

.totals__table td {
  padding: 2mm 2mm;
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
  margin-top: 12mm;
  break-inside: avoid;
  page-break-inside: avoid;
}

.notes__block + .notes__block {
  margin-top: 5mm;
}

.notes__title {
  margin: 0 0 1.5mm;
  font-weight: 700;
}

.notes__text {
  margin: 0;
  white-space: pre-wrap;
  overflow-wrap: anywhere;
}

/* ---------- Fuß ---------- */

/*
 * Der Fußtext steht einmal am Dokumentende, nicht auf jeder Seite. Die
 * Seitenzahl steuert Chromium über die footerTemplate bei (Schritt 8) —
 * sie ist Sache des Druckrahmens, nicht des Dokuments.
 */
.doc-footer {
  margin-top: 12mm;
  padding-top: 4mm;
  border-top: 1px solid var(--rule);
  color: var(--ink-soft);
  text-align: center;
  white-space: pre-wrap;
  break-inside: avoid;
  page-break-inside: avoid;
}
`;
