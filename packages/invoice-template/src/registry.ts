import type { TemplateDefinition } from './types.js';

/**
 * Registry der verfügbaren Templates.
 *
 * V1 liefert genau ein Template ("classic", Schritt 7). Die Registry
 * existiert trotzdem schon, weil der `templateKey` im templateSnapshot
 * jeder finalisierten Rechnung steht: Ein Template, das einmal benutzt
 * wurde, muss auffindbar bleiben, auch wenn es längst nicht mehr die
 * Voreinstellung ist.
 */
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

export const DEFAULT_TEMPLATE_KEY = 'classic';
