/**
 * Das Dokument, wie es wirklich gedruckt wird.
 *
 * Der einzige Test, der ein PDF durch ein echtes Chromium schickt und
 * misst, was dabei herauskommt: Seitenzahl, Seitenmaß, Inhaltsflächen,
 * eingebettete Schrift. Alles andere rund um PDFs prüft den Weg dorthin
 * und kommt mit dem Stub aus `stub-renderer.ts` aus.
 *
 * Die Referenz, gegen die verglichen wird, entstand mit dem
 * Puppeteer-Weg — der Beleg dafür, dass die Umstellung auf Electron das
 * Dokument nicht verändert hat.
 *
 * Electron braucht ein BrowserWindow und damit seinen eigenen
 * Hauptprozess; Vitest kann den nicht hosten. Deshalb der Umweg über einen
 * Kindprozess: `apps/desktop/dist/render-harness.js` bekommt die Dokumente
 * als JSON und legt die PDFs in einem Ordner ab.
 *
 * Voraussetzung ist ein gebautes `apps/desktop` und die installierte
 * Electron-Binärdatei. Fehlt eines von beidem, wird übersprungen: Das ist
 * eine Aussage über die Umgebung, nicht über den Code.
 */
import { execFileSync } from 'node:child_process';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { referenceDocuments } from './reference-documents';
import { embedsFont, isPdf, pdfContentAreas, pdfPageCount, pdfPageSizes } from './pdf.helper';

const DESKTOP = path.join(__dirname, '..', '..', 'desktop');
const HARNESS = path.join(DESKTOP, 'dist', 'render-harness.js');
const ELECTRON = path.join(DESKTOP, 'node_modules', 'electron', 'dist', 'electron');
const REFERENCE_FILE = path.join(__dirname, 'fixtures', 'pdf-reference.json');

/**
 * Die Referenz neu aufnehmen — ausdrücklich kein Routinegriff.
 *
 *   UPDATE_PDF_REFERENCE=1 xvfb-run -a npx vitest run \
 *     --project @agentur-tool/api test/pdf-electron.test.ts
 *
 * Wer sie neu aufnimmt, erklärt damit, dass sich das Dokument ändern
 * *durfte*. Die erste Aufnahme entstand mit dem Puppeteer-Weg, den es
 * inzwischen nicht mehr gibt; sie ist damit der eingefrorene Vertrag über
 * das, was einmal gedruckt wurde.
 */
const UPDATE = process.env.UPDATE_PDF_REFERENCE === '1';

/**
 * Unter Linux braucht Electron einen X-Server, auch für ein verstecktes
 * Fenster. In CI stellt ihn `xvfb-run`; ohne DISPLAY wird übersprungen,
 * statt mit einem Fehler abzubrechen, der nichts über den Code aussagt.
 */
const hasDisplay = process.platform !== 'linux' || process.env.DISPLAY !== undefined;
const available = hasDisplay && fs.existsSync(HARNESS) && fs.existsSync(ELECTRON);

interface DocumentGeometry {
  pages: number;
  sizesPt: { widthPt: number; heightPt: number }[];
  contentAreasPt: { leftPt: number; topPt: number; widthPt: number; heightPt: number }[];
  embedsOpenSans: boolean;
}

/**
 * Auf ein Zehntel Punkt gerundet.
 *
 * Chromium rastert Inhaltsflächen in Gerätepixeln; die Umrechnung nach
 * Punkt ergibt lange Nachkommazahlen, deren letzte Stellen zwischen
 * Versionen wandern können, ohne dass sich am Dokument etwas ändert.
 */
function round(value: number): number {
  return Math.round(value * 10) / 10;
}

function measure(bytes: Buffer): DocumentGeometry {
  return {
    pages: pdfPageCount(bytes),
    sizesPt: pdfPageSizes(bytes).map((size) => ({
      widthPt: round(size.widthPt),
      heightPt: round(size.heightPt),
    })),
    contentAreasPt: pdfContentAreas(bytes).map((area) => ({
      leftPt: round(area.leftPt),
      topPt: round(area.topPt),
      widthPt: round(area.widthPt),
      heightPt: round(area.heightPt),
    })),
    embedsOpenSans: embedsFont(bytes, 'OpenSans'),
  };
}

/**
 * Ein Dokument, das nach außen greifen will.
 *
 * Es steht hier und nicht in `reference-documents.ts`, weil es keine
 * Referenz ist, sondern ein Angriff: Ein manipuliertes Logo oder Template
 * darf keine Rechnungsdaten abfließen lassen. Die abgeschottete Session
 * des Renderers muss das verhindern.
 */
