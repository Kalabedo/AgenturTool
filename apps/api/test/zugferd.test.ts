/**
 * Das ZUGFeRD-Dokument, wie es wirklich entsteht.
 *
 * Der einzige Test, der ein echtes Chromium-PDF nimmt und daraus ein
 * PDF/A-3 macht. Das ist der Punkt, an dem sich die Sache entscheidet:
 * Alles andere lässt sich an einem selbstgebauten PDF prüfen, aber die
 * Frage, ob Chromiums Ausgabe die Grundlage für ein Archivformat hergibt,
 * beantwortet nur Chromiums Ausgabe.
 *
 * **Was dieser Test nicht ist.** Er prüft, ob drinsteht, was drinstehen
 * soll — nicht, ob das Ergebnis der Norm genügt. Das kann nur ein fremder
 * Prüfer sagen, und der läuft in der CI (`pnpm pdfa:pruefen`, veraPDF).
 * Dieselbe Arbeitsteilung wie beim XML und dem KoSIT-Validator.
 *
 * Wie bei `pdf-electron.test.ts` läuft der Renderer in einem Kindprozess:
 * `printToPDF` braucht ein BrowserWindow, und das gibt es nur im
 * Hauptprozess von Electron.
 */
import { execFileSync } from 'node:child_process';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { embedZugferd, ZUGFERD_ATTACHMENT_NAME } from '@privatura/einvoice';
import { referenceDocuments } from './reference-documents';
import { embedsFont, isPdf, pdfPageCount, pdfPageSizes } from './pdf.helper';

const DESKTOP = path.join(__dirname, '..', '..', 'desktop');
const HARNESS = path.join(DESKTOP, 'dist', 'render-harness.js');

/**
 * Die Electron-Binärdatei liegt je Plattform woanders.
 *
 * `pdf-electron.test.ts` kennt nur den Linux-Pfad und übersprang sich damit
 * auf jedem Mac stillschweigend. Das ist dort auch richtig so: Jener Test
 * vergleicht die Geometrie gegen eine unter Linux aufgenommene Referenz,
 * und ein Mac rastert anders. Dieser Test hat dieses Problem nicht — er
 * vergleicht dasselbe Dokument vor und nach dem Einbetten, beides aus
 * demselben Lauf. Deshalb darf er überall laufen, und deshalb steht die
 * Auflösung hier und nicht dort.
 */
function electronBinary(): string {
  const dist = path.join(DESKTOP, 'node_modules', 'electron', 'dist');
  if (process.platform === 'darwin') {
    return path.join(dist, 'Electron.app', 'Contents', 'MacOS', 'Electron');
  }
  if (process.platform === 'win32') return path.join(dist, 'electron.exe');
  return path.join(dist, 'electron');
}

const ELECTRON = electronBinary();

const hasDisplay = process.platform !== 'linux' || process.env.DISPLAY !== undefined;
const available = hasDisplay && fs.existsSync(HARNESS) && fs.existsSync(ELECTRON);

/** Die Dokumente, an denen sich das Einbetten zeigt. */
const CASES = ['einseitig', 'mehrseitig', 'mit-logo', 'voll'];

/** Eine CII-Rechnung als Anhang; der Inhalt ist hier nicht der Prüfgegenstand. */
const XML = [
  '<?xml version="1.0" encoding="UTF-8"?>',
  '<rsm:CrossIndustryInvoice xmlns:rsm="urn:un:unece:uncefact:data:standard:CrossIndustryInvoice:100">',
  '  <rsm:ExchangedDocument><ram:ID>2026-001</ram:ID></rsm:ExchangedDocument>',
  '</rsm:CrossIndustryInvoice>',
].join('\n');

const OPTIONS = {
  title: 'Rechnung 2026-001',
  author: 'XYZ - Agentur',
  now: new Date('2026-03-01T10:00:00.000Z'),
};

/**
 * Wohin die erzeugten ZUGFeRD-Dateien zusätzlich geschrieben werden.
 *
 * Für den PDF/A-Prüfer: veraPDF braucht Dateien, und die einzigen echten
 * entstehen hier. Ein eigenes Skript daneben müsste Rendern und Einbetten
 * ein zweites Mal beschreiben — und wäre damit genau die zweite Fassung,
 * die irgendwann von der ersten abweicht.
 *
 *   ZUGFERD_MUSTER_DIR=/tmp/muster pnpm vitest run apps/api/test/zugferd.test.ts
 *   pnpm pdfa:pruefen /tmp/muster/*.pdf
 */
const MUSTER_DIR = process.env.ZUGFERD_MUSTER_DIR;

let workDir: string;
/** Das gedruckte PDF je Dokument, vor dem Einbetten. */
const printed = new Map<string, Buffer>();
/** Dasselbe Dokument als ZUGFeRD. */
const wrapped = new Map<string, Buffer>();

