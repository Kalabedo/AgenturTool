import { ClassicTemplate } from './templates/classic/ClassicTemplate.js';
import { CLASSIC_CSS, PAGE as CLASSIC_PAGE } from './templates/classic/styles.js';
import type { TemplateDefinition } from './types.js';

/**
 * Registry der verfügbaren Templates.
 *
 * V1 liefert genau eines. Die Registry existiert trotzdem, weil der
 * `templateKey` im templateSnapshot jeder finalisierten Rechnung steht: Ein
 * Template, das einmal benutzt wurde, muss auffindbar bleiben, auch wenn es
 * längst nicht mehr die Voreinstellung ist.
 */

export const DEFAULT_TEMPLATE_KEY = 'classic';

const templates = new Map<string, TemplateDefinition>();

export function registerTemplate(definition: TemplateDefinition): void {
  templates.set(definition.key, definition);
}

export function getTemplate(key: string): TemplateDefinition | undefined {
  return templates.get(key);
}

export function listTemplates(): TemplateDefinition[] {
  return [...templates.values()];
}

/**
 * Liefert das gewünschte Template und fällt auf „classic" zurück.
 *
 * Der Rückfall ist Absicht: Lieber druckt eine alte Rechnung mit einem
 * anderen Layout, als dass ihr PDF gar nicht mehr entsteht. Die Beträge und
 * Texte stammen ohnehin aus dem Snapshot und bleiben unverändert.
 */
export function resolveTemplate(key: string): TemplateDefinition {
  const found = templates.get(key) ?? templates.get(DEFAULT_TEMPLATE_KEY);
  if (found === undefined) {
    throw new Error(`Kein Template registriert (gesucht: "${key}").`);
  }
  return found;
}

/*
 * Alle mitgelieferten Designs an einer Stelle. Die Registrierung ist ein
 * Nebeneffekt des Imports dieser Datei — ein Design, das hier fehlt, wird
 * lautlos durch „classic" ersetzt, statt einen Fehler zu erzeugen.
 */
registerTemplate({
  key: DEFAULT_TEMPLATE_KEY,
  label: 'Klassisch',
  description: 'Ruhig und geschäftsmäßig, mit feinen Linien und einem grauen Tabellenkopf.',
  page: CLASSIC_PAGE,
  capabilities: {
    colors: ['accent', 'ink', 'inkSoft', 'rule', 'band'],
    blocks: ['logo', 'paymentBlock', 'footerRule'],
    density: true,
    logoWidth: true,
  },
  css: CLASSIC_CSS,
  render: (model) => ClassicTemplate({ model }),
});
