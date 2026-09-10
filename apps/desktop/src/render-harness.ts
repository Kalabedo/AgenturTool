/**
 * Prüfstand für den Electron-Renderer.
 *
 * Kein Teil der Anwendung, sondern das Werkzeug, mit dem sich prüfen
 * lässt, was der Renderer tatsächlich druckt — außerhalb der laufenden
 * Anwendung und ohne Datenbank.
 *
 * Aufruf:
 *
 *   electron dist/render-harness.js <eingabe.json> <zielordner>
 *
 * Die Eingabe ist ein Array aus { name, html, footerTemplate } — dieselben
 * Dokumente, die `apps/api/test/reference-documents.ts` beschreibt. Für
 * jedes entsteht `<zielordner>/<name>.pdf`.
 *
 * Ein eigener Prozess, weil `printToPDF` ein BrowserWindow braucht und das
 * nur im Hauptprozess von Electron existiert — Vitest kann das nicht
 * hosten, wohl aber einen Kindprozess starten.
 */
import fs from 'node:fs';
import path from 'node:path';
import { app } from 'electron';
import { pdfTimeoutMs } from './config';
import { ElectronPdfRenderer } from './pdf-renderer';

interface HarnessDocument {
  name: string;
  html: string;
  footerTemplate: string;
}

// Ohne GPU startet Electron auf einem Rechner ohne Grafik zuverlässiger,
// und für den Druckweg ist sie ohnehin ohne Belang.
app.disableHardwareAcceleration();

// Ohne diesen Griff beendet sich Electron, sobald das letzte Fenster zu
// ist — und der Renderer zerstört sein Fenster nach jedem Dokument. Das
// erste PDF entstünde, das zweite nicht mehr.
app.on('window-all-closed', () => {
  // Absichtlich leer: Wann Schluss ist, entscheidet `main()`.
});

async function main(): Promise<void> {
  // Die letzten beiden Argumente, die keine Schalter sind.
  //
  // Nicht `slice(2)`: Ein `--no-sandbox` muss ein echtes Argument sein
  // (Electron prüft die Sandbox, bevor Anwendungscode läuft), bleibt aber
  // in argv stehen und verschiebt damit jede feste Position. Von hinten zu
  // zählen ist gegen beides unempfindlich.
  const positional = process.argv.filter((arg) => !arg.startsWith('--'));
  const [inputFile, outDir] = positional.slice(-2);
  if (inputFile === undefined || outDir === undefined || !inputFile.endsWith('.json')) {
    throw new Error('Aufruf: electron render-harness.js <eingabe.json> <zielordner>');
  }

  const documents = JSON.parse(fs.readFileSync(inputFile, 'utf8')) as HarnessDocument[];
  fs.mkdirSync(outDir, { recursive: true });

  // Abgewiesene Anfragen landen als Zeile auf stdout, damit der Test die
  // Netzsperre nicht nur voraussetzen, sondern belegen kann.
  const renderer = new ElectronPdfRenderer(pdfTimeoutMs(), (url) => {
    process.stdout.write(`BLOCKED ${url}\n`);
  });

  for (const document of documents) {
    const bytes = await renderer.render(document.html, {
      footerTemplate: document.footerTemplate,
    });
    fs.writeFileSync(path.join(outDir, `${document.name}.pdf`), bytes);
    process.stdout.write(`RENDERED ${document.name} ${String(bytes.length)}\n`);
  }
}

void app.whenReady().then(async () => {
  try {
    await main();
    app.exit(0);
  } catch (error) {
    process.stderr.write(`${error instanceof Error ? error.stack : String(error)}\n`);
    app.exit(1);
  }
});
