/**
 * Die Installation — und der Neustart danach.
 *
 * Zwei Betriebssysteme, zwei Wege, und beide enden damit, dass an
 * derselben Stelle eine neuere Anwendung liegt und läuft:
 *
 * **Windows.** Der signierte NSIS-Installer kann das selbst. Er wird still
 * gestartet (`/S`) und mit `--force-run`, worauf electron-builders
 * Installer die Anwendung nach dem Austausch wieder öffnet. Die Anwendung
 * beendet sich unmittelbar danach — ein laufendes Programm lässt sich nicht
 * überschreiben.
 *
 * **macOS.** Ein DMG installiert nichts; es ist ein Abbild, das man
 * öffnet. Diesen Weg geht die Anwendung deshalb selbst: einhängen, die
 * Signatur des Bundles darin prüfen, es neben die eigene Installation
 * kopieren und dort in einem Zug an deren Stelle setzen. Der Austausch ist
 * ein `rename` innerhalb desselben Volumes — entweder der neue Ordner steht
 * da, oder der alte. Es gibt keinen Zwischenzustand, in dem `AgenturTool.app`
 * halb aus zwei Fassungen besteht.
 *
 * Die Signaturprüfung ist der eigentliche Schutz. Feed und Prüfsumme liegen
 * auf derselben Domain: Wer dort schreiben kann, kann beide fälschen. Was
 * er nicht kann, ist eine Anwendung mit der Developer-ID zu signieren und
 * notarisieren zu lassen. `codesign` und `spctl` prüfen genau das, und zwar
 * bevor irgendetwas an der bestehenden Installation angefasst wird.
 *
 * Fehlschlagen darf jeder Schritt. Was dann gilt: Die alte Installation
 * steht noch. Der letzte Rückweg ist immer derselbe — das Paket im
 * Dateimanager zeigen und den Benutzer installieren lassen, wie beim
 * ersten Mal.
 */
import { execFile } from 'node:child_process';
import fs from 'node:fs';
import path from 'node:path';
import { promisify } from 'node:util';

const run = promisify(execFile);

/** Ein Aufruf, wie er an `execFile` geht — Programm und Argumente getrennt. */
export interface Command {
  command: string;
  args: string[];
}

export interface InstallContext {
  /** Das geladene, gegen den Feed geprüfte Paket. */
  filePath: string;
  /** Die erwartete Fassung — muss im Bundle wiederzufinden sein. */
  version: string;
  /** `app.getPath('exe')`. */
  exePath: string;
  /** Arbeitsverzeichnis für den Austausch; auf demselben Volume wie das Ziel. */
  log: (message: string) => void;
}

/**
 * Kann diese Plattform aus der Anwendung heraus installieren?
 *
 * Linux nicht — dort gibt es auch kein Paket (docs/RELEASE.md).
 */
export function canInstall(platform: string): boolean {
  return platform === 'darwin' || platform === 'win32';
}

/**
 * Der Aufruf für Windows.
 *
 * `/S` installiert ohne Rückfragen über die bestehende Installation,
 * `--force-run` startet die Anwendung danach wieder. Beide Schalter
 * versteht der von electron-builder erzeugte NSIS-Installer; genau so ruft
 * ihn auch electron-updater auf.
 */
export function windowsInstallCommand(installer: string): Command {
  return { command: installer, args: ['/S', '--force-run'] };
}

/**
 * Das Bundle, in dem diese Anwendung läuft — oder `null`.
 *
 * `null` heißt „hier wird nicht ausgetauscht", und dafür gibt es zwei
 * ehrliche Gründe:
 *
 * - Der Pfad liegt nicht in einem `.app`-Bundle. Im Entwicklungsbetrieb
 *   läuft Electron aus `node_modules`, und das ist nichts, was ein Update
 *   ersetzen sollte.
 * - Der Pfad liegt unter `AppTranslocation`. Dann hat Gatekeeper die
 *   Anwendung in ein schreibgeschütztes Abbild gelegt, weil sie noch im
 *   Download-Ordner oder direkt im DMG steckt. Ein Austausch träfe eine
 *   Kopie, die beim nächsten Start nicht mehr existiert.
 */
export function macBundlePath(exePath: string): string | null {
  if (exePath.includes('/AppTranslocation/')) return null;

  const marker = exePath.indexOf('.app/');
  if (marker === -1) return null;
  return exePath.slice(0, marker + 4);
}

