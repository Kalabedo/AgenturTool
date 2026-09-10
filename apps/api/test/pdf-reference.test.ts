/**
 * Der Renderer erzeugt, was er erzeugen soll — gemessen, nicht behauptet.
 *
 * Dieser Test steht bewusst neben `pdf.test.ts` und nicht darin: Dort geht
 * es um den Weg von der Datenbank zum abgelegten Dokument, hier um den
 * letzten Meter — HTML rein, PDF raus. Beim Wechsel des Renderers ist das
 * der einzige Test, der die Frage beantwortet, ob sich das Dokument
 * verändert hat.
 *
 * Verglichen wird gegen `fixtures/pdf-reference.json`, aufgenommen mit dem
 * Puppeteer-Weg. Neu aufnehmen:
 *
 *   UPDATE_PDF_REFERENCE=1 npx vitest run --project @agentur-tool/api \
 *     test/pdf-reference.test.ts
 *
 * Das ist ausdrücklich kein Routinegriff. Wer die Referenz neu aufnimmt,
 * erklärt damit, dass sich das Dokument ändern *durfte*.
 */
import fs from 'node:fs';
import path from 'node:path';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { ChromiumConfig, findChromiumExecutable } from '../src/pdf/chromium';
import { PdfService } from '../src/pdf/pdf.service';
import { referenceDocuments } from './reference-documents';
import { embedsFont, isPdf, pdfContentAreas, pdfPageCount, pdfPageSizes } from './pdf.helper';

const REFERENCE_FILE = path.join(__dirname, 'fixtures', 'pdf-reference.json');
const UPDATE = process.env.UPDATE_PDF_REFERENCE === '1';

/**
 * Was von einem PDF verglichen wird.
 *
 * Nicht die Bytes: Ein PDF trägt Erzeugungszeitpunkt und Produzentenkennung
 * in sich, und die unterscheiden sich zwischen zwei Läufen desselben
 * Renderers. Verglichen wird die Geometrie — sie ist es, die dem Empfänger
 * der Rechnung auffiele.
 */
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

const chromium = findChromiumExecutable(process.env.PUPPETEER_EXECUTABLE_PATH);

let renderer: PdfService;

beforeAll(() => {
  renderer = new PdfService(
    new ChromiumConfig({ get: (key: string) => process.env[key] } as never),
  );
});

afterAll(async () => {
  await renderer.onModuleDestroy();
});

describe.skipIf(chromium === null)('PDF-Referenz', () => {
  const documents = referenceDocuments();

  if (UPDATE) {
    it('nimmt die Referenz neu auf', async () => {
      const recorded: Record<string, DocumentGeometry> = {};
      for (const doc of documents) {
        const bytes = await renderer.render(doc.html, { footerTemplate: doc.footerTemplate });
        recorded[doc.name] = measure(bytes);
      }

      fs.mkdirSync(path.dirname(REFERENCE_FILE), { recursive: true });
      fs.writeFileSync(REFERENCE_FILE, `${JSON.stringify(recorded, null, 2)}\n`, 'utf8');
      expect(Object.keys(recorded)).toHaveLength(documents.length);
    }, 120_000);

    return;
  }

  /**
   * Erst beim Ausführen lesen, nicht beim Einsammeln.
   *
   * `describe.skipIf` überspringt die Tests, führt den Rumpf aber trotzdem
   * aus. Läge der Dateizugriff dort, brächte er die Testsammlung auf jeder
   * Maschine ohne Chromium zum Absturz — statt sie sauber zu überspringen.
   */
  function reference(): Record<string, DocumentGeometry> {
    if (!fs.existsSync(REFERENCE_FILE)) {
      throw new Error(
        `Keine Referenz unter ${REFERENCE_FILE}. Einmalig aufnehmen mit UPDATE_PDF_REFERENCE=1.`,
      );
    }
    return JSON.parse(fs.readFileSync(REFERENCE_FILE, 'utf8')) as Record<string, DocumentGeometry>;
  }

  it.each(documents.map((doc) => [doc.name, doc] as const))(
    'erzeugt „%s" unverändert',
    async (name, doc) => {
      const bytes = await renderer.render(doc.html, { footerTemplate: doc.footerTemplate });

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
});
