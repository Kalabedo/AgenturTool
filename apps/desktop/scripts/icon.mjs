/**
 * `node scripts/icon.mjs` — das Programmsymbol erzeugen.
 *
 * Quelle ist das Zeichen der Anwendung aus `apps/web/public/favicon.svg`:
 * ein weißes A auf einem dunklen, abgerundeten Quadrat. Hier entsteht
 * daraus `build/icon.png` mit 1024 × 1024. Die Formate der
 * Betriebssysteme — `.icns` für macOS, `.ico` für Windows — leitet
 * electron-builder daraus selbst ab.
 *
 * Warum das Bild ausgerechnet wird und nicht gerastert:
 *
 * Der naheliegende Weg wäre Electrons Chromium, das ja ohnehin im Baum
 * liegt. Er scheitert an der Durchsichtigkeit: Ein Fenster mit
 * `transparent: true` wird ohne Fensterverwaltung nie gezeichnet, und
 * `capturePage` wartet dann ohne Ende — auf einem Bauserver also immer.
 * Ohne Durchsichtigkeit wären die abgerundeten Ecken keine Ecken mehr,
 * sondern weiße Dreiecke.
 *
 * Die Form besteht aus einem abgerundeten Rechteck und zwei Vielecken aus
 * lauter geraden Kanten. Das lässt sich in vierzig Zeilen genauer
 * ausrechnen, als ein Browser es zeichnen würde, und läuft überall, wo
 * Node läuft. Der Preis: Ändert sich das Favicon, ändert sich das
 * Programmsymbol nicht von selbst — die Koordinaten unten stehen für sich.
 */
import fs from 'node:fs';
import path from 'node:path';
import zlib from 'node:zlib';
import { fileURLToPath } from 'node:url';

const desktopDir = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const target = path.join(desktopDir, 'build/icon.png');

/** Kantenlänge in Bildpunkten. macOS und Windows leiten alles Kleinere ab. */
const SIZE = 1024;
/** Proben je Achse und Bildpunkt — 16 Messungen ergeben weiche Kanten. */
const SAMPLES = 4;

// Das Koordinatensystem des SVG (viewBox="0 0 64 64").
const VIEW = 64;
const RADIUS = 14;
const BACKGROUND = [0x0f, 0x17, 0x2a];
const FOREGROUND = [0xff, 0xff, 0xff];

/** Der Umriss des A. */
const LETTER = [
  [17, 47],
  [29, 17],
  [36, 17],
  [48, 47],
  [40, 47],
  [37.6, 40],
  [27.1, 40],
  [24.6, 47],
];

/** Die Öffnung darin — dasselbe `Z`-Vieleck wie im SVG. */
const COUNTER = [
  [29.4, 33],
  [35.4, 33],
  [32.5, 24],
];

/**
 * Liegt der Punkt im abgerundeten Quadrat?
 *
 * Innerhalb der Ränder immer; in den vier Ecken nur innerhalb des Kreises
 * mit dem Eckradius.
 */
function inRoundedSquare(x, y) {
  if (x < 0 || y < 0 || x > VIEW || y > VIEW) return false;

  const cx = x < RADIUS ? RADIUS : x > VIEW - RADIUS ? VIEW - RADIUS : x;
  const cy = y < RADIUS ? RADIUS : y > VIEW - RADIUS ? VIEW - RADIUS : y;
  if (cx === x || cy === y) return true;

  return (x - cx) ** 2 + (y - cy) ** 2 <= RADIUS ** 2;
}

/** Vielecktest nach der Anzahl gekreuzter Kanten. */
function inPolygon(points, x, y) {
  let inside = false;
  for (let i = 0, j = points.length - 1; i < points.length; j = i++) {
    const [xi, yi] = points[i];
    const [xj, yj] = points[j];
    if (yi > y !== yj > y && x < ((xj - xi) * (y - yi)) / (yj - yi) + xi) {
      inside = !inside;
    }
  }
  return inside;
}

