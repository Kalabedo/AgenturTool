/**
 * Prüft die Golden-Dateien mit dem offiziellen KoSIT-Validator.
 *
 *   node packages/einvoice/scripts/validate.mjs
 *
 * ## Warum ein fremdes Werkzeug
 *
 * Die eigenen Tests prüfen, ob das herauskommt, was wir uns gedacht haben.
 * Ob das Gedachte stimmt, kann nur sagen, wer die Regeln gemacht hat. Beim
 * ersten Lauf hat dieser Validator vier Dinge gefunden, die keine
 * Selbstprüfung gefunden hätte — darunter eine Kennung, mit der das
 * Dokument nicht etwa bemängelt, sondern gar nicht erst als XRechnung
 * erkannt wurde.
 *
 * ## Java nur hier
 *
 * Der Validator ist ein Java-Programm. Es läuft auf dem Bauserver und beim
 * Entwickeln — ausgeliefert wird es nie. Die Verpackung (Abschnitt 16a)
 * bleibt davon unberührt.
 *
 * ## Feste Fassungen
 *
 * Werkzeug und Konfiguration sind gepinnt. Die KoSIT veröffentlicht
 * halbjährlich; ohne Pin würde der Build eines Tages rot, ohne dass jemand
 * etwas geändert hätte. Ein Wechsel ist eine bewusste Handlung: Version
 * hier hochsetzen, Prüflauf ansehen, Golden-Dateien nachziehen.
 */
import { execFileSync, spawnSync } from 'node:child_process';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const VALIDATOR_VERSION = '1.5.0';
const CONFIGURATION_RELEASE = 'release-2024-06-20';
const CONFIGURATION_FILE = `validator-configuration-xrechnung_3.0.2_2024-06-20.zip`;

const VALIDATOR_URL = `https://github.com/itplr-kosit/validator/releases/download/v${VALIDATOR_VERSION}/validator-${VALIDATOR_VERSION}-distribution.zip`;
const CONFIGURATION_URL = `https://github.com/itplr-kosit/validator-configuration-xrechnung/releases/download/${CONFIGURATION_RELEASE}/${CONFIGURATION_FILE}`;

const here = path.dirname(fileURLToPath(import.meta.url));
const goldenDir = path.join(here, '..', 'test', 'golden');

// Unterhalb des Systemtemp und nicht im Projekt: Das sind 30 MB fremder
// Code, die weder ins Repository noch in ein Paket gehören.
const cacheDir = path.join(os.tmpdir(), `privatura-kosit-${VALIDATOR_VERSION}`);
const validatorDir = path.join(cacheDir, 'validator');
const configurationDir = path.join(cacheDir, 'configuration');

function download(url, target) {
  if (fs.existsSync(target)) return;
  fs.mkdirSync(path.dirname(target), { recursive: true });
  console.log(`Lade ${url}`);
  execFileSync('curl', ['-sSL', '--fail', '-o', target, url], { stdio: 'inherit' });
}

function unzip(archive, target) {
  if (fs.existsSync(target)) return;
  fs.mkdirSync(target, { recursive: true });
  execFileSync('unzip', ['-qo', archive, '-d', target], { stdio: 'inherit' });
}

const validatorZip = path.join(cacheDir, 'validator.zip');
const configurationZip = path.join(cacheDir, 'configuration.zip');

download(VALIDATOR_URL, validatorZip);
download(CONFIGURATION_URL, configurationZip);
unzip(validatorZip, validatorDir);
unzip(configurationZip, configurationDir);

const files = fs
  .readdirSync(goldenDir)
  .filter((name) => name.endsWith('.xml'))
  .map((name) => path.join(goldenDir, name));

if (files.length === 0) {
  console.error('Keine Golden-Dateien gefunden. Erst `pnpm --filter @privatura/einvoice golden`.');
  process.exit(1);
}

const reportDir = path.join(cacheDir, 'berichte');
fs.rmSync(reportDir, { recursive: true, force: true });
fs.mkdirSync(reportDir, { recursive: true });

const result = spawnSync(
  'java',
  [
    '-jar',
    path.join(validatorDir, `validationtool-${VALIDATOR_VERSION}-standalone.jar`),
    '-s',
    path.join(configurationDir, 'scenarios.xml'),
    '-r',
    configurationDir,
    '-o',
    reportDir,
    ...files,
  ],
  { stdio: 'inherit' },
);

if (result.status !== 0) {
  console.error(`\nDie Prüfberichte liegen unter ${reportDir}.`);
  process.exit(result.status ?? 1);
}

console.log(`\n${files.length} Datei(en) geprüft — alle gültig.`);
