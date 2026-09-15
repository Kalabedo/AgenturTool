/**
 * `node scripts/updatefeed.mjs` — die Feed-Datei für die eigene Website.
 *
 * Die Anwendung fragt beim Start eine einzige JSON-Datei (D41):
 *
 *   https://updates.privatura.de/stable/updates.json
 *
 * Darin stehen die aktuelle Version, ein Satz dazu und je Paket Adresse,
 * Größe und SHA-256. Dieses Skript erzeugt sie aus den fertigen
 * Releasedateien — von Hand geschrieben wäre sie genau die Art Datei, in
 * der sich eine Prüfsumme vertippt, ohne dass es jemand merkt.
 *
 * Aufruf in der Releasepipeline:
 *
 *   node apps/desktop/scripts/updatefeed.mjs --dir dist --version 1.4.0
 *
 * Weitere Optionen:
 *
 *   --base-url    Verzeichnis, unter dem die Pakete auf der Website liegen
 *   --notes       ein bis zwei Sätze fürs Banner
 *   --notes-url   Seite mit den vollständigen Versionshinweisen
 *   --released-at Veröffentlichungsdatum (Vorbelegung: heute)
 *   --out         Zieldatei (Vorbelegung: <dir>/updates.json)
 *
 * Die Datei kommt erst auf die Website, wenn die Pakete dort schon liegen:
 * Ein Feed, der auf einen 404 zeigt, ist schlimmer als gar keiner.
 */
import crypto from 'node:crypto';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const scriptPath = fileURLToPath(import.meta.url);

/** Wo die Pakete auf der Website liegen. */
export const DEFAULT_BASE_URL = 'https://updates.privatura.de/stable';

/** Wo die Versionshinweise stehen. `{version}` wird ersetzt. */
export const DEFAULT_NOTES_URL = 'https://privatura.de/releases/{version}';

/**
 * Welcher Dateiname zu welchem Paket gehört.
 *
 * Die Namen kommen aus `artifactName` in der electron-builder.yml:
 * `${productName}-${version}-${arch}.${ext}`.
 */
const PACKAGES = [
  { platform: 'macos-arm64', suffix: '-arm64.dmg' },
  { platform: 'macos-x64', suffix: '-x64.dmg' },
];

export function parseFeedArguments(args) {
  const options = {
    dir: null,
    version: null,
    baseUrl: DEFAULT_BASE_URL,
    notes: null,
    notesUrl: null,
    releasedAt: null,
    out: null,
  };

  const named = {
    '--dir': 'dir',
    '--version': 'version',
    '--base-url': 'baseUrl',
    '--notes': 'notes',
    '--notes-url': 'notesUrl',
    '--released-at': 'releasedAt',
    '--out': 'out',
  };

  for (let index = 0; index < args.length; index += 1) {
    const key = named[args[index]];
    if (key === undefined) {
      throw new Error(`Unbekannte Option: ${args[index]}`);
    }
    const value = args[index + 1];
    if (value === undefined || value.startsWith('--')) {
      throw new Error(`${args[index]} erwartet einen Wert.`);
    }
    options[key] = value;
    index += 1;
  }

  if (options.dir === null) throw new Error('--dir fehlt.');
  if (options.version === null) throw new Error('--version fehlt.');

  // Dieselbe Form wie in `release-preflight.mjs`: Ein Release ist stabiles
  // SemVer, und der Feed soll nichts anderes anbieten können.
  if (!/^(?:0|[1-9]\d*)\.(?:0|[1-9]\d*)\.(?:0|[1-9]\d*)$/u.test(options.version)) {
    throw new Error(`--version muss stabiles SemVer sein: ${options.version}`);
  }

  if (options.releasedAt !== null && !/^\d{4}-\d{2}-\d{2}$/u.test(options.releasedAt)) {
    throw new Error(`--released-at muss JJJJ-MM-TT sein: ${options.releasedAt}`);
  }

  if (!options.baseUrl.startsWith('https://')) {
    throw new Error(`--base-url muss HTTPS sein: ${options.baseUrl}`);
  }

  return options;
}

/**
 * Die Feed-Datei aus vorhandenen Dateien bauen.
 *
 * @param files Ergebnis von `collectPackages` — Name, Größe, Prüfsumme.
 */
export function buildFeed({ version, releasedAt, notes, notesUrl, baseUrl, files }) {
  if (files.length === 0) {
    throw new Error('Keine Releasedatei gefunden — es gäbe nichts anzubieten.');
  }

  const downloads = {};
  for (const file of files) {
    downloads[file.platform] = {
      url: `${baseUrl.replace(/\/+$/u, '')}/${file.name}`,
      sizeBytes: file.sizeBytes,
      sha256: file.sha256,
    };
  }

  return {
    formatVersion: 1,
    version,
    releasedAt: releasedAt ?? new Date().toISOString().slice(0, 10),
    notes: notes ?? null,
    notesUrl: (notesUrl ?? DEFAULT_NOTES_URL).replace('{version}', version),
    downloads,
  };
}

/**
 * Die Pakete im Verzeichnis suchen und vermessen.
 *
 * Gesucht wird nach dem Namen, den electron-builder vergibt — und nur nach
 * dem: Eine Datei aus einem früheren Lauf mit einer anderen Version soll
 * nicht versehentlich in den Feed geraten.
 */
export function collectPackages(dir, version) {
  return PACKAGES.flatMap(({ platform, suffix }) => {
    const name = `Privatura-${version}${suffix}`;
    const file = path.join(dir, name);
    if (!fs.existsSync(file)) return [];

    const content = fs.readFileSync(file);
    return [
      {
        platform,
        name,
        sizeBytes: content.byteLength,
        sha256: crypto.createHash('sha256').update(content).digest('hex'),
      },
    ];
  });
}

if (path.resolve(process.argv[1] ?? '') === scriptPath) {
  const options = parseFeedArguments(process.argv.slice(2));
  const files = collectPackages(options.dir, options.version);
  const feed = buildFeed({ ...options, files });
  const out = options.out ?? path.join(options.dir, 'updates.json');

  fs.writeFileSync(out, `${JSON.stringify(feed, null, 2)}\n`, 'utf8');

  process.stdout.write(`${out}: Privatura ${feed.version}\n`);
  for (const file of files) {
    process.stdout.write(`  ${file.platform.padEnd(12)} ${file.name}\n`);
  }
}
