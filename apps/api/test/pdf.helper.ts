import zlib from 'node:zlib';

/**
 * Ein sehr kleiner Blick in ein PDF.
 *
 * Bewusst kein Parser und keine Bibliothek: Geprüft werden soll nicht das
 * Dateiformat, sondern drei Zusagen aus der Architektur — A4, richtige
 * Seitenzahl, gleiche Ränder auf jeder Seite. Dafür genügt es, im
 * unkomprimierten Teil der Datei nachzusehen und die Inhaltsströme zu
 * entpacken.
 *
 * Die Zahlen in einem Inhaltsstrom stehen in Chromiums Druckauflösung
 * (300 dpi); `DEVICE_TO_POINTS` rechnet sie in PostScript-Punkte um, in
 * denen auch die MediaBox notiert ist.
 */

const DEVICE_TO_POINTS = 72 / 300;

/** 1 mm in PostScript-Punkten. */
export const MM = 72 / 25.4;

export function isPdf(bytes: Buffer): boolean {
  return bytes.subarray(0, 5).toString('latin1') === '%PDF-';
}

/** Seitenzahl über die Seitenobjekte; „/Pages" darf nicht mitzählen. */
export function pdfPageCount(bytes: Buffer): number {
  return (bytes.toString('latin1').match(/\/Type\s*\/Page[^s]/gu) ?? []).length;
}

export interface PdfBox {
  widthPt: number;
  heightPt: number;
}

export function pdfPageSizes(bytes: Buffer): PdfBox[] {
  const matches = bytes.toString('latin1').matchAll(/\/MediaBox\s*\[([^\]]+)\]/gu);

  return [...matches].map((match) => {
    const [x0 = 0, y0 = 0, x1 = 0, y1 = 0] = (match[1] ?? '')
      .trim()
      .split(/\s+/u)
      .map((value) => Number(value));
    return { widthPt: x1 - x0, heightPt: y1 - y0 };
  });
}

export interface PdfContentArea {
  leftPt: number;
  topPt: number;
  widthPt: number;
  heightPt: number;
}

/**
 * Der beschreibbare Bereich jeder Seite.
 *
 * Chromium klammert den Seiteninhalt auf genau den Kasten, den `@page`
 * übrig lässt. Dieser Kasten ist deshalb der Beleg dafür, dass die Ränder
 * aus dem Stylesheet kommen und auf Folgeseiten dieselben sind.
 */
export function pdfContentAreas(bytes: Buffer): PdfContentArea[] {
  const areas: PdfContentArea[] = [];
  const raw = bytes.toString('latin1');
  const streamStarts = raw.matchAll(/stream\r?\n/gu);

  for (const start of streamStarts) {
    const from = (start.index ?? 0) + start[0].length;
    const to = raw.indexOf('endstream', from);
    if (to === -1) continue;

    let content: string;
    try {
      content = zlib.inflateSync(bytes.subarray(from, to)).toString('latin1');
    } catch {
      // Nicht jeder Strom ist ein komprimierter Inhaltsstrom — Schriften und
      // Bilder liegen genauso da und werden hier übersprungen.
      continue;
    }

    const clip = /(-?[\d.]+) (-?[\d.]+) (-?[\d.]+) (-?[\d.]+) re\nW\*/u.exec(content);
    if (clip === null || !content.includes('Tj')) continue;

    const [, x = '0', y = '0', width = '0', height = '0'] = clip;
    areas.push({
      leftPt: Number(x) * DEVICE_TO_POINTS,
      topPt: Number(y) * DEVICE_TO_POINTS,
      widthPt: Number(width) * DEVICE_TO_POINTS,
      heightPt: Number(height) * DEVICE_TO_POINTS,
    });
  }

  return areas;
}

/** Ob eine Schrift dieses Namens in der Datei eingebettet ist. */
export function embedsFont(bytes: Buffer, family: string): boolean {
  return new RegExp(`/[A-Z]{6}\\+${family}`, 'u').test(bytes.toString('latin1'));
}
