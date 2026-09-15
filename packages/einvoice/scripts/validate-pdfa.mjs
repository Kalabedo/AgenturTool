/**
 * Prüft ZUGFeRD-PDFs mit veraPDF, dem Referenzprüfer für PDF/A.
 *
 *   node packages/einvoice/scripts/validate-pdfa.mjs <datei.pdf> [...]
 *
 * ## Warum ein fremdes Werkzeug
 *
 * Dieselbe Begründung wie beim KoSIT-Validator nebenan (`validate.mjs`):
 * Die eigenen Tests prüfen, ob herauskommt, was wir uns gedacht haben. Ob
 * das Gedachte der Norm genügt, kann nur sagen, wer die Regeln gemacht hat.
 *
 * Bei PDF/A wiegt das schwerer als beim XML. Das PDF kommt aus Chromium,
 * und Chromium hat kein Interesse an Archivformaten — was dort an
 * Schriften, Farbräumen und Objektstrukturen entsteht, ist für den
 * Bildschirm gemacht. Ob es die Norm erfüllt, ist eine Beobachtung, keine
 * Zusage.
 *
 * veraPDF ist die Umsetzung, an der sich die PDF Association selbst misst.
 *
 * ## Java nur hier
 *
 * Wie beim KoSIT-Validator: ein Java-Programm, das auf dem Bauserver und
 * beim Entwickeln läuft und nie ausgeliefert wird. Die Verpackung
 * (Abschnitt 16a) bleibt unberührt.
 *
 * ## Feste Fassung
 *
 * Gepinnt, aus demselben Grund wie dort: Ohne Pin würde der Bau eines Tages
 * rot, ohne dass jemand etwas geändert hätte.
 */
import { execFileSync, spawnSync } from 'node:child_process';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';

// Fest gepinnt, aus demselben Grund wie beim KoSIT-Validator: Unter
// `releases/verapdf-installer.zip` liegt immer die neueste Fassung, und mit
// ihr würde der Bau eines Tages rot, ohne dass jemand etwas geändert hätte.
// Ein Wechsel ist eine bewusste Handlung: Version hier hochsetzen,
// Prüflauf ansehen.
const VERAPDF_VERSION = '1.26.2';
const VERAPDF_SERIES = VERAPDF_VERSION.split('.').slice(0, 2).join('.');
const INSTALLER_URL =
  `https://software.verapdf.org/releases/${VERAPDF_SERIES}` +
  `/verapdf-greenfield-${VERAPDF_VERSION}-installer.zip`;

/** Das Profil, gegen das geprüft wird: PDF/A-3, Konformitätsstufe B. */
const FLAVOUR = '3b';

// Unterhalb des Systemtemp und nicht im Projekt: fremder Code, der weder
// ins Repository noch in ein Paket gehört.
const cacheDir = path.join(os.tmpdir(), `privatura-verapdf-${VERAPDF_VERSION}`);
const installDir = path.join(cacheDir, 'verapdf');

const files = process.argv.slice(2);

if (files.length === 0) {
  console.error(
    'Keine Dateien angegeben.\n' +
      'Aufruf: node packages/einvoice/scripts/validate-pdfa.mjs <datei.pdf> [...]\n\n' +
      'ZUGFeRD-PDFs zum Prüfen entstehen im Test, der sie ohnehin erzeugt:\n' +
      '  ZUGFERD_MUSTER_DIR=/tmp/muster pnpm vitest run apps/api/test/zugferd.test.ts',
  );
  process.exit(1);
}

const missing = files.filter((file) => !fs.existsSync(file));
if (missing.length > 0) {
  console.error(`Diese Dateien gibt es nicht:\n  ${missing.join('\n  ')}`);
  process.exit(1);
}

