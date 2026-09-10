/**
 * `pnpm --filter @agentur-tool/desktop paket` — die Anwendung verpacken.
 *
 * Gepackt wird nicht dieses Verzeichnis, sondern ein eigens gebautes unter
 * `paket/`. Der Grund ist die Auflösung von Modulen: Der Hauptprozess
 * schreibt `import … from '@agentur-tool/api/dist/main'` und
 * `from '@prisma/client'`, und Node sucht dafür in `node_modules` neben
 * der Datei. Im Repository ist das ein Symlink in den virtuellen Store von
 * pnpm — und darüber liegt das node_modules des Repositories, das den Rest
 * beisteuert. Beides gibt es in der ausgelieferten Anwendung nicht.
 *
 * `pnpm deploy` baut deshalb einen Baum, wie ihn Node erwartet:
 *
 *   paket/
 *     package.json                      dieses Paket, mit dependencies
 *     dist/                             der Hauptprozess
 *     web/                              das gebaute Frontend
 *     node_modules/                     flach: api, @prisma/client, prisma, …
 *
 * Voraussetzung ist ein `pnpm build` im Repository — hier wird kopiert,
 * nicht gebaut.
 *
 * Mit `--nur-baum` endet der Lauf nach dem Aufbau von `paket/`, ohne
 * electron-builder zu rufen. Das ist der Teil, der auf jedem System gleich
 * abläuft — und damit der, den `rauchprobe.mjs` überall prüfen kann.
 */
import { execFileSync } from 'node:child_process';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const desktopDir = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const repoRoot = path.resolve(desktopDir, '../..');
const paketDir = path.join(desktopDir, 'paket');

function run(command, args, cwd, env = {}) {
  process.stdout.write(`▸ ${command} ${args.join(' ')}\n`);
  execFileSync(command, args, { cwd, stdio: 'inherit', env: { ...process.env, ...env } });
}

// Ein alter Abzug wäre schlimmer als keiner: Er brächte die Dateien des
// vorigen Laufs mit ins Paket.
fs.rmSync(paketDir, { recursive: true, force: true });

// Der Abzug dieses Pakets samt allem, was der Hauptprozess zur Laufzeit
// lädt — die API als Arbeitsbereichspaket eingeschlossen, weil `.npmrc`
// `inject-workspace-packages` setzt.
//
// `--node-linker=hoisted` ist keine Feinheit: Ohne den Schalter legt pnpm
// auch im Abzug wieder einen virtuellen Store an und verweist mit Symlinks
// hinein — gemessen 401 Stück. electron-builder folgt ihnen nicht, und im
// Paket zeigte jeder davon ins Leere.
run(
  'pnpm',
  ['deploy', '--filter', '@agentur-tool/desktop', '--prod', '--node-linker=hoisted', paketDir],
  repoRoot,
);

// Den Prisma-Client im Abzug erzeugen.
//
// Pflicht, nicht Vorsorge: `pnpm deploy` kopiert die Pakete unberührt aus
// dem Store, und `@prisma/client` ist dort eine Hülle, deren `default.js`
// nur `require('.prisma/client/default')` enthält. Der erzeugte Client
// liegt im Repository daneben und kommt nicht mit — die gepackte Anwendung
// stürzte beim ersten `new PrismaClient()` ab, also vor dem ersten
// Fenster. `generate` legt ihn hier neu an, samt der Query-Engines aller
// Ziele aus `binaryTargets`.
run(
  process.execPath,
  [
    path.join(paketDir, 'node_modules/prisma/build/index.js'),
    'generate',
    '--schema',
    path.join(paketDir, 'node_modules/@agentur-tool/api/prisma/schema.prisma'),
  ],
  paketDir,
  // Prisma fragt sonst beim ersten Lauf nach anonymen Statistiken.
  { CHECKPOINT_DISABLE: '1' },
);

// Den erzeugten Client dorthin legen, wo er das Packen überlebt.
//
// `generate` schreibt ihn nach `node_modules/.prisma/client`, und genau
// dieses Verzeichnis lässt electron-builder weg — gemessen, mit jedem
// denkbaren `files`-Muster: Was in `node_modules` landet, bestimmt allein
// der Abhängigkeitsbaum, und ein Verzeichnis mit führendem Punkt steht in
// keinem. Die gepackte Anwendung brach beim Start mit
// „Cannot find module '.prisma/client/default'" ab.
//
// `@prisma/client` dagegen ist eine erklärte Abhängigkeit und kommt
// vollständig mit. Der erzeugte Client ist ortsunabhängig — sein einziger
// Verweis nach draußen ist `@prisma/client/runtime/library.js`, und die
// liegt danach neben ihm. Also zieht er dorthin um, und die Hülle, die
// bisher nur auf `.prisma` zeigte, wird dabei überschrieben.
const generated = path.join(paketDir, 'node_modules/.prisma/client');
fs.cpSync(generated, path.join(paketDir, 'node_modules/@prisma/client'), {
  recursive: true,
  force: true,
});
fs.rmSync(path.join(paketDir, 'node_modules/.prisma'), { recursive: true, force: true });

// Die doppelten Query-Engines neben der CLI wegräumen.
//
// `generate` legt sie dort ein zweites Mal ab, obwohl die CLI im Betrieb
// nur `migrate deploy` ausführt und dafür die Schema-Engine aus
// `@prisma/engines` startet. Gemessen sind das 78 MB, die in jedem Paket
// mitgeliefert würden, ohne je gelesen zu werden.
const cliDir = path.join(paketDir, 'node_modules/prisma');
for (const entry of fs.readdirSync(cliDir)) {
  if (/query_engine.*\.node$/.test(entry)) {
    fs.rmSync(path.join(cliDir, entry));
  }
}

// Und die Query-Engines der fremden Betriebssysteme.
//
// `binaryTargets` im Schema listet alle drei Ziele, damit `generate` auch
// auf einem Rechner durchläuft, der für ein anderes packt. Gepackt wird
// aber immer für das System, auf dem gerade gebaut wird — die übrigen
// Engines wären totes Gewicht von rund 25 MB je Stück. Auf einem Mac
// bleiben beide Architekturen liegen: Von dort entstehen arm64 und x64
// aus demselben Baum.
const engineKeep = { darwin: /darwin/, win32: /windows/, linux: /(debian|linux|rhel|musl)/ }[
  process.platform
];
const clientDir = path.join(paketDir, 'node_modules/@prisma/client');
for (const entry of fs.readdirSync(clientDir)) {
  if (/query_engine.*\.node$/.test(entry) && engineKeep !== undefined && !engineKeep.test(entry)) {
    fs.rmSync(path.join(clientDir, entry));
  }
}

// Das Frontend, bewusst neben und nicht in `node_modules`: electron-builder
// stellt den Inhalt von `node_modules` allein aus den `dependencies`
// zusammen und ignoriert dort jedes `files`-Muster. Alles andere im
// Paketverzeichnis nimmt es, wie es aufgezählt wird.
fs.cpSync(path.join(repoRoot, 'apps/web/dist'), path.join(paketDir, 'web'), { recursive: true });

// Die Sperrdatei des Abzugs gehört nicht ins Paket.
fs.rmSync(path.join(paketDir, 'pnpm-lock.yaml'), { force: true });

if (process.argv.includes('--nur-baum')) {
  process.stdout.write(`▸ Baum steht unter ${paketDir} — electron-builder übersprungen.\n`);
} else {
  run('pnpm', ['exec', 'electron-builder', '--config', 'electron-builder.yml'], desktopDir);
}