/** Die Schritte auf macOS, in der Reihenfolge, in der sie laufen. */
export function macInstallCommands(paths: {
  dmg: string;
  mountPoint: string;
  appInDmg: string;
  staged: string;
}): { attach: Command; verify: Command; assess: Command; copy: Command; detach: Command } {
  return {
    attach: {
      command: 'hdiutil',
      args: ['attach', paths.dmg, '-nobrowse', '-readonly', '-mountpoint', paths.mountPoint],
    },
    // `--deep --strict`: Nicht nur das Bundle, auch jede Bibliothek darin.
    verify: {
      command: 'codesign',
      args: ['--verify', '--deep', '--strict', paths.appInDmg],
    },
    // Gatekeepers Urteil — dazu gehört das angeheftete Notarisierungsticket.
    assess: {
      command: 'spctl',
      args: ['--assess', '--type', 'execute', paths.appInDmg],
    },
    // `ditto` und nicht `cp`: Es erhält Rechte, Zeitstempel und erweiterte
    // Attribute. Eine Signatur, die den Kopiervorgang nicht übersteht, ist
    // keine mehr.
    copy: { command: 'ditto', args: [paths.appInDmg, paths.staged] },
    detach: { command: 'hdiutil', args: ['detach', paths.mountPoint, '-quiet'] },
  };
}

/**
 * Die Fassung, die im Bundle steht.
 *
 * Gelesen wird `CFBundleShortVersionString` aus dem Info.plist — dieselbe
 * Zeichenkette, die `app.getVersion()` zur Laufzeit liefert. Sie muss zu
 * der passen, die der Feed versprochen hat: Sonst hätte jemand ein anderes
 * Paket unter dem erwarteten Namen abgelegt, und die Anwendung würde nach
 * dem Neustart wieder ein Update anbieten — oder eine ältere Fassung
 * installieren.
 */
export function bundleVersion(infoPlist: string): string | null {
  const match = /<key>CFBundleShortVersionString<\/key>\s*<string>([^<]+)<\/string>/u.exec(
    infoPlist,
  );
  return match?.[1] ?? null;
}

/**
 * Installiert auf macOS und lässt das Bundle ausgetauscht zurück.
 *
 * Gibt zurück, ob der Austausch stattgefunden hat. `false` heißt: nichts
 * angefasst, der Aufrufer nimmt den Weg über den Dateimanager.
 */
export async function installMacUpdate(context: InstallContext): Promise<boolean> {
  const bundle = macBundlePath(context.exePath);
  if (bundle === null) {
    context.log('Kein austauschbares Bundle — Installation von Hand.');
    return false;
  }

  const parent = path.dirname(bundle);
  try {
    fs.accessSync(parent, fs.constants.W_OK);
  } catch {
    context.log(`Kein Schreibrecht in ${parent} — Installation von Hand.`);
    return false;
  }

  // Alles Arbeitsmaterial liegt neben dem Ziel: Ein `rename` über
  // Volumegrenzen hinweg gibt es nicht, und genau darauf beruht der
  // Austausch unten.
  const work = fs.mkdtempSync(path.join(parent, '.agentur-tool-update-'));
  const mountPoint = path.join(work, 'abbild');
  const staged = path.join(work, path.basename(bundle));
  fs.mkdirSync(mountPoint, { recursive: true });

  const previous = path.join(work, `${path.basename(bundle)}.alt`);
  let attached = false;
  let swapped = false;

  try {
    const appInDmg = await withMountedImage(context, mountPoint, async () => {
      attached = true;
      const found = findAppBundle(mountPoint);
      if (found === null) {
        throw new Error('Im Abbild liegt keine Anwendung.');
      }

      const commands = macInstallCommands({
        dmg: context.filePath,
        mountPoint,
        appInDmg: found,
        staged,
      });

      await runOrFail(commands.verify, 'Die Signatur des Pakets ist ungültig.');
      await runOrFail(
        commands.assess,
        'Das Paket wurde von macOS nicht als vertrauenswürdig eingestuft.',
      );

      const plist = fs.readFileSync(path.join(found, 'Contents/Info.plist'), 'utf8');
      const version = bundleVersion(plist);
      if (version !== context.version) {
        throw new Error(
          `Das Paket enthält Fassung ${version ?? 'unbekannt'}, erwartet war ` +
            `${context.version}.`,
        );
      }

      await runOrFail(commands.copy, 'Das Paket konnte nicht kopiert werden.');
      return found;
    });

    context.log(`Signatur geprüft: ${appInDmg}`);

    // Der Austausch. Zwei `rename` auf demselben Volume — der zweite setzt
    // die neue Fassung an die Stelle der alten. Scheitert er, kommt die
    // alte an ihren Platz zurück.
    fs.renameSync(bundle, previous);
    try {
      fs.renameSync(staged, bundle);
    } catch (error: unknown) {
      fs.renameSync(previous, bundle);
      throw error;
    }

    swapped = true;
    context.log(`Installiert: ${bundle}`);
    return true;
  } finally {
    if (attached) {
      // Ein liegen gebliebenes Abbild blockiert den nächsten Lauf.
      await run('hdiutil', ['detach', mountPoint, '-quiet']).catch(() => undefined);
    }

    /*
     * Nach einem gelungenen Austausch bleibt das Arbeitsverzeichnis liegen,
     * und das ist Absicht: Darin liegt die alte Anwendung, aus der dieser
     * Prozess noch läuft. Sie jetzt zu löschen wäre der eine Schritt, der
     * den Neustart gefährdet — die Anwendung liest ihre Dateien bis zum
     * Ende einzeln nach (kein asar-Archiv, D35). Aufgeräumt wird beim
     * nächsten Start, wenn niemand mehr darin steht:
     * `cleanupUpdateLeftovers`.
     */
    if (!swapped) {
      fs.rmSync(work, { recursive: true, force: true });
    }
  }
}

