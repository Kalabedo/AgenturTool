/**
 * Erzeugt `src/srgb-profile.generated.ts` — ein sRGB-ICC-Profil als Base64.
 *
 * ## Wozu ein Farbprofil in einer Rechnungssoftware
 *
 * PDF/A verlangt, dass ein Dokument sagt, was seine Farben bedeuten: ein
 * `OutputIntent` mit eingebettetem ICC-Profil. Ohne ihn ist die Datei kein
 * PDF/A-3, und ohne PDF/A-3 ist sie kein ZUGFeRD. Das ist die einzige
 * Stelle, an der diese Anwendung überhaupt mit Farbmanagement zu tun hat.
 *
 * ## Warum selbst erzeugt und nicht mitgeliefert
 *
 * Die naheliegende Lösung wäre, eine `.icc`-Datei aus dem Betriebssystem
 * oder von einer Website danebenzulegen. Beides scheidet aus: Die Profile
 * in macOS und Windows gehören Apple beziehungsweise Microsoft, und die
 * Anwendung wird verkauft. Ein fremdes Profil mitzuliefern wäre eine
 * Lizenzfrage, die sich mit ein paar hundert Zeilen Rechnen vermeiden
 * lässt.
 *
 * Denn die Zahlen selbst sind frei: Die Primärvalenzen und die
 * Übertragungsfunktion von sRGB stehen in IEC 61966-2-1. Zahlen sind
 * Tatsachen, keine schützbare Gestaltung. Dieses Skript baut daraus ein
 * ICC-v2-Profil nach der Spezifikation ICC.1:2001-04.
 *
 * ## Warum das Ergebnis eingecheckt ist
 *
 * Dieselbe Begründung wie bei den Schriften in `invoice-template`: Der Bau
 * soll nicht von einem Erzeugungsschritt abhängen, und eine Änderung am
 * Profil soll im Diff sichtbar werden statt still zu geschehen.
 *
 * Neu erzeugen: pnpm --filter @agentur-tool/einvoice srgb
 */
import { writeFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

const here = dirname(fileURLToPath(import.meta.url));
const target = join(here, '..', 'src', 'srgb-profile.generated.ts');

/** ICC speichert Brüche als s15Fixed16: Vorzeichen, 15 Bit ganz, 16 Bit Rest. */
function s15Fixed16(value) {
  return Math.round(value * 65536);
}

function uint32(value) {
  const buffer = Buffer.alloc(4);
  buffer.writeUInt32BE(value >>> 0, 0);
  return buffer;
}

function int32(value) {
  const buffer = Buffer.alloc(4);
  buffer.writeInt32BE(value, 0);
  return buffer;
}

function signature(text) {
  return Buffer.from(text.padEnd(4, ' ').slice(0, 4), 'ascii');
}

/**
 * Ein XYZType-Tag: Kennung, Füller, drei Koordinaten.
 */
function xyzTag(x, y, z) {
  return Buffer.concat([
    signature('XYZ '),
    uint32(0),
    int32(s15Fixed16(x)),
    int32(s15Fixed16(y)),
    int32(s15Fixed16(z)),
  ]);
}

/**
 * Die Übertragungsfunktion von sRGB als Wertetabelle.
 *
 * Ein reiner Gamma-Wert von 2,2 wäre kürzer und für die Konformität
 * ausreichend — aber falsch: sRGB ist abschnittsweise definiert, mit einem
 * linearen Stück am unteren Ende. Die Tabelle bildet die Funktion ab, wie
 * sie in der Norm steht, statt sie zu behaupten.
 */
function srgbToneCurve(points = 1024) {
  const body = Buffer.alloc(points * 2);

  for (let index = 0; index < points; index += 1) {
    const input = index / (points - 1);
    const linear = input <= 0.04045 ? input / 12.92 : Math.pow((input + 0.055) / 1.055, 2.4);
    body.writeUInt16BE(Math.round(Math.min(1, Math.max(0, linear)) * 65535), index * 2);
  }

  return Buffer.concat([signature('curv'), uint32(0), uint32(points), body]);
}

/**
 * Ein textDescriptionType (ICC v2, Tag `desc`).
 *
 * Sperriger als der v4-Nachfolger: Er trägt den ASCII-Text, dazu leere
 * Felder für Unicode und Macintosh-Skript, die zwar niemand liest, ohne die
 * das Tag aber ungültig ist.
 */
function textDescription(text) {
  const ascii = Buffer.from(`${text}\0`, 'ascii');
  return Buffer.concat([
    signature('desc'),
    uint32(0),
    uint32(ascii.length),
    ascii,
    uint32(0), // Unicode-Sprachcode
    uint32(0), // Länge des Unicode-Texts
    Buffer.alloc(2), // Macintosh-Skriptcode
    Buffer.alloc(1), // Länge des Macintosh-Texts
    Buffer.alloc(67), // Macintosh-Text, fest 67 Byte
  ]);
}

function textTag(text) {
  return Buffer.concat([signature('text'), uint32(0), Buffer.from(`${text}\0`, 'ascii')]);
}

function buildProfile() {
  const curve = srgbToneCurve();

  /**
   * Die Primärvalenzen, auf D50 angepasst.
   *
   * sRGB ist auf D65 definiert, der Verbindungsfarbraum von ICC aber auf
   * D50. Die Werte hier sind die per Bradford-Transformation angepassten —
   * dieselben, die in jedem sRGB-Profil stehen.
   */
  const tags = [
    ['desc', textDescription('sRGB IEC61966-2.1')],
    ['wtpt', xyzTag(0.9642, 1.0, 0.8249)],
    ['rXYZ', xyzTag(0.4360657, 0.2224932, 0.0139089)],
    ['gXYZ', xyzTag(0.3851471, 0.7168732, 0.0970901)],
    ['bXYZ', xyzTag(0.1430817, 0.0606335, 0.7141131)],
    // Die drei Kanäle teilen sich eine Tabelle. ICC erlaubt ausdrücklich,
    // dass mehrere Tags auf dieselben Daten zeigen; das spart zwei Drittel
    // der Größe, ohne an der Bedeutung etwas zu ändern.
    ['rTRC', curve],
    ['gTRC', curve],
    ['bTRC', curve],
    ['cprt', textTag('Public Domain. Aus den Zahlen der IEC 61966-2-1 erzeugt.')],
  ];

  const headerSize = 128;
  const tableSize = 4 + tags.length * 12;

  // Erst die Daten anordnen, dann die Tabelle schreiben: Die Tabelle
  // braucht die Offsets, die sich erst aus der Anordnung ergeben.
  const placed = new Map();
  const blocks = [];
  let offset = headerSize + tableSize;

  for (const [, data] of tags) {
    if (placed.has(data)) continue;
    placed.set(data, offset);
    blocks.push(data);
    offset += data.length;
    // ICC verlangt Ausrichtung auf vier Byte.
    const padding = (4 - (data.length % 4)) % 4;
    if (padding > 0) {
      blocks.push(Buffer.alloc(padding));
      offset += padding;
    }
  }

  const totalSize = offset;

  const table = Buffer.concat([
    uint32(tags.length),
    ...tags.map(([name, data]) =>
      Buffer.concat([signature(name), uint32(placed.get(data)), uint32(data.length)]),
    ),
  ]);

  const header = Buffer.alloc(headerSize);
  header.writeUInt32BE(totalSize, 0);
  signature('none').copy(header, 4); // bevorzugtes CMM: keins
  header.writeUInt32BE(0x02100000, 8); // Fassung 2.1
  signature('mntr').copy(header, 12); // Geräteklasse: Bildschirm
  signature('RGB ').copy(header, 16);
  signature('XYZ ').copy(header, 20); // Verbindungsfarbraum
  // Zeitstempel: fest, damit zwei Läufe dieselbe Datei erzeugen und ein
  // Diff nur dann entsteht, wenn sich wirklich etwas geändert hat.
  header.writeUInt16BE(2026, 24); // Jahr
  header.writeUInt16BE(1, 26); // Monat
  header.writeUInt16BE(1, 28); // Tag
  signature('acsp').copy(header, 36);
  header.writeUInt32BE(0, 40); // Plattform: keine bestimmte
  header.writeUInt32BE(0, 64); // Wiedergabeabsicht: wahrnehmungsorientiert
  // Der Beleuchtungskörper des Verbindungsfarbraums ist immer D50.
  header.writeInt32BE(s15Fixed16(0.9642), 68);
  header.writeInt32BE(s15Fixed16(1.0), 72);
  header.writeInt32BE(s15Fixed16(0.8249), 76);

  return Buffer.concat([header, table, ...blocks]);
}

const profile = buildProfile();

const lines = [];
for (let index = 0; index < profile.length; index += 48) {
  lines.push(`  '${profile.subarray(index, index + 48).toString('base64')}'`);
}

const source = `/**
 * Ein sRGB-ICC-Profil, als Base64 eingebettet.
 *
 * **Erzeugt — nicht von Hand geändert.** Quelle ist
 * \`scripts/build-srgb-profile.mjs\`; dort steht auch, warum das Profil
 * gerechnet und nicht mitgeliefert wird. Neu erzeugen mit
 * \`pnpm --filter @agentur-tool/einvoice srgb\`.
 *
 * Gebraucht wird es für den \`OutputIntent\` des PDF/A-3 — ohne ihn ist die
 * Datei kein PDF/A und damit kein ZUGFeRD.
 */

/** Das Profil, zeilenweise umbrochen; \`srgbProfileBytes()\` setzt es zusammen. */
const SRGB_PROFILE_BASE64 = [
${lines.join(',\n')},
].join('');

/** Name des Profils, wie er im \`OutputIntent\` steht. */
export const SRGB_PROFILE_NAME = 'sRGB IEC61966-2.1';

/** Anzahl der Farbkanäle — für den PDF-Eintrag \`/N\`. */
export const SRGB_PROFILE_COMPONENTS = 3;

export function srgbProfileBytes(): Uint8Array {
  // Aus Base64 statt als Byte-Array im Quelltext: Das wären hier rund
  // 2.100 Zahlen, die keine Fassung eines Editors gern anzeigt.
  return Uint8Array.from(atob(SRGB_PROFILE_BASE64), (character) => character.charCodeAt(0));
}
`;

writeFileSync(target, source, 'utf8');
console.log(`sRGB-Profil erzeugt: ${String(profile.length)} Byte → ${target}`);
