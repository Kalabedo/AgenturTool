/**
 * `pnpm --filter @agentur-tool/desktop paket` — die Anwendung verpacken.
 *
 * Gepackt wird nicht dieses Verzeichnis, sondern ein eigens gebautes unter
 * `paket/`. Der Grund ist die Auflösung von Modulen: Der Hauptprozess
 * schreibt `import … from '@agentur-tool/api/dist/main'`, und Node sucht
 * dafür in `node_modules` neben der Datei. Im Repository ist das ein
 * Symlink in den virtuellen Store von pnpm — dem electron-builder nicht
 * folgt. Also wird ein Verzeichnis gebaut, das aussieht, wie Node es
 * erwartet:
 *
 *   paket/
 *     package.json                        (main: dist/main.js)
 *     dist/                               der Hauptprozess
 *     node_modules/@agentur-tool/api/     Abzug samt Laufzeitabhängigkeiten
 *     node_modules/@agentur-tool/web/     das gebaute Frontend
 *
 * `resolvePaths()` findet die API dann über dieselbe Auflösung wie im
 * Repository, und das Frontend liegt wieder als Schwesterpaket daneben.
 *
 * Voraussetzung ist ein `pnpm build` im Repository — hier wird kopiert,
 * nicht gebaut.
 */
import { execFileSync } from 'node:child_process';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const desktopDir = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const repoRoot = path.resolve(desktopDir, '../..');
const paketDir = path.join(desktopDir, 'paket');
const modules = path.join(paketDir, 'node_modules', '@agentur-tool');

function run(command, args, cwd) {
  process.stdout.write(`▸ ${command} ${args.join(' ')}\n`);
  execFileSync(command, args, { cwd, stdio: 'inherit' });
}

// Ein alter Abzug wäre schlimmer als keiner: Er brächte die Dateien des
// vorigen Laufs mit ins Paket.
fs.rmSync(paketDir, { recursive: true, force: true });
fs.mkdirSync(modules, { recursive: true });

// Die API samt allem, was sie zur Laufzeit lädt. `--prod` lässt die
// Entwicklungsabhängigkeiten weg; `pnpm deploy` löst dabei die Symlinks
// des virtuellen Stores in echte Verzeichnisse auf.
run(
  'pnpm',
  ['deploy', '--filter', '@agentur-tool/api', '--prod', path.join(modules, 'api')],
  repoRoot,
);

// Die Migrationen und das Schema: Ohne sie käme eine frische Installation
// nicht über den ersten Start hinaus. `pnpm deploy` nimmt nur mit, was in
// `files` steht — prisma/ gehört nicht dazu.
fs.cpSync(path.join(repoRoot, 'apps/api/prisma'), path.join(modules, 'api', 'prisma'), {
  recursive: true,
});

// Das Frontend als Schwesterpaket, damit `webRoot` (../web/dist neben der
// API) im Paket auf dasselbe zeigt wie im Repository.
fs.mkdirSync(path.join(modules, 'web'), { recursive: true });
fs.cpSync(path.join(repoRoot, 'apps/web/dist'), path.join(modules, 'web', 'dist'), {
  recursive: true,
});
fs.writeFileSync(
  path.join(modules, 'web', 'package.json'),
  `${JSON.stringify({ name: '@agentur-tool/web', version: '0.1.0', private: true }, null, 2)}\n`,
  'utf8',
);

// Der Hauptprozess und sein Manifest.
fs.cpSync(path.join(desktopDir, 'dist'), path.join(paketDir, 'dist'), { recursive: true });
const manifest = JSON.parse(fs.readFileSync(path.join(desktopDir, 'package.json'), 'utf8'));
fs.writeFileSync(
  path.join(paketDir, 'package.json'),
  `${JSON.stringify(
    {
      name: manifest.name,
      productName: manifest.productName,
      version: manifest.version,
      private: true,
      main: 'dist/main.js',
    },
    null,
    2,
  )}\n`,
  'utf8',
);

run('pnpm', ['exec', 'electron-builder', '--config', 'electron-builder.yml'], desktopDir);