/**
 * Räumt auf, was eine Installation liegen gelassen hat.
 *
 * Läuft beim Start: Dann ist die alte Anwendung nicht mehr in Benutzung,
 * und ihr Ordner darf weg. Ohne diesen Schritt bliebe neben jeder
 * Installation eine vollständige alte Fassung liegen — ein paar hundert
 * Megabyte, die niemandem auffallen, bis die Platte voll ist.
 */
export function cleanupUpdateLeftovers(exePath: string, log: (message: string) => void): void {
  const bundle = macBundlePath(exePath);
  if (bundle === null) return;

  const parent = path.dirname(bundle);
  let entries: string[];
  try {
    entries = fs.readdirSync(parent);
  } catch {
    return;
  }

  for (const entry of entries) {
    if (!entry.startsWith('.agentur-tool-update-')) continue;
    try {
      fs.rmSync(path.join(parent, entry), { recursive: true, force: true });
      log(`Reste der letzten Installation entfernt: ${entry}`);
    } catch {
      // Beim nächsten Start noch einmal.
    }
  }
}

/**
 * Startet den Windows-Installer und überlässt ihm das Feld.
 *
 * `detached` und ohne Verbindung zu diesem Prozess: Der Installer überlebt
 * das Beenden der Anwendung, und genau darauf kommt es an — er kann erst
 * arbeiten, wenn sie beendet ist.
 */
export async function startWindowsInstaller(context: InstallContext): Promise<boolean> {
  const { spawn } = await import('node:child_process');
  const command = windowsInstallCommand(context.filePath);

  const child = spawn(command.command, command.args, {
    detached: true,
    stdio: 'ignore',
    windowsHide: false,
  });
  child.unref();

  context.log(`Installer gestartet: ${context.filePath}`);
  return true;
}

/** Hängt das Abbild ein und führt dann etwas darin aus. */
async function withMountedImage<T>(
  context: InstallContext,
  mountPoint: string,
  body: () => Promise<T>,
): Promise<T> {
  await runOrFail(
    {
      command: 'hdiutil',
      args: ['attach', context.filePath, '-nobrowse', '-readonly', '-mountpoint', mountPoint],
    },
    'Das Abbild konnte nicht eingehängt werden.',
  );
  return body();
}

/** Das `.app` im eingehängten Abbild. */
function findAppBundle(mountPoint: string): string | null {
  const entry = fs.readdirSync(mountPoint).find((name) => name.endsWith('.app'));
  return entry === undefined ? null : path.join(mountPoint, entry);
}

/**
 * Führt einen Aufruf aus und ersetzt seine Fehlermeldung durch eine, die
 * dem Benutzer etwas sagt.
 *
 * Die ursprüngliche Meldung bleibt angehängt: Wer einen Fehlerbericht
 * schreibt, soll die Zeile von `codesign` mitschicken können.
 */
async function runOrFail(command: Command, message: string): Promise<void> {
  try {
    await run(command.command, command.args);
  } catch (error: unknown) {
    const detail = error instanceof Error ? error.message.trim().split('\n').at(-1) : String(error);
    throw new Error(`${message} (${detail ?? 'ohne Meldung'})`);
  }
}
