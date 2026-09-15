/**
 * Die PDF-Erzeugung der Desktop-Anwendung.
 *
 * Electron bringt sein eigenes Chromium mit — dasselbe, das auch das Fenster
 * zeichnet. Damit fällt die Voraussetzung weg, die den bisherigen Weg
 * getragen hat: ein auf dem Rechner installierter Browser, den Puppeteer
 * findet und fernsteuert. `webContents.printToPDF` bedient dasselbe
 * DevTools-Protokoll wie `page.pdf`, weshalb die Optionen dieselben Namen
 * tragen und dasselbe bedeuten.
 *
 * Drei Eigenschaften des alten Wegs sind hier nachgebaut, weil ohne sie das
 * Dokument oder seine Sicherheit anders wäre:
 *
 * 1. **Ein Lauf nach dem anderen** — dieselbe Ein-Zeilen-Warteschlange wie
 *    in `PdfService`.
 * 2. **Kein Netzwerkzugriff** — Puppeteer bekam
 *    `--host-resolver-rules=MAP * ~NOTFOUND` auf die Kommandozeile. Hier
 *    übernimmt das eine eigene Session, die jede Anfrage außer `file:` und
 *    `data:` abweist. Das ist keine Feinheit: Ohne sie wäre ein
 *    manipuliertes Logo oder Template ein Weg, Rechnungsdaten abfließen zu
 *    lassen.
 * 3. **Zeitlimit** — `PDF_TIMEOUT_MS`, angewandt auf das Laden wie auf das
 *    Drucken.
 *
 * Anders als früher bleibt kein Browser offen: Ein Fenster wird je Lauf
 * angelegt und danach zerstört. Der Start eines Chromium-Prozesses entfiel
 * mit Electron ohnehin — er läuft schon.
 */
import { randomUUID } from 'node:crypto';
import fs from 'node:fs/promises';
import path from 'node:path';
import { BrowserWindow, app, session, type Session } from 'electron';

/** Spiegelt `PdfRenderOptions` aus `apps/api/src/pdf/pdf-renderer.ts`. */
export interface PdfRenderOptions {
  footerTemplate: string;
}

/** Die Kennung der abgeschotteten Session; eine je Prozess genügt. */
const PARTITION = 'privatura-pdf';

export class ElectronPdfRenderer {
  private queue: Promise<unknown> = Promise.resolve();
  private renderSession: Session | null = null;

  /**
   * @param timeoutMs Zeitlimit je Renderlauf.
   * @param onBlocked Wird für jede abgewiesene Anfrage gerufen. Das ist
   *   nicht bloß Diagnose: Ein Dokument, das nach außen greifen will,
   *   sollte auffallen — im Betrieb steht das im Protokoll, im Test ist es
   *   der Beleg, dass die Sperre wirkt.
   */
  constructor(
    private readonly timeoutMs: number,
    private readonly onBlocked?: (url: string) => void,
  ) {}

  async render(html: string, options: PdfRenderOptions): Promise<Buffer> {
    // Anhängen statt gleichzeitig starten. Der `catch` hält die Kette am
    // Leben: Ohne ihn würde ein fehlgeschlagener Lauf alle folgenden
    // Anfragen mit seinem eigenen Fehler abweisen.
    const result = this.queue.then(
      () => this.renderNow(html, options),
      () => this.renderNow(html, options),
    );
    this.queue = result.catch(() => undefined);
    return result;
  }

  private async renderNow(html: string, options: PdfRenderOptions): Promise<Buffer> {
    // Über eine Datei und nicht über eine data:-URL: Das Dokument trägt
    // Schrift und Logo als Data-URI in sich und wird schnell einige hundert
    // Kilobyte groß — - als URL wäre das eine Zeile, an der Chromium je nach
    // Version abschneidet.
    const file = path.join(app.getPath('temp'), `privatura-${randomUUID()}.html`);
    await fs.writeFile(file, html, 'utf8');

    const window = new BrowserWindow({
      show: false,
      webPreferences: {
        session: this.isolatedSession(),
        // Das Dokument ist fertiges HTML aus dem eigenen Template; es
        // braucht weder Node noch eine Brücke in den Hauptprozess.
        nodeIntegration: false,
        contextIsolation: true,
        // Offscreen käme mit eigener Rasterung und damit womöglich anderen
        // Maßen. Ein verstecktes Fenster rastert wie ein sichtbares.
        offscreen: false,
      },
    });

    try {
      await this.withTimeout(window.loadFile(file), 'Das Dokument ließ sich nicht laden.');

      // Ohne diesen Schritt druckt Chromium, bevor die eingebettete Schrift
      // steht — der Satz bräche dann anders um als in der Vorschau (D29).
      await this.withTimeout(
        window.webContents.executeJavaScript('document.fonts.ready.then(() => true)', true),
        'Die Schriften wurden nicht rechtzeitig fertig.',
      );

      const pdf = await this.withTimeout(
        window.webContents.printToPDF({
          // Format und Ränder kommen aus @page im Stylesheet, nicht von
          // hier (D31).
          preferCSSPageSize: true,
          printBackground: true,
          displayHeaderFooter: true,
          // Leer, aber gesetzt: Sonst druckt Chromium seine eigene
          // Kopfzeile mit Titel und Datum.
          headerTemplate: '<div></div>',
          footerTemplate: options.footerTemplate,
        }),
        'Das PDF wurde nicht rechtzeitig fertig.',
      );

      return pdf;
    } finally {
      window.destroy();
      await fs.rm(file, { force: true });
    }
  }

  /**
   * Eine Session, die nichts nach außen lässt.
   *
   * Sie wird beim ersten Lauf angelegt und bleibt bestehen — der Filter
   * hängt an der Session, nicht am Fenster.
   */
  private isolatedSession(): Session {
    if (this.renderSession !== null) {
      return this.renderSession;
    }

    const isolated = session.fromPartition(PARTITION);
    isolated.webRequest.onBeforeRequest((details, callback) => {
      const allowed = details.url.startsWith('file://') || details.url.startsWith('data:');
      if (!allowed) {
        this.onBlocked?.(details.url);
      }
      callback({ cancel: !allowed });
    });

    this.renderSession = isolated;
    return isolated;
  }

  private async withTimeout<T>(work: Promise<T>, message: string): Promise<T> {
    let timer: NodeJS.Timeout | undefined;
    const limit = new Promise<never>((_resolve, reject) => {
      timer = setTimeout(() => {
        reject(new Error(`${message} (Zeitlimit ${String(this.timeoutMs)} ms)`));
      }, this.timeoutMs);
    });

    try {
      return await Promise.race([work, limit]);
    } finally {
      clearTimeout(timer);
    }
  }
}
