import type { TemplateSnapshot } from '@privatura/shared';
import { densityScale } from './density.js';

/**
 * Die einzige Brücke von den Einstellungen ins CSS.
 *
 * Jeder Regler des Designers ist ein Wert im Snapshot und wird hier zu einer
 * CSS-Variablen. Damit gilt für alle vier Designs dieselbe Zuordnung, und
 * ein neues Design bekommt sämtliche Regler, indem es diese Funktion an
 * seiner Wurzel aufruft.
 *
 * Wichtig für die Reproduzierbarkeit: Hier entsteht nie CSS aus freiem Text.
 * Was hier ankommt, stammt aus dem eingefrorenen Snapshot — eine alte
 * Rechnung ergibt dieselben Variablen wie am Tag ihrer Ausstellung.
 */
export function templateStyleVars(template: TemplateSnapshot): Record<string, string> {
  return {
    '--accent': template.accentColor,
    '--ink': template.inkColor,
    '--ink-soft': template.inkSoftColor,
    '--rule': template.ruleColor,
    '--band': template.bandColor,
    '--page-background': template.pageColor,
    /*
     * In Anführungszeichen, weil Schriftnamen Leerzeichen enthalten. Der
     * Wert stammt aus einer festen Auswahl — das Eingabeschema lässt nur
     * mitgelieferte Familien zu, damit Vorschau und PDF gleich umbrechen.
     */
    '--font-family': `'${template.fontFamily}'`,
    '--logo-width': `${template.logoWidthMm}mm`,
    '--density': String(densityScale(template.density)),
  };
}
