/**
 * Erzeugt `src/fonts.generated.ts` aus den woff2-Dateien von @fontsource.
 *
 * Warum die Schrift als Base64 im Quelltext liegt und nicht als Datei
 * daneben: Das PDF entsteht in einer Umgebung, die weder das
 * Internet noch zwingend eine brauchbare Schriftauswahl hat. Eine per URL
 * eingebundene Schrift würde dort still auf einen Ersatz zurückfallen — und
 * ein Ersatz bricht Zeilen anders um. Die Vorschau im Browser zeigte dann
 * etwas anderes als das PDF, und genau das soll die gemeinsame Komponente
 * ja verhindern.
 *
 * Die erzeugte Datei ist eingecheckt. Damit baut das Projekt auch, wenn
 * @fontsource gerade nicht erreichbar ist, und der Diff bleibt sichtbar,
 * falls sich die Schrift je ändert.
 *
 * Neu erzeugen: pnpm --filter @agentur-tool/invoice-template fonts
 */
import { readFileSync, writeFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

const here = dirname(fileURLToPath(import.meta.url));
const packageRoot = join(here, '..');
const fontDir = join(packageRoot, 'node_modules', '@fontsource', 'open-sans', 'files');

/**
 * Nur Regular und Bold. Die Referenzrechnung nutzt genau diese beiden
 * Schnitte; jeder weitere kostet rund 25 kB im Bundle, ohne dass er auf dem
 * Dokument vorkäme.
 */
const weights = [400, 700];

const faces = weights.map((weight) => {
  const file = join(fontDir, `open-sans-latin-${weight}-normal.woff2`);
  const base64 = readFileSync(file).toString('base64');
  return { weight, base64 };
});

const css = faces
  .map(
    ({ weight, base64 }) => `@font-face {
  font-family: 'Open Sans';
  font-style: normal;
  font-weight: ${weight};
  font-display: block;
  src: url(data:font/woff2;base64,${base64}) format('woff2');
}`,
  )
  .join('\n');

const contents = `// AUTOMATISCH ERZEUGT von scripts/embed-fonts.mjs — nicht von Hand ändern.
// Quelle: @fontsource/open-sans (SIL Open Font License 1.1), Subset "latin".
// Neu erzeugen: pnpm --filter @agentur-tool/invoice-template fonts

/** @font-face-Regeln mit eingebetteter Schrift, ohne jeden Netzwerkzugriff. */
export const EMBEDDED_FONT_CSS = ${JSON.stringify(css)};

/** Die Schnitte, die tatsächlich eingebettet sind. */
export const EMBEDDED_FONT_WEIGHTS = [${weights.join(', ')}] as const;

/** Name der eingebetteten Schriftfamilie. */
export const EMBEDDED_FONT_FAMILY = 'Open Sans';
`;

const target = join(packageRoot, 'src', 'fonts.generated.ts');
writeFileSync(target, contents, 'utf8');

const kilobytes = Math.round(Buffer.byteLength(contents, 'utf8') / 1024);
console.log(`fonts.generated.ts geschrieben (${weights.length} Schnitte, ${kilobytes} kB)`);
