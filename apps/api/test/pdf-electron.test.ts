/**
 * Erzeugt Electron dasselbe Dokument wie Puppeteer?
 *
 * Das ist die eine Frage, an der der Umstieg auf die Desktop-Anwendung
 * hängt. Beantwortet wird sie gegen dieselbe Referenz und mit derselben
 * Messung wie `pdf-reference.test.ts` — nur eben durch den anderen
 * Renderer.
 *
 * Electron braucht ein BrowserWindow und damit seinen eigenen
 * Hauptprozess; Vitest kann den nicht hosten. Deshalb der Umweg über einen
 * Kindprozess: `apps/desktop/dist/render-harness.js` bekommt die Dokumente
 * als JSON und legt die PDFs in einem Ordner ab.
 *
 * Voraussetzung ist ein gebautes `apps/desktop` und die installierte
 * Electron-Binärdatei. Fehlt eines von beidem, wird übersprungen — genau
 * wie die Puppeteer-Tests ohne Chromium: Das ist eine Aussage über die
 * Umgebung, nicht über den Code.
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

/** Identisch zu `pdf-reference.test.ts` — dieselbe Messung, anderer Renderer. */
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
 * darf keine Rechnungsdaten abfließen lassen. Puppeteer bekam dafür
 * `--host-resolver-rules=MAP * ~NOTFOUND`; hier muss die Session dieselbe
 * Zusicherung geben.
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

  // Dieselbe Abwägung wie PUPPETEER_NO_SANDBOX in D32: Läuft der Prozess
  // als root — im Container —, verweigert Chromium seine eigene Sandbox.
  // Als echtes Argument und nicht über die Umgebung, weil Electron die
  // Sandbox prüft, bevor Anwendungscode läuft.
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
    return JSON.parse(fs.readFileSync(REFERENCE_FILE, 'utf8')) as Record<string, DocumentGeometry>;
  }

  it.each(documents.map((doc) => doc.name))(
    'erzeugt „%s" wie der Puppeteer-Weg',
    (name) => {
      const bytes = fs.readFileSync(path.join(workDir, 'pdf', `${name}.pdf`));

      expect(isPdf(bytes)).toBe(true);
      expect(measure(bytes)).toEqual(reference()[name]);
    },
    60_000,
  );

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
