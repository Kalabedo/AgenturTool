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

/**
 * Die mitgelieferten Familien.
 *
 * Nur Regular und Bold je Familie. Jeder weitere Schnitt kostet rund 25 kB,
 * ohne auf dem Dokument vorzukommen — und Kursive bleibt bewusst draußen:
 * Ohne echten kursiven Schnitt stellt Chromium die Regular schräg, deren
 * Tinte bis zu 2 pt über die Laufweite hinausragt. Rechtsbündig ist das der
 * sichere Weg in den Beschnitt (siehe .meta__value--placeholder).
 *
 * `dir` und `file` stehen als Angabe je Familie da und nicht als Schablone:
 * Die Paketnamen von @fontsource folgen keiner verlässlichen Regel, und ein
 * danebengegriffener Dateiname erzeugt ein leeres Base64 statt eines
 * Fehlers.
 */
const families = [
  {
    name: 'Open Sans',
    dir: 'open-sans',
    file: (weight) => `open-sans-latin-${weight}-normal.woff2`,
    weights: [400, 700],
    license: '@fontsource/open-sans (SIL Open Font License 1.1), Subset "latin"',
  },
  {
    name: 'Source Serif 4',
    dir: 'source-serif-4',
    file: (weight) => `source-serif-4-latin-${weight}-normal.woff2`,
    weights: [400, 700],
    license: '@fontsource/source-serif-4 (SIL Open Font License 1.1), Subset "latin"',
  },
];

function faceCss(family) {
  return family.weights
    .map((weight) => {
      const path = join(
        packageRoot,
        'node_modules',
        '@fontsource',
        family.dir,
        'files',
        family.file(weight),
      );
      const base64 = readFileSync(path).toString('base64');
      if (base64.length === 0) throw new Error(`Leere Schriftdatei: ${path}`);
      return `@font-face {
  font-family: '${family.name}';
  font-style: normal;
  font-weight: ${weight};
  font-display: block;
  src: url(data:font/woff2;base64,${base64}) format('woff2');
}`;
    })
    .join('\n');
}

const entries = families.map((family) => ({ family, css: faceCss(family) }));

const table = entries
  .map(
    ({ family, css }) =>
      `  ${JSON.stringify(family.name)}: {\n    css: ${JSON.stringify(css)},\n    weights: [${family.weights.join(', ')}] as const,\n  },`,
  )
  .join('\n');

const contents = `// AUTOMATISCH ERZEUGT von scripts/embed-fonts.mjs — nicht von Hand ändern.
// Quellen:
${families.map((f) => `//   ${f.license}`).join('\n')}
// Neu erzeugen: pnpm --filter @agentur-tool/invoice-template fonts

/**
 * Die eingebetteten Schriften, je Familie.
 *
 * Ein Dokument bekommt nur die Familie, die es benutzt — siehe
 * \`embeddedFontCss\` in fonts.ts. Alle einzubetten wäre bequemer und
 * kostete rund 50 kB in jedem PDF und jeder Vorschau.
 */
export const EMBEDDED_FONTS = {
${table}
} as const;

/** Die Familie, auf die alles zurückfällt, was sonst nirgends passt. */
export const EMBEDDED_FONT_FAMILY = 'Open Sans';

/**
 * Das Font-CSS der Vorgabefamilie.
 *
 * Bleibt als eigener Export bestehen: Der Zeitnachweis baut sein eigenes
 * Dokument und kennt keine Design-Einstellung, die er nachschlagen könnte.
 */
export const EMBEDDED_FONT_CSS = EMBEDDED_FONTS[EMBEDDED_FONT_FAMILY].css;

/** Die Schnitte der Vorgabefamilie. */
export const EMBEDDED_FONT_WEIGHTS = EMBEDDED_FONTS[EMBEDDED_FONT_FAMILY].weights;
`;

const target = join(packageRoot, 'src', 'fonts.generated.ts');
writeFileSync(target, contents, 'utf8');

const kilobytes = Math.round(Buffer.byteLength(contents, 'utf8') / 1024);
const faceCount = families.reduce((sum, f) => sum + f.weights.length, 0);
console.log(
  `fonts.generated.ts geschrieben (${families.length} Familien, ${faceCount} Schnitte, ${kilobytes} kB)`,
);
