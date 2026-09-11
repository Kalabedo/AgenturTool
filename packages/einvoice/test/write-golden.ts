/**
 * Schreibt die Golden-Dateien neu: `pnpm --filter @agentur-tool/einvoice golden`.
 *
 * Wer sie neu schreibt, muss den Prüflauf ansehen — eine Golden-Datei, die
 * niemand geprüft hat, bestätigt nur, dass sich nichts geändert hat, nicht
 * dass es stimmt.
 */
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { GOLDEN_CASES } from './golden-cases.js';

const here = path.dirname(fileURLToPath(import.meta.url));
const directory = path.join(here, 'golden');
fs.mkdirSync(directory, { recursive: true });

for (const [name, xml] of Object.entries(GOLDEN_CASES)) {
  const file = path.join(directory, `${name}.xml`);
  fs.writeFileSync(file, xml, 'utf8');
  console.log(`geschrieben: ${path.relative(process.cwd(), file)}`);
}