function ensureVeraPdf() {
  const executable = path.join(
    installDir,
    process.platform === 'win32' ? 'verapdf.bat' : 'verapdf',
  );
  if (fs.existsSync(executable)) return executable;

  fs.mkdirSync(cacheDir, { recursive: true });

  const archive = path.join(cacheDir, 'installer.zip');
  if (!fs.existsSync(archive)) {
    console.log(`Lade ${INSTALLER_URL}`);
    execFileSync('curl', ['-sSL', '--fail', '-o', archive, INSTALLER_URL], { stdio: 'inherit' });
  }

  const unpacked = path.join(cacheDir, 'installer');
  if (!fs.existsSync(unpacked)) {
    fs.mkdirSync(unpacked, { recursive: true });
    execFileSync('unzip', ['-qo', archive, '-d', unpacked], { stdio: 'inherit' });
  }

  // Der Installer ist ein IzPack-Archiv; seine Versionsnummer steht im
  // Dateinamen und wandert innerhalb einer Serie. Deshalb gesucht statt
  // geraten — ein fest geschriebener Name bräche beim nächsten Patch.
  const installerJar = findInstallerJar(unpacked);
  if (installerJar === null) {
    console.error(`Im Installer unter ${unpacked} war kein Jar zu finden.`);
    process.exit(1);
  }

  // IzPack kennt eine unbeaufsichtigte Installation, wenn man ihm die
  // Antworten als XML gibt. Ohne diese Datei öffnete sich ein Fenster —
  // auf einem Bauserver also gar nichts.
  const answers = path.join(cacheDir, 'auto-install.xml');
  fs.writeFileSync(answers, autoInstallXml(installDir), 'utf8');

  console.log('Installiere veraPDF …');
  execFileSync('java', ['-jar', installerJar, answers], { stdio: 'inherit' });

  return executable;
}

function findInstallerJar(dir) {
  for (const entry of fs.readdirSync(dir, { withFileTypes: true })) {
    const full = path.join(dir, entry.name);
    if (entry.isDirectory()) {
      const found = findInstallerJar(full);
      if (found !== null) return found;
    } else if (entry.name.endsWith('.jar') && entry.name.includes('installer')) {
      return full;
    }
  }
  return null;
}

function autoInstallXml(target) {
  return `<?xml version="1.0" encoding="UTF-8" standalone="no"?>
<AutomatedInstallation langpack="eng">
  <com.izforge.izpack.panels.htmlhello.HTMLHelloPanel id="welcome"/>
  <com.izforge.izpack.panels.target.TargetPanel id="install_dir">
    <installpath>${target}</installpath>
  </com.izforge.izpack.panels.target.TargetPanel>
  <com.izforge.izpack.panels.packs.PacksPanel id="sdk_pack_select">
    <pack index="0" name="veraPDF GUI" selected="true"/>
    <pack index="1" name="veraPDF Batch files" selected="true"/>
    <pack index="2" name="veraPDF Validation model" selected="false"/>
    <pack index="3" name="veraPDF Documentation" selected="false"/>
    <pack index="4" name="veraPDF Sample Plugins" selected="false"/>
  </com.izforge.izpack.panels.packs.PacksPanel>
  <com.izforge.izpack.panels.install.InstallPanel id="install"/>
  <com.izforge.izpack.panels.finish.SimpleFinishPanel id="finish"/>
</AutomatedInstallation>
`;
}

const verapdf = ensureVeraPdf();

const result = spawnSync(verapdf, ['--flavour', FLAVOUR, '--format', 'text', ...files], {
  encoding: 'utf8',
});

process.stdout.write(result.stdout ?? '');
if ((result.stderr ?? '') !== '') process.stderr.write(result.stderr);

// veraPDF meldet einen ungültigen Befund über den Rückgabewert 1; alles
// darüber ist ein Fehler des Werkzeugs selbst.
if (result.status !== 0) {
  console.error(
    `\nveraPDF hat ${files.length === 1 ? 'die Datei' : 'mindestens eine Datei'} ` +
      `nicht als PDF/A-${FLAVOUR.toUpperCase()} anerkannt.`,
  );
  process.exit(result.status ?? 1);
}

console.log(`\n${files.length} Datei(en) geprüft — alle sind PDF/A-3B.`);