const CRC_TABLE = Array.from({ length: 256 }, (_unused, index) => {
  let value = index;
  for (let bit = 0; bit < 8; bit += 1) {
    value = value & 1 ? 0xed_b8_83_20 ^ (value >>> 1) : value >>> 1;
  }
  return value >>> 0;
});

const pixels = Buffer.alloc(SIZE * SIZE * 4);
const scale = VIEW / SIZE;
const perPixel = SAMPLES * SAMPLES;

for (let py = 0; py < SIZE; py += 1) {
  for (let px = 0; px < SIZE; px += 1) {
    let square = 0;
    let letter = 0;

    for (let sy = 0; sy < SAMPLES; sy += 1) {
      for (let sx = 0; sx < SAMPLES; sx += 1) {
        const x = (px + (sx + 0.5) / SAMPLES) * scale;
        const y = (py + (sy + 0.5) / SAMPLES) * scale;
        if (!inRoundedSquare(x, y)) continue;

        square += 1;
        if (inPolygon(LETTER, x, y) && !inPolygon(COUNTER, x, y)) {
          letter += 1;
        }
      }
    }

    const offset = (py * SIZE + px) * 4;
    if (square === 0) continue;

    // Die Deckung des Quadrats ist die Deckkraft; innerhalb davon
    // entscheidet die Deckung des Buchstabens über die Farbe.
    const alpha = square / perPixel;
    const share = letter / square;
    for (let channel = 0; channel < 3; channel += 1) {
      pixels[offset + channel] = Math.round(
        BACKGROUND[channel] * (1 - share) + FOREGROUND[channel] * share,
      );
    }
    pixels[offset + 3] = Math.round(alpha * 255);
  }
}

fs.mkdirSync(path.dirname(target), { recursive: true });
fs.writeFileSync(target, encodePng(pixels, SIZE, SIZE));
process.stdout.write(
  `${path.relative(desktopDir, target)}: ${String(SIZE)} × ${String(SIZE)}, ` +
    `${String(Math.round(fs.statSync(target).size / 1024))} kB\n`,
);

/**
 * Ein PNG aus RGBA-Bildpunkten.
 *
 * Das Format ist an dieser Stelle schlicht: eine Signatur, drei Blöcke,
 * je mit Länge, Kennung, Inhalt und Prüfsumme. Vor jeder Bildzeile steht
 * ein Byte für den Filter — 0 heißt „unverändert".
 */
function encodePng(rgba, width, height) {
  const raw = Buffer.alloc((width * 4 + 1) * height);
  for (let y = 0; y < height; y += 1) {
    raw[y * (width * 4 + 1)] = 0;
    rgba.copy(raw, y * (width * 4 + 1) + 1, y * width * 4, (y + 1) * width * 4);
  }

  const header = Buffer.alloc(13);
  header.writeUInt32BE(width, 0);
  header.writeUInt32BE(height, 4);
  header[8] = 8; // Bit je Kanal
  header[9] = 6; // Farbtyp: RGBA
  // 10..12: Kompression, Filter, Interlace — alle 0.

  return Buffer.concat([
    Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]),
    chunk('IHDR', header),
    chunk('IDAT', zlib.deflateSync(raw, { level: 9 })),
    chunk('IEND', Buffer.alloc(0)),
  ]);
}

function chunk(type, data) {
  const length = Buffer.alloc(4);
  length.writeUInt32BE(data.length, 0);
  const body = Buffer.concat([Buffer.from(type, 'latin1'), data]);
  const checksum = Buffer.alloc(4);
  checksum.writeUInt32BE(crc32(body), 0);
  return Buffer.concat([length, body, checksum]);
}

function crc32(buffer) {
  let crc = 0xff_ff_ff_ff;
  for (const byte of buffer) {
    crc = CRC_TABLE[(crc ^ byte) & 0xff] ^ (crc >>> 8);
  }
  return (crc ^ 0xff_ff_ff_ff) >>> 0;
}
