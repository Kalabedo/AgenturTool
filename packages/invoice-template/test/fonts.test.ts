import { describe, expect, it } from 'vitest';
import { embeddedFontCss } from '../src/fonts.js';
import { renderInvoiceDocument } from '../src/server.js';
import { buildRenderModel } from '../src/render-model.js';
import { DEFAULT_TEMPLATE, REFERENCE_INVOICE } from './fixtures.js';

/**
 * Die Familien, die ein Dokument als `@font-face` mitbringt.
 *
 * Geprüft wird die Einbettung und nicht jedes Vorkommen des Namens: Die
 * Designs nennen in ihrem `:root` eine Vorgabe, die nie greift, weil die
 * Wurzel die Variable immer setzt. Sie zu zählen hieße, das Falsche zu
 * messen — teuer ist die eingebettete Schrift, nicht ihr Name.
 */
function embeddedFamilies(html: string): string[] {
  return [...html.matchAll(/@font-face\s*\{\s*font-family:\s*'([^']+)'/gu)]
    .map((match) => match[1] ?? '')
    .filter((name, index, all) => all.indexOf(name) === index);
}

describe('Nur die gewählte Schrift im Dokument', () => {
  it('bettet die Serifenschrift ein, wenn sie gewählt ist', () => {
    const html = renderInvoiceDocument(
      buildRenderModel({
        ...REFERENCE_INVOICE,
        template: { ...DEFAULT_TEMPLATE, fontFamily: 'Source Serif 4' },
      }),
    );

    // Nur diese eine — jede weitere kostete rund 50 kB in jedem PDF.
    expect(embeddedFamilies(html)).toEqual(['Source Serif 4']);
  });

  it('bettet Open Sans ein, wenn sie gewählt ist', () => {
    const html = renderInvoiceDocument(buildRenderModel(REFERENCE_INVOICE));

    expect(embeddedFamilies(html)).toEqual(['Open Sans']);
  });

  it('fällt bei unbekanntem Namen auf die Vorgabe zurück', () => {
    // Ein Snapshot aus einer Fassung mit anderer Schriftauswahl soll
    // drucken, nicht scheitern.
    expect(embeddedFontCss('Gibt Es Nicht')).toBe(embeddedFontCss('Open Sans'));
  });
});
