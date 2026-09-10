/**
 * Ein Renderer, der nicht rendert.
 *
 * Die meisten Tests rund um PDFs prüfen gar keine PDFs: Sie prüfen, ob eine
 * Nummer vergeben wurde, ob die Datei unter `invoices/2026/…` landet, ob ein
 * Storno ein eigenes Dokument bekommt, ob eine abgebrochene Finalisierung
 * keine Nummer verbraucht. Dafür brauchen sie von der PDF-Erzeugung nur
 * eines: ein paar Bytes, die ein gültiges PDF sind.
 *
 * Vorher hing all das an einem installierten Chromium und wurde ohne ihn
 * übersprungen — rund zwei Dutzend Tests, die mit dem Browser nichts zu tun
 * haben. Mit diesem Stub laufen sie immer.
 *
 * Was wirklich am Rendern hängt — Seitenmaß, Ränder, eingebettete Schrift —
 * steht in `pdf-electron.test.ts` und geht dort durch das echte Chromium.
 */
import type { PdfRenderer, PdfRenderOptions } from '../src/pdf/pdf-renderer';

/**
 * Ein einseitiges, gültiges PDF von Hand.
 *
 * Von Hand und nicht aus einer Bibliothek, weil der Sinn dieses Stubs
 * gerade ist, keinen Renderer zu brauchen. Der Inhalt ist bewusst
 * belanglos; nur Struktur und Kopf müssen stimmen, damit `isPdf` und
 * `pdfPageCount` aus `pdf.helper.ts` etwas Vernünftiges sehen.
 */
function minimalPdf(): Buffer {
  const objects = [
    '1 0 obj\n<< /Type /Catalog /Pages 2 0 R >>\nendobj\n',
    '2 0 obj\n<< /Type /Pages /Kids [3 0 R] /Count 1 >>\nendobj\n',
    '3 0 obj\n<< /Type /Page /Parent 2 0 R /MediaBox [0 0 595 842] /Contents 4 0 R >>\nendobj\n',
    '4 0 obj\n<< /Length 0 >>\nstream\n\nendstream\nendobj\n',
  ];

  let pdf = '%PDF-1.4\n';
  const offsets: number[] = [];
  for (const object of objects) {
    offsets.push(pdf.length);
    pdf += object;
  }

  const startxref = pdf.length;
  pdf += `xref\n0 ${String(objects.length + 1)}\n0000000000 65535 f \n`;
  for (const offset of offsets) {
    pdf += `${offset.toString().padStart(10, '0')} 00000 n \n`;
  }
  pdf += `trailer\n<< /Size ${String(objects.length + 1)} /Root 1 0 R >>\n`;
  pdf += `startxref\n${String(startxref)}\n%%EOF\n`;

  return Buffer.from(pdf, 'latin1');
}

export class StubPdfRenderer implements PdfRenderer {
  /** Was zuletzt zu rendern war — nützlich, wenn ein Test das HTML prüfen will. */
  lastHtml: string | null = null;
  lastOptions: PdfRenderOptions | null = null;
  calls = 0;

  render(html: string, options: PdfRenderOptions): Promise<Buffer> {
    this.lastHtml = html;
    this.lastOptions = options;
    this.calls += 1;
    return Promise.resolve(minimalPdf());
  }
}