beforeAll(async () => {
  if (!available) return;

  workDir = fs.mkdtempSync(path.join(os.tmpdir(), 'privatura-zugferd-'));
  const input = path.join(workDir, 'documents.json');
  const output = path.join(workDir, 'pdf');

  const documents = referenceDocuments().filter((document) => CASES.includes(document.name));
  fs.writeFileSync(input, JSON.stringify(documents), 'utf8');

  const switches = process.env.ELECTRON_NO_SANDBOX === 'true' ? ['--no-sandbox'] : [];
  execFileSync(ELECTRON, [...switches, HARNESS, input, output], { encoding: 'utf8' });

  if (MUSTER_DIR !== undefined) fs.mkdirSync(MUSTER_DIR, { recursive: true });

  for (const document of documents) {
    const bytes = fs.readFileSync(path.join(output, `${document.name}.pdf`));
    printed.set(document.name, bytes);

    const zugferd = Buffer.from(
      await embedZugferd(bytes, XML, { ...OPTIONS, title: document.name }),
    );
    wrapped.set(document.name, zugferd);

    if (MUSTER_DIR !== undefined) {
      fs.writeFileSync(path.join(MUSTER_DIR, `${document.name}.pdf`), zugferd);
    }
  }
}, 120_000);

afterAll(() => {
  if (workDir !== undefined) fs.rmSync(workDir, { recursive: true, force: true });
});

/** Der Inhalt einer PDF-Datei als Text — für die Suche nach Strukturmarken. */
function asText(bytes: Buffer): string {
  return bytes.toString('latin1');
}

describe.skipIf(!available)('ZUGFeRD aus einem echten Chromium-PDF', () => {
  it.each(CASES)('%s bleibt ein lesbares PDF mit denselben Seiten', (name) => {
    const before = printed.get(name);
    const after = wrapped.get(name);
    if (before === undefined || after === undefined) throw new Error(`${name} fehlt`);

    expect(isPdf(after)).toBe(true);

    // Der Kern der Zusage: Das Einbetten beschreibt das Dokument, es
    // zeichnet nichts neu. Seitenzahl und Seitenmaß müssen deshalb exakt
    // gleich bleiben — ein ZUGFeRD-PDF, das anders aussieht als das PDF,
    // wäre kein Gewinn, sondern ein zweites Dokument.
    expect(pdfPageCount(after)).toBe(pdfPageCount(before));
    expect(pdfPageSizes(after)).toEqual(pdfPageSizes(before));
  });

  it.each(CASES)('%s trägt die Schrift weiterhin eingebettet', (name) => {
    const after = wrapped.get(name);
    if (after === undefined) throw new Error(`${name} fehlt`);

    // PDF/A verlangt, dass jede benutzte Schrift in der Datei steckt. Das
    // erfüllt schon das gedruckte PDF (D29); geprüft wird hier, dass das
    // Einbetten sie nicht verliert.
    expect(embedsFont(after, 'OpenSans')).toBe(true);
  });

  it('hängt die XML-Datei unter dem vorgeschriebenen Namen an', () => {
    const text = asText(wrapped.get('einseitig') as Buffer);

    expect(text).toContain(ZUGFERD_ATTACHMENT_NAME);
    // `/AF` am Katalog ist das, was einen zugehörigen Anhang von einer
    // bloßen Dateianlage unterscheidet — ohne ihn kein PDF/A-3.
    expect(text).toMatch(/\/AF\s*\[/);
    expect(text).toContain('/Alternative');
    expect(text).toContain('/Subtype /text#2Fxml');
  });

  it('erklärt sich in den Metadaten als PDF/A-3 und als ZUGFeRD', () => {
    const text = asText(wrapped.get('einseitig') as Buffer);

    expect(text).toContain('<pdfaid:part>3</pdfaid:part>');
    expect(text).toContain('<pdfaid:conformance>B</pdfaid:conformance>');
    expect(text).toContain('<fx:DocumentType>INVOICE</fx:DocumentType>');
    expect(text).toContain(`<fx:DocumentFileName>${ZUGFERD_ATTACHMENT_NAME}</fx:DocumentFileName>`);
    expect(text).toContain('<fx:ConformanceLevel>EN 16931</fx:ConformanceLevel>');

    // Ohne die Schema-Erklärung wären die vier fx-Angaben für PDF/A
    // unbekannte Metadaten — und damit ein Konformitätsfehler.
    expect(text).toContain('Factur-X PDFA Extension Schema');
    expect(text).toContain('urn:factur-x:pdfa:CrossIndustryDocument:invoice:1p0#');
  });

  it('bringt Ausgabeprofil und Dokumentkennung mit', () => {
    const text = asText(wrapped.get('einseitig') as Buffer);

    expect(text).toContain('/GTS_PDFA1');
    expect(text).toContain('sRGB IEC61966-2.1');
    expect(text).toMatch(/\/ID\s*\[/);
  });

  it('bleibt unverschlüsselt und ohne aktive Inhalte', () => {
    // PDF/A verbietet beides. Chromium erzeugt von sich aus nichts
    // dergleichen; der Test hält fest, dass auch das Einbetten nichts
    // hinzufügt.
    const text = asText(wrapped.get('voll') as Buffer);

    expect(text).not.toContain('/Encrypt');
    expect(text).not.toContain('/JavaScript');
    expect(text).not.toContain('/Launch');
  });

  it('erzeugt bei gleicher Eingabe dieselbe Datei', async () => {
    // Die Ablage arbeitet über Prüfsummen. Ein Zeitstempel aus `new Date()`
    // im Einbetten machte jeden Lauf einzigartig und jede Prüfsumme wertlos.
    const source = printed.get('einseitig') as Buffer;

    const first = await embedZugferd(source, XML, OPTIONS);
    const second = await embedZugferd(source, XML, OPTIONS);

    expect(Buffer.from(first).equals(Buffer.from(second))).toBe(true);
  });
});
