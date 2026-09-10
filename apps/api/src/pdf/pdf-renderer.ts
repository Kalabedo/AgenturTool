/**
 * Der letzte Meter der PDF-Erzeugung: HTML rein, PDF raus.
 *
 * Die Schnittstelle ist absichtlich so schmal wie das, was das Dokument
 * wirklich braucht. Alles, was eine Rechnung ausmacht — Snapshots, Modell,
 * Template, Fußzeile —, ist zu diesem Zeitpunkt schon zu einem
 * eigenständigen HTML-Dokument geworden (D29: Schrift und Logo stecken als
 * Data-URI darin, es gibt nichts nachzuladen).
 *
 * Dass sie schmal ist, war der Grund, warum sich der Renderer austauschen
 * ließ: Gezeichnet wird von Electrons eigenem Chromium über `printToPDF`,
 * ohne dass ein zweiter Browser auf dem Rechner installiert sein muss.
 */

/** Was ein Renderlauf über die Seite hinaus braucht. */
export interface PdfRenderOptions {
  /** HTML für die Fußzeile jeder Seite; kommt aus dem Template. */
  footerTemplate: string;
}

/**
 * Erzeugt PDFs aus fertigem HTML.
 *
 * Jede Umsetzung schuldet drei Eigenschaften, sonst ist sie kein Ersatz:
 *
 * 1. **Seitenmaß und Ränder kommen aus dem Stylesheet.** Das Dokument
 *    bringt `@page { size: A4; margin: … }` mit; der Renderer darf kein
 *    eigenes Format und keine eigenen Ränder setzen (D31).
 * 2. **Ein Lauf nach dem anderen.** Zwei gleichzeitige Renderläufe sind bei
 *    einem Einzelplatzwerkzeug kein Gewinn, aber ein spürbarer
 *    Speicherausschlag.
 * 3. **Kein Netzwerkzugriff.** Das Dokument ist autark. Ein Renderer, der
 *    doch nach außen greifen könnte, wäre ein Weg, über ein manipuliertes
 *    Logo oder Template Daten abfließen zu lassen.
 */
export interface PdfRenderer {
  render(html: string, options: PdfRenderOptions): Promise<Buffer>;
}

/**
 * Das Token, unter dem der Renderer eingehängt wird.
 *
 * Ein Token und keine Klasse, weil die Umsetzung nicht immer im selben
 * Paket liegt: Die Electron-Variante gehört zu `apps/desktop` und wird beim
 * Start hineingereicht — `apps/api` soll deswegen nicht gegen Electron
 * gebaut werden müssen.
 */
export const PDF_RENDERER = Symbol('PDF_RENDERER');

/**
 * Der Renderer, den der Gastgeber der Anwendung mitbringt — oder `null`.
 *
 * Getrennt von `PDF_RENDERER`, weil es zwei verschiedene Fragen sind: Was
 * benutzt wird (`PDF_RENDERER`) und was von außen angeboten wurde. Die
 * Desktop-Anwendung reicht hier ihren Electron-Renderer herein; auf der
 * Kommandozeile bleibt es `null`.
 */
export const PDF_RENDERER_HOST = Symbol('PDF_RENDERER_HOST');
