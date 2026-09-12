import { EMBEDDED_FONTS, EMBEDDED_FONT_FAMILY } from './fonts.generated.js';

/**
 * Das Font-CSS einer Familie — und nur dieser.
 *
 * Warum nicht einfach alle einbetten: Jede Familie kostet rund 50 kB in
 * jedem erzeugten PDF und in jeder Vorschau. Ein Dokument benutzt aber
 * immer genau eine.
 *
 * Warum das nicht im CSS des Designs steht: `template.css` ist ein
 * statischer String und soll es bleiben — ein Design ist ein Wert, keine
 * Funktion der Rechnung. Die Schrift hängt dagegen an der Einstellung, also
 * stellt der Zusammensetzer des Dokuments sie voran.
 *
 * Unbekannte Namen fallen auf die Vorgabefamilie zurück, statt ein Dokument
 * ohne Schrift zu erzeugen — dieselbe Haltung wie bei `resolveTemplate`:
 * Lieber eine andere Schrift als gar kein PDF. Vorkommen kann das bei einem
 * Snapshot, der aus einer Fassung mit anderer Schriftauswahl stammt.
 */
export function embeddedFontCss(family: string): string {
  const found = EMBEDDED_FONTS[family as keyof typeof EMBEDDED_FONTS];

  return (found ?? EMBEDDED_FONTS[EMBEDDED_FONT_FAMILY]).css;
}

/** Die Namen der mitgelieferten Familien. */
export function listEmbeddedFontFamilies(): string[] {
  return Object.keys(EMBEDDED_FONTS);
}
