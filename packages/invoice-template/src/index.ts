export * from './types.js';
export * from './registry.js';
export * from './render-model.js';
export { ClassicTemplate } from './templates/classic/ClassicTemplate.js';
export { CLASSIC_CSS, PAGE } from './templates/classic/styles.js';
// Das Font-CSS wird mit exportiert, weil nicht nur die Rechnung gedruckt
// wird: Der Zeitnachweis baut sein eigenes Dokument und braucht dieselbe
// eingebettete Schrift — ein PDF, das auf eine installierte Schrift hofft,
// sieht auf jeder Maschine anders aus.
export {
  EMBEDDED_FONT_CSS,
  EMBEDDED_FONT_FAMILY,
  EMBEDDED_FONT_WEIGHTS,
} from './fonts.generated.js';
