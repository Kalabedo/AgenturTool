/**
 * `pnpm --filter @privatura/desktop paket` — die Anwendung verpacken.
 *
 * Gepackt wird nicht dieses Verzeichnis, sondern ein eigens gebautes unter
 * `paket/`. Der Grund ist die Auflösung von Modulen: Der Hauptprozess
 * schreibt `import … from '@privatura/api/dist/main'` und
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
 * electron-builder zu rufen. `--release` verlangt auf macOS die
 * Signatur-Zugangsdaten; auf Windows ist zusätzlich `--store` erforderlich.
 * `--store` baut das Uploadpaket mit der Partner-Center-Identität.
 */
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import crossSpawn from 'cross-spawn';
import {
  missingReleaseEnvironment,
  parsePackageArguments,
  unreadableReleaseFiles,
  storePackageArguments,
} from './paket-konfiguration.mjs';

const desktopDir = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const repoRoot = path.resolve(desktopDir, '../..');
const paketDir = path.join(desktopDir, 'paket');
const releaseDir = path.join(desktopDir, 'release');
const options = parsePackageArguments(process.argv.slice(2));
if (options.release && process.platform === 'win32' && !options.store) {
  throw new Error(
    'Windows-Releases werden ausschließlich mit --store --release für den Microsoft Store gebaut.',
  );
}
const storeArguments = options.store ? storePackageArguments(process.platform) : [];
if (options.store && process.arch !== 'x64') {
  throw new Error('Der Store-Launch unterstützt ausschließlich native Windows-x64-Builds.');
}

if (options.release && !options.store) {
  const missing = missingReleaseEnvironment(process.platform);
  if (missing.length > 0) {
    throw new Error(`Release-Zugangsdaten fehlen: ${missing.join(', ')}`);
  }

  const unreadable = unreadableReleaseFiles(process.platform);
  if (unreadable.length > 0) {
    throw new Error(`Release-Zugangsdaten zeigen auf keine Datei: ${unreadable.join(', ')}`);
  }
}

function run(command, args, cwd, env = {}) {
  process.stdout.write(`▸ ${command} ${args.join(' ')}\n`);
  const result = crossSpawn.sync(command, args, {
    cwd,
    stdio: 'inherit',
    env: { ...process.env, ...env },
  });

  if (result.error) throw result.error;
  if (result.signal) {
    throw new Error(`${command} wurde durch ${result.signal} beendet.`);
  }
  if (result.status !== 0) {
    throw new Error(`${command} endete mit Code ${String(result.status)}.`);
  }
}

// Ein alter Abzug wäre schlimmer als keiner: Er brächte die Dateien des
// vorigen Laufs mit ins Paket.
fs.rmSync(paketDir, { recursive: true, force: true });

// Auch electron-builder hinterlässt Zwischenverzeichnisse. Nach einem
// abgebrochenen DMG-Lauf können sie den nächsten Lauf beim Umbenennen oder
// Einhängen blockieren. Ein vollständiger Paketlauf beginnt deshalb leer;
// `--nur-baum` fasst vorhandene Installationspakete dagegen nicht an.
if (!options.onlyTree) {
  fs.rmSync(releaseDir, { recursive: true, force: true });
}

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
  ['deploy', '--filter', '@privatura/desktop', '--prod', '--node-linker=hoisted', paketDir],
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
    path.join(paketDir, 'node_modules/@privatura/api/prisma/schema.prisma'),
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

// Das Frontend, bewusst neben und nicht in `node_modules`: electron-builder
// stellt den Inhalt von `node_modules` allein aus den `dependencies`
// zusammen und ignoriert dort jedes `files`-Muster. Alles andere im
// Paketverzeichnis nimmt es, wie es aufgezählt wird.
fs.cpSync(path.join(repoRoot, 'apps/web/dist'), path.join(paketDir, 'web'), { recursive: true });

// Die Sperrdatei des Abzugs gehört nicht ins Paket.
fs.rmSync(path.join(paketDir, 'pnpm-lock.yaml'), { force: true });

if (options.onlyTree) {
  process.stdout.write(`▸ Baum steht unter ${paketDir} — electron-builder übersprungen.\n`);
} else {
  const builderArguments = [
    'exec',
    'electron-builder',
    '--config',
    options.store ? 'electron-builder.store.yml' : 'electron-builder.yml',
    ...storeArguments,
  ];
  if (options.release && !options.store) builderArguments.push('--config.forceCodeSigning=true');
  if (options.store) {
    run('pwsh', ['-NoProfile', '-File', 'scripts/store-assets.ps1'], desktopDir);
  }

  run('pnpm', builderArguments, desktopDir, {
    PRIVATURA_RELEASE: options.release ? '1' : '0',
    ...(options.store
      ? {
          CSC_LINK: '',
          WIN_CSC_LINK: '',
          CSC_KEY_PASSWORD: '',
          WIN_CSC_KEY_PASSWORD: '',
          CSC_IDENTITY_AUTO_DISCOVERY: 'false',
        }
      : {}),
  });
}
