import { Injectable, Logger, type OnModuleDestroy } from '@nestjs/common';
import puppeteer, { type Browser } from 'puppeteer-core';
import { ApiError } from '../common/api-error';
import { ChromiumConfig, findChromiumExecutable } from './chromium';

/** Was ein Renderlauf über die Seite hinaus braucht. */
export interface PdfRenderOptions {
  /** HTML für die Fußzeile jeder Seite; kommt aus dem Template. */
  footerTemplate: string;
}

/**
 * Erzeugt PDFs aus fertigem HTML.
 *
 * Diese Klasse weiß nichts über Rechnungen — sie kennt nur Chromium. Die
 * Trennung ist der Grund, warum sich das Zusammenbauen des Dokuments ohne
 * laufenden Browser testen lässt.
 *
 * Drei Entscheidungen prägen sie:
 *
 * 1. **Ein Browser für die ganze Laufzeit.** Ein Start kostet je nach
 *    Maschine 200 bis 600 ms; bei einem Werkzeug, in dem man beim Schreiben
 *    einer Rechnung mehrfach das PDF ansieht, ist das der Unterschied
 *    zwischen „sofort" und „hakt". Gestartet wird trotzdem erst beim ersten
 *    PDF: Wer die Anwendung nur für Stammdaten öffnet, soll kein Chromium
 *    im Speicher haben.
 * 2. **Ein Renderlauf nach dem anderen.** Für ein Einzelplatzwerkzeug ist
 *    Parallelität kein Gewinn, aber zwei gleichzeitige Chromium-Tabs sind
 *    ein spürbarer Speicherausschlag. Die Warteschlange ist eine Zeile und
 *    macht das Verhalten vorhersagbar.
 * 3. **Kein Netzwerkzugriff.** Das Dokument kommt über `setContent` und
 *    trägt Schrift und Logo als Data-URI in sich (D29). Deshalb genügt
 *    `waitUntil: 'load'`, und deshalb kann kein Timeout ein Dokument ohne
 *    Logo erzeugen.
 */
@Injectable()
export class PdfService implements OnModuleDestroy {
  private readonly logger = new Logger(PdfService.name);
  private browser: Browser | null = null;
  private launching: Promise<Browser> | null = null;
  private queue: Promise<unknown> = Promise.resolve();

  constructor(private readonly config: ChromiumConfig) {}

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
    const browser = await this.ensureBrowser();
    const page = await browser.newPage();

    try {
      await page.setContent(html, { waitUntil: 'load', timeout: this.config.timeoutMs });

      // Die Schriften stecken als Data-URI im CSS, sind also nicht von einem
      // Netzwerkzugriff abhängig — dekodiert sind sie trotzdem erst nach
      // einem Moment. Ohne dieses Warten druckt Chromium gelegentlich die
      // Ersatzschrift, und das PDF bricht Zeilen anders um als die Vorschau.
      await page.evaluateHandle('document.fonts.ready');

      const pdf = await page.pdf({
        // Seitengröße und Ränder kommen aus @page im Template (D31). Eine
        // eigene `margin`-Angabe stünde genau dagegen und gehört deshalb
        // nicht hierher.
        preferCSSPageSize: true,
        printBackground: true,
        displayHeaderFooter: true,
        // Chromium setzt sonst seine eigene Kopfzeile mit Datum und Titel
        // ein; ein leeres Fragment schaltet sie ab.
        headerTemplate: '<div></div>',
        footerTemplate: options.footerTemplate,
        timeout: this.config.timeoutMs,
      });

      return Buffer.from(pdf);
    } finally {
      // Auch im Fehlerfall: Eine offene Seite bliebe als Chromium-Tab und
      // damit als Speicher zurück.
      await page.close().catch(() => undefined);
    }
  }

  /**
   * Liefert den laufenden Browser und startet ihn beim ersten Aufruf.
   *
   * Der Zwischenspeicher `launching` verhindert, dass zwei gleichzeitige
   * erste Anfragen zwei Browser starten — der zweite wäre danach nicht mehr
   * erreichbar und liefe als verwaister Prozess weiter.
   */
  private async ensureBrowser(): Promise<Browser> {
    if (this.browser !== null && this.browser.connected) return this.browser;
    if (this.launching !== null) return this.launching;

    this.launching = this.launch();
    try {
      this.browser = await this.launching;
      return this.browser;
    } finally {
      this.launching = null;
    }
  }

  private async launch(): Promise<Browser> {
    const executablePath = findChromiumExecutable(this.config.configuredPath);
    if (executablePath === null) {
      throw ApiError.pdfRenderFailed(
        'Es wurde kein Chromium gefunden. Bitte Chromium installieren oder ' +
          'PUPPETEER_EXECUTABLE_PATH auf die ausführbare Datei setzen.',
      );
    }

    this.logger.log(`Chromium für die PDF-Erzeugung: ${executablePath}`);

    const browser = await puppeteer.launch({
      executablePath,
      headless: true,
      args: [
        // /dev/shm ist im Container klein; ohne das stürzt Chromium beim
        // Rendern größerer Dokumente ab.
        '--disable-dev-shm-usage',
        '--disable-gpu',
        // Ohne Hinting fällt der Textsatz auf jeder Maschine gleich aus.
        // Das PDF soll unabhängig davon sein, wo es erzeugt wurde.
        '--font-render-hinting=none',
        // Chromium fragt beim Start von sich aus im Netz nach (Komponenten,
        // Verfügbarkeitsprüfung). Das Dokument braucht davon nichts — es
        // trägt Schrift und Logo in sich —, und in einem Werkzeug mit
        // Kundendaten ist jede Verbindung nach draußen eine, die man
        // erklären können muss.
        '--disable-background-networking',
        '--disable-component-update',
        '--no-first-run',
        '--no-default-browser-check',
        ...(this.config.disableSandbox ? ['--no-sandbox', '--disable-setuid-sandbox'] : []),
      ],
    });

    // Stirbt Chromium (OOM-Killer, Absturz), darf die Referenz nicht stehen
    // bleiben: Der nächste Aufruf soll einen neuen Browser starten statt in
    // einen toten Socket zu schreiben.
    browser.once('disconnected', () => {
      if (this.browser === browser) this.browser = null;
    });

    return browser;
  }

  async onModuleDestroy(): Promise<void> {
    const browser = this.browser;
    this.browser = null;
    await browser?.close().catch(() => undefined);
  }
}
