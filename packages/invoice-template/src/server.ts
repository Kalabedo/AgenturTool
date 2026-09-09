import { renderToStaticMarkup } from 'react-dom/server';
import { resolveTemplate } from './registry.js';
import { PAGE } from './templates/classic/styles.js';
import type { InvoiceRenderModel } from './types.js';

/**
 * Eigener Einstiegspunkt für das Rendern im Backend.
 *
 * `react-dom/server` steht bewusst nicht im Haupt-Barrel: Das Frontend
 * importiert dieselbe Komponente, und ein Import in der gemeinsamen Datei
 * zöge den Server-Renderer in das Browser-Bundle. Zwei Einstiegspunkte sind
 * billiger als die Hoffnung, dass Tree Shaking das schon richten wird.
 */

export interface RenderDocumentOptions {
  /** Titel des HTML-Dokuments; landet in den PDF-Metadaten. */
  title?: string;
  /** Zusätzliches CSS, etwa für Tests oder Sonderfälle. */
  extraCss?: string;
}

function escapeHtml(value: string): string {
  return value
    .replace(/&/gu, '&amp;')
    .replace(/</gu, '&lt;')
    .replace(/>/gu, '&gt;')
    .replace(/"/gu, '&quot;');
}

/**
 * Rendert das Modell zu einem vollständigen HTML-Dokument für Puppeteer.
 *
 * Das Ergebnis ist absichtlich autark: Schrift als Data-URI, CSS inline,
 * Logo als Data-URI im Modell. Puppeteer bekommt es über `setContent` und
 * braucht danach keinen einzigen Netzwerkzugriff — sonst hinge das PDF an
 * der Erreichbarkeit der eigenen API, und ein Timeout erzeugte lautlos ein
 * Dokument ohne Logo.
 */
export function renderInvoiceDocument(
  model: InvoiceRenderModel,
  options: RenderDocumentOptions = {},
): string {
  const template = resolveTemplate(model.template.templateKey);
  const body = renderToStaticMarkup(template.render(model));
  const title = options.title ?? `Rechnung ${model.number ?? 'Entwurf'}`;

  return [
    '<!doctype html>',
    '<html lang="de">',
    '<head>',
    '<meta charset="utf-8">',
    `<title>${escapeHtml(title)}</title>`,
    `<style>${template.css}${options.extraCss ?? ''}</style>`,
    '</head>',
    '<body style="margin:0">',
    body,
    '</body>',
    '</html>',
  ].join('\n');
}

/**
 * Die Fußzeile, die Puppeteer auf jede Seite setzt.
 *
 * Sie entsteht hier und nicht im Backend, weil sie zwei Dinge aus dem
 * Template kennen muss: den Seitenrand (`PAGE.marginMm`, rechts zuzüglich
 * `PAGE.edgeGapMm`), damit sie mit dem Textblock darüber fluchtet, und die
 * Höhe des Fußbereichs, für den `@page` den Platz freihält.
 *
 * Chromium rendert dieses Fragment in einem eigenen Dokument — ohne das
 * Stylesheet der Seite und ohne die eingebettete Schrift. Deshalb steht das
 * CSS inline, deshalb eine generische Schriftfamilie, und deshalb eine feste
 * Größe: Ohne `font-size` erbt das Fragment 0 und bleibt unsichtbar.
 *
 * `pageNumber` und `totalPages` sind Klassennamen, die Chromium beim Druck
 * selbst füllt.
 */
export function renderInvoiceFooterTemplate(model: InvoiceRenderModel): string {
  const label = model.number === null ? 'Entwurf' : `Rechnung ${model.number}`;

  return [
    '<div style="width:100%;box-sizing:border-box;',
    `padding:0 ${PAGE.marginMm + PAGE.edgeGapMm}mm 0 ${PAGE.marginMm}mm;`,
    'font-family:Helvetica,Arial,sans-serif;font-size:7.5pt;color:#6b7280;',
    'display:flex;justify-content:space-between;align-items:center">',
    `<span>${escapeHtml(label)}</span>`,
    '<span>Seite <span class="pageNumber"></span> von <span class="totalPages"></span></span>',
    '</div>',
  ].join('');
}