const PHONING_HOME = {
  name: 'greift-nach-aussen',
  html: [
    '<!doctype html><html><head><meta charset="utf-8">',
    '<style>@page { size: A4; margin: 12mm }</style>',
    '</head><body>',
    '<img src="http://example.invalid/logo.png" alt="">',
    '<p>Text, damit die Seite Inhalt hat.</p>',
    '</body></html>',
  ].join(''),
  footerTemplate: '<div></div>',
};

let workDir: string;
let harnessOutput: string;

beforeAll(() => {
  if (!available) return;

  workDir = fs.mkdtempSync(path.join(os.tmpdir(), 'agentur-tool-electron-'));
  const input = path.join(workDir, 'documents.json');
  const output = path.join(workDir, 'pdf');
  fs.writeFileSync(input, JSON.stringify([...referenceDocuments(), PHONING_HOME]), 'utf8');

  // Läuft der Prozess als root — in einem Container —, verweigert Chromium
  // seine eigene Sandbox. Als echtes Argument und nicht über die Umgebung,
  // weil Electron die Sandbox prüft, bevor Anwendungscode läuft.
  const switches = process.env.ELECTRON_NO_SANDBOX === 'true' ? ['--no-sandbox'] : [];

  // Alle Dokumente in einem Lauf: Electron zu starten kostet Sekunden, das
  // Rendern danach Millisekunden.
  harnessOutput = execFileSync(ELECTRON, [...switches, HARNESS, input, output], {
    stdio: 'pipe',
    timeout: 180_000,
    encoding: 'utf8',
  });
}, 200_000);

afterAll(() => {
  if (workDir !== undefined) {
    fs.rmSync(workDir, { recursive: true, force: true });
  }
});

describe.skipIf(!available)('PDF über Electron', () => {
  const documents = referenceDocuments();

  function reference(): Record<string, DocumentGeometry> {
    if (!fs.existsSync(REFERENCE_FILE)) {
      throw new Error(
        `Keine Referenz unter ${REFERENCE_FILE}. Einmalig aufnehmen mit UPDATE_PDF_REFERENCE=1.`,
      );
    }
    return JSON.parse(fs.readFileSync(REFERENCE_FILE, 'utf8')) as Record<string, DocumentGeometry>;
  }

  if (UPDATE) {
    it('nimmt die Referenz neu auf', () => {
      const recorded: Record<string, DocumentGeometry> = {};
      for (const doc of documents) {
        recorded[doc.name] = measure(fs.readFileSync(path.join(workDir, 'pdf', `${doc.name}.pdf`)));
      }

      fs.mkdirSync(path.dirname(REFERENCE_FILE), { recursive: true });
      fs.writeFileSync(REFERENCE_FILE, `${JSON.stringify(recorded, null, 2)}\n`, 'utf8');
      expect(Object.keys(recorded)).toHaveLength(documents.length);
    });
    return;
  }

  it.each(documents.map((doc) => doc.name))(
    'erzeugt „%s" wie festgehalten',
    (name) => {
      const bytes = fs.readFileSync(path.join(workDir, 'pdf', `${name}.pdf`));

      expect(isPdf(bytes)).toBe(true);
      expect(measure(bytes)).toEqual(reference()[name]);
    },
    60_000,
  );

  it('deckt jedes aufgenommene Dokument ab', () => {
    // Ein Dokument aus der Referenz zu entfernen, ohne es hier zu merken,
    // hieße, eine Prüfung stillschweigend zu verlieren.
    expect(documents.map((doc) => doc.name).sort()).toEqual(Object.keys(reference()).sort());
  });

  it('weist den Griff nach außen ab', () => {
    expect(harnessOutput).toContain('BLOCKED http://example.invalid/logo.png');
  });

  it('erzeugt trotz abgewiesener Anfrage ein Dokument', () => {
    // Die Sperre darf den Lauf nicht aufhalten: Ein fehlendes Logo ergibt
    // eine Rechnung ohne Logo, keinen Ausfall — dieselbe Abwägung wie in
    // `InvoicePdfService.logoDataUri()`.
    const bytes = fs.readFileSync(path.join(workDir, 'pdf', `${PHONING_HOME.name}.pdf`));

    expect(isPdf(bytes)).toBe(true);
    expect(pdfPageCount(bytes)).toBe(1);
  });

  it('lässt die eingebetteten Data-URIs durch', () => {
    // Gegenprobe: Wäre die Sperre zu grob, käme das Logo aus „mit-logo"
    // nicht mehr an — und der Test oben wäre wertlos.
    expect(harnessOutput).not.toContain('BLOCKED data:');
    expect(harnessOutput).toContain('RENDERED mit-logo');
  });
});
