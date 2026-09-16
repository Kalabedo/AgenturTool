/**
 * Die Seitengeometrie eines Designs.
 *
 * Vier Designs teilen sich dieselbe Mechanik und unterscheiden sich nur in
 * den Zahlen. Sie stehen deshalb als Werte hier und nicht als CSS in jedem
 * Template — sonst müsste jedes neue Design die Chromium-Eigenheiten unten
 * erneut richtig treffen, und eines davon träfe sie irgendwann nicht.
 *
 * Maßangaben durchgehend in Millimetern: Das Ziel ist ein Blatt Papier.
 */

export interface PageGeometry {
  widthMm: number;
  heightMm: number;
  /** Rand oben. Bei „modern" 0, weil das Farbband bis an den Rand läuft. */
  marginTopMm: number;
  /** Rand links und rechts. */
  marginSideMm: number;
  /** Platz am Fuß für die Seitenzahl, die Chromium beisteuert. */
  footerMm: number;
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
  edgeGapMm: number;
}

/**
 * Die gemeinsame Seitengeometrie als CSS: `@page`, `.page`, und die
 * Druckfassung von `.page`.
 *
 * Die drei Regeln hängen so eng zusammen, dass sie nicht getrennt gepflegt
 * werden dürfen — der rechte Spielraum etwa muss in beiden Fassungen von
 * `.page` auftauchen, aber an verschiedenen Stellen.
 */
export function pageCss(page: PageGeometry): string {
  return `
/*
 * Die Seitenränder kommen im Druck von @page, nicht vom Padding der Seite.
 * Ein Padding wirkt nur auf der ersten Seite — auf Folgeseiten klebte die
 * Tabelle sonst am oberen Blattrand. Der Renderer muss dafür mit
 * "preferCSSPageSize: true" und ohne eigene margin-Angabe aufgerufen werden,
 * sonst überschreibt es diese Werte (Schritt 8).
 */
@page {
  size: A4;
  margin: ${page.marginTopMm}mm ${page.marginSideMm}mm ${page.footerMm}mm;
  /* Auch der Druckrand gehört zum Blatt. Nur die .page einzufärben ließe im
     erzeugten PDF einen weißen Rahmen um den eigentlichen Inhalt stehen. */
  background: var(--page-background, #ffffff);
}

/*
 * Am Bildschirm ist die Seite ein sichtbares Blatt mit eigenen Rändern.
 * Bewusst kein Flex-Container: Ein Flex-Layout, das über mehrere Druckseiten
 * läuft, bricht in Chromium unzuverlässig um.
 */
.page {
  width: ${page.widthMm}mm;
  min-height: ${page.heightMm}mm;
  padding: ${page.marginTopMm}mm ${page.marginSideMm + page.edgeGapMm}mm ${page.footerMm}mm
    ${page.marginSideMm}mm;
  background: var(--page-background, #ffffff);
}

/*
 * Im Druck kommen die Ränder von @page — bis auf den rechten Spielraum
 * (edgeGapMm), der hier stehen bleibt: Er gehört in den Textbereich und
 * nicht in den Seitenrand, sonst wanderte der rechtsbündige Text einfach mit
 * dem Rand nach links und stünde wieder bündig am Beschnitt.
 */
@media print {
  .page {
    width: auto;
    min-height: 0;
    padding: 0 ${page.edgeGapMm}mm 0 0;
  }
}
`;
}
