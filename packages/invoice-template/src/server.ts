import { renderToStaticMarkup } from 'react-dom/server';
import { resolveTemplate } from './registry.js';
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
