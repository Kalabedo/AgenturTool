/**
 * Die Designliste steht an zwei Orten — hier wird geprüft, dass sie
 * übereinstimmen.
 *
 * `TEMPLATE_KEY_VALUES` liegt in `@agentur-tool/shared`, weil das
 * Eingabeschema die Auswahl prüfen muss und `shared` nicht von diesem Paket
 * abhängen darf: Die Abhängigkeit läuft andersherum. Die Verdopplung ist
 * damit unvermeidlich, das stille Auseinanderlaufen nicht.
 *
 * Liefe es doch auseinander, wäre der Fehler besonders unangenehm: Ein
 * Design, das im Schema steht, aber nicht registriert ist, ließe sich
 * einstellen und fiele beim Drucken lautlos auf „classic" zurück.
 */
import { TEMPLATE_KEY_VALUES } from '@agentur-tool/shared';
import { describe, expect, it } from 'vitest';
import { listTemplates, resolveTemplate } from '../src/registry.js';

describe('Registrierte Designs', () => {
  it('entsprechen genau der Auswahl im Eingabeschema', () => {
    const registered = listTemplates()
      .map((template) => template.key)
      .sort();

    expect(registered).toEqual([...TEMPLATE_KEY_VALUES].sort());
  });

  it('bringen alle eine Seitengeometrie mit', () => {
    for (const template of listTemplates()) {
      // Ohne sie stünde die Fußzeile nicht unter dem Textblock, sondern
      // irgendwo.
      expect(template.page.edgeGapMm).toBeGreaterThan(0.5);
      expect(template.page.widthMm).toBe(210);
      expect(template.page.heightMm).toBe(297);
    }
  });

  it('beschreiben sich für die Auswahl im Designer', () => {
    for (const template of listTemplates()) {
      expect(template.label.length).toBeGreaterThan(0);
      expect(template.description.length).toBeGreaterThan(0);
    }
  });

  it('fallen bei unbekanntem Schlüssel auf „classic" zurück', () => {
    // Eine alte Rechnung, deren Design es nicht mehr gibt, soll drucken —
    // mit anderem Layout, aber sie soll drucken.
    expect(resolveTemplate('gibt-es-nicht').key).toBe('classic');
  });
});
