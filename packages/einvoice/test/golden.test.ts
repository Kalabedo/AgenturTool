import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { describe, expect, it } from 'vitest';
import { GOLDEN_CASES } from './golden-cases.js';

const here = path.dirname(fileURLToPath(import.meta.url));

/**
 * Der Vergleich gegen abgelegte Dateien.
 *
 * Einzelne Zusicherungen prüfen, ob ein Feld richtig geschrieben wird.
 * Dieser Test prüft etwas anderes: ob sich die Datei **als Ganzes**
 * unbemerkt verändert hat. Bei einem sequenzstrengen Format ist das die
 * wichtigere Frage — ein verschobenes Element bricht keine einzelne
 * Zusicherung, macht die Datei aber ungültig.
 *
 * Dieselben Dateien bekommt der KoSIT-Validator in der CI zu sehen. Erst
 * beides zusammen trägt: Der Vergleich merkt, dass sich etwas geändert
 * hat, der Validator sagt, ob das Neue gültig ist.
 *
 * Neu schreiben lassen sie sich mit
 * `pnpm --filter @privatura/einvoice golden`.
 */
describe('Golden-Dateien', () => {
  for (const [name, xml] of Object.entries(GOLDEN_CASES)) {
    it(`${name} ist unverändert`, () => {
      const file = path.join(here, 'golden', `${name}.xml`);
      expect(fs.existsSync(file), `${file} fehlt — bitte die Golden-Dateien schreiben`).toBe(true);
      expect(xml).toBe(fs.readFileSync(file, 'utf8'));
    });
  }
});
