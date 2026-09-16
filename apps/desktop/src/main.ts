/**
 * Die Anwendung als Anwendung.
 *
 * Der Hauptprozess zieht den NestJS-Server in seinem eigenen Prozess hoch
 * und zeigt ein Fenster darauf. Der Server bleibt ein HTTP-Server und wird
 * nicht durch `file://` ersetzt: Das Frontend spricht ausschließlich
 * relative Pfade (`fetch('/api' + …)`), das Vite-Build erzeugt absolute
 * `/assets/…`-Pfade, und der Router ist ein `createBrowserRouter`. Über
 * HTTP funktioniert das unverändert; über `file://` bräuchte jedes dieser
 * drei Dinge eine Sonderbehandlung.
 *
 * Der Port ist 0 — das Betriebssystem sucht einen freien. Damit gibt es
 * keinen festen Port, um den sich eine zweite Instanz oder ein anderes
 * Programm streiten könnte.
 */
import path from 'node:path';
import { BrowserWindow, app, dialog, nativeTheme, session, shell } from 'electron';
import type { INestApplication } from '@nestjs/common';
import { bootstrap } from '@privatura/api/dist/main';
import type { BackupReason, BackupSummary } from '@privatura/shared';
import { BackupSchedule, backupDirectory } from './backup-schedule';
import { forcedDailyBackup, pdfTimeoutMs, updateFeedConfig } from './config';
import { prepareDatabase } from './database';
import { buildMenu } from './menu';
import { ElectronMailHandoff, SafeStorageSecretStore } from './mail';
import { blockOutboundRequests } from './network';
import { resolvePaths } from './paths';
import { ElectronPdfRenderer } from './pdf-renderer';
import {
  canInstall,
  cleanupUpdateLeftovers,
  installMacUpdate,
  startWindowsInstaller,
} from './update/install';
import { UpdateService } from './update/update-service';
import { MicrosoftStoreUpdates } from './update/microsoft-store';
import { readWindowState, saveWindowState } from './window-state';

// Vor allem anderen: Der Name bestimmt, wo `userData` liegt — auf einem
// Mac `~/Library/Application Support/Privatura`. Ohne ihn nähme Electron
// den Paketnamen aus der package.json, und der Datenordner hieße nach einem
// npm-Namensraum.
app.setName('Privatura');

// Die Anwendung ist selbst gehostet und hat keinen Grund, beim Start
// irgendwo anzuklopfen; Chromium täte das von sich aus. Die beiden
// Schalter nehmen den größten Teil davon weg, den Rest der Filter in
// `network.ts` — er hängt an der Session und wird unten gesetzt, sobald
// `app` bereit ist.
app.commandLine.appendSwitch('disable-background-networking');
app.commandLine.appendSwitch('disable-component-update');

let api: INestApplication | null = null;
let updates: UpdateService | MicrosoftStoreUpdates | null = null;
let backups: BackupSchedule | null = null;
let window: BrowserWindow | null = null;
let apiUrl = '';
let stateDir = '';

// Eine Instanz, eine Datenbank. Ein zweiter Start holt das bestehende
// Fenster nach vorn, statt eine zweite Anwendung auf dieselbe SQLite-Datei
// zu setzen.
if (!app.requestSingleInstanceLock()) {
  app.quit();
} else {
  app.on('second-instance', () => {
    if (window === null) return;
    if (window.isMinimized()) window.restore();
    window.focus();
  });

  void app.whenReady().then(start);
}

// Der Renderer zerstört sein Fenster nach jedem PDF. Ohne diesen Griff
// beendete sich die Anwendung beim ersten Druck, weil dann kurzzeitig kein
// Fenster offen ist.
app.on('window-all-closed', () => {
  if (process.platform !== 'darwin') {
    app.quit();
  }
});

app.on('activate', () => {
  if (window === null && api !== null) {
    openWindow(apiUrl);
  }
});

// Die Nest-Shutdown-Hooks schließen unter anderem offene Prisma-
// Verbindungen. `app.close()` muss deshalb laufen, bevor der Prozess geht.
let quitting = false;
app.on('before-quit', (event) => {
  if (quitting || api === null) return;

  event.preventDefault();
  quitting = true;
  if (updates instanceof UpdateService) updates.stop();
  // Vor `api.close()`: Die Sicherung braucht den laufenden Server, und ein
  // Zeitgeber, der danach noch feuert, fände ihn nicht mehr.
  backups?.stop();
  void api.close().finally(() => {
    app.quit();
  });
});

/**
 * Die Adresse des Vite-Dev-Servers, wenn wir im Entwicklungsbetrieb sind.
 *
 * Gesetzt von `pnpm dev:desktop`. Ist sie leer, liefert der eingebaute
 * Server das gebaute Frontend selbst aus — der Normalfall.
 */
const devUrl = process.env.PRIVATURA_DEV_URL;

/**
 * Das Protokoll.
 *
 * Auf der Standardausgabe und auf Modulebene, weil außer dem Start auch die
 * Installation eines Updates hineinschreibt. Die Rauchprobe liest mit: Sie
 * entscheidet anhand dieser Zeilen, ob eine Anfrage nach außen gehen wollte
 * (`scripts/rauchprobe.mjs`).
 */
function log(message: string): void {
  process.stdout.write(`${message}\n`);
}

async function start(): Promise<void> {
  const paths = resolvePaths();
  stateDir = paths.stateDir;

  // Nichts verlässt diesen Rechner. Vor dem ersten Fenster, damit auch
  // dessen erste Anfrage schon durch den Filter geht.
  blockOutboundRequests(session.defaultSession, (url) => {
    log(`Anfrage nach außen abgewiesen: ${url}`);
  });

  app.setAboutPanelOptions({
    applicationName: 'Privatura',
    applicationVersion: app.getVersion(),
    copyright: '© Tom Wenczel',
  });

  try {
    await prepareDatabase({
      databaseFile: paths.databaseFile,
      dataDir: paths.dataDir,
      prismaDir: paths.prismaDir,
      prismaCli: paths.prismaCli,
      prismaEnginesDir: paths.prismaEnginesDir,
      log,
    });

    // Die Konfiguration steht in der Umgebung, nicht in einer .env: In
    // einer gepackten Anwendung gibt es keine Datei, die man bearbeiten
    // könnte, und der Hauptprozess kennt die Pfade ohnehin am besten.
    process.env.DATA_DIR = paths.dataDir;
    process.env.DATABASE_URL = `file:${paths.databaseFile}`;
    process.env.WEB_ROOT = paths.webRoot;
    process.env.HOST = '127.0.0.1';
    // Im Betrieb sucht sich das Betriebssystem einen freien Port. Im
    // Entwicklungsbetrieb muss es 3000 sein: Dorthin leitet der Vite-Proxy
    // seine `/api`-Anfragen (apps/web/vite.config.ts), und der kennt keinen
    // Port, der sich bei jedem Start ändert.
    process.env.PORT = devUrl === undefined ? '0' : '3000';
    // Ein Anmeldeformular ergäbe hier keinen Sinn: Der Server hört nur auf
    // die Rückschleife, und wer am Rechner sitzt, ist angemeldet.
    process.env.AUTH_ENABLED ??= 'false';

    // Reste der vorigen Installation: das alte Bundle, aus dem dieser
    // Prozess gerade nicht mehr läuft (`update/install.ts`).
    cleanupUpdateLeftovers(app.getPath('exe'), log);

    // Die einzige Adresse, mit der diese Anwendung von sich aus spricht
    // (D41, D43). Der Dienst wird vor dem Server gebaut, weil der Server ihn
    // als Gastgeberdienst bekommt — und weil ein Fehler in der Konfiguration
    // beim Start auffallen soll und nicht beim ersten Klick.
    updates = process.windowsStore
      ? new MicrosoftStoreUpdates(app.getVersion())
      : new UpdateService({
          currentVersion: app.getVersion(),
          stateDir: paths.stateDir,
          updatesDir: paths.updatesDir,
          feed: updateFeedConfig(),
          platform: process.platform,
          arch: process.arch,
          log,
          openExternal: (url) => shell.openExternal(url),
          revealPackage: (filePath) => {
            shell.showItemInFolder(filePath);
          },
          // Unmittelbar vor der Installation und ohne Dialog: Wer gerade „Neu
          // starten und installieren" geklickt hat, wartet auf das Update und
          // nicht auf eine zweite Rückfrage.
          createBackup: async () => {
            await createBackupArchive('update');
          },
          installPackage: installUpdate,
        });

    const running = await bootstrap({
      pdfRenderer: new ElectronPdfRenderer(pdfTimeoutMs(), (url) => {
        log(`Anfrage aus dem Dokument abgewiesen: ${url}`);
      }),
      // Der E-Mail-Versand ist der einzige Anlass, zu dem diese Anwendung
      // von sich aus nach außen spricht — und auch nur, wenn jemand ihn
      // eingerichtet und ausgelöst hat (D43, D45).
      mailHandoff: new ElectronMailHandoff(log),
      secretStore: SafeStorageSecretStore.create(log),
      updateHost: updates,
      themeHost: {
        setPreference: (preference) => {
          /*
           * Gemerkt wird nur „hell" oder „dunkel"; „system" heißt gerade,
           * nichts zu merken, sondern beim nächsten Start das
           * Betriebssystem zu fragen.
           */
          currentTheme = preference === 'system' ? undefined : preference;
          // Damit auch Menüs und native Dialoge mitgehen.
          nativeTheme.themeSource = preference;
        },
      },
    });

    api = running.app;
    apiUrl = running.url;

    // Die Adresse in einer erkennbaren Zeile: Der Port wird bei jedem
    // Start neu vergeben, und die Rauchprobe (scripts/rauchprobe.mjs)
    // muss wissen, wohin sie ihre Anfragen schickt.
    log(`PRIVATURA_URL ${apiUrl}`);

    buildMenu({
      dataDir: paths.dataDir,
      onBackup: createBackup,
      onCheckForUpdates: checkForUpdates,
    });

    // Erst nachdem das Fenster steht: Der Start gehört der Anwendung, nicht
    // der Updateprüfung. Danach genügt ein Blick in 24 Stunden (D41).
    if (updates instanceof UpdateService) updates.start();

    // Die Tagessicherung (D55). Sie hängt am Start, weil diese Anwendung
    // nicht durchläuft — ein nächtlicher Zeitplan liefe auf einem Rechner,
    // der nachts aus ist, nie. Der Zeitgeber merkt sich nichts: Wann zuletzt
    // gesichert wurde, steht im Ordner.
    backups = new BackupSchedule({
      directory: backupDirectory(paths.dataDir),
      databaseFile: paths.databaseFile,
      createBackup: () => createBackupArchive('taeglich'),
      log,
      force: forcedDailyBackup(),
    });
    backups.start();

    // Im Entwicklungsbetrieb zeigt das Fenster auf den Vite-Server, damit
    // Änderungen an der Oberfläche sofort nachladen. Der Server läuft
    // trotzdem — er liefert die API und, über ihn, die PDFs.
    openWindow(devUrl ?? apiUrl);
  } catch (error) {
    dialog.showErrorBox(
      'Privatura konnte nicht starten',
      error instanceof Error ? error.message : String(error),
    );
    app.exit(1);
  }
}

/**
 * Die zuletzt gemeldete Darstellung.
 *
 * Der Hauptprozess hält sie, weil sie an zwei Stellen gebraucht wird: beim
 * Schließen zum Schreiben in die Fensterdatei und beim Öffnen zum Setzen
 * der Hintergrundfarbe.
 */
let currentTheme: 'light' | 'dark' | undefined;

function openWindow(url: string): void {
  const state = readWindowState(stateDir);
  currentTheme = state.theme;

  /*
   * Ohne diese Farbe zeigt Electron beim Start ein weißes Rechteck, bis die
   * Seite zum ersten Mal zeichnet — bei dunkler Oberfläche ein deutliches
   * Aufblitzen. Ist nichts gespeichert, entscheidet das Betriebssystem;
   * die Oberfläche kommt gleich darauf zum selben Ergebnis.
   */
  const dark = state.theme === undefined ? nativeTheme.shouldUseDarkColors : state.theme === 'dark';

  window = new BrowserWindow({
    width: state.width,
    height: state.height,
    x: state.x,
    y: state.y,
    minWidth: 900,
    minHeight: 600,
    title: 'Privatura',
    show: false,
    // Die beiden Werte sind die Grundfläche aus index.css in hex —
    // `--color-surface-sunken`, hell wie dunkel. Electron legt die Farbe
    // bei der Erzeugung des Fensters fest und nimmt keine Variable
    // entgegen; wer die Marke dort verschiebt, zieht sie hier nach.
    backgroundColor: dark ? '#101113' : '#f8fafc',
    webPreferences: {
      // Das Fenster zeigt eine gewöhnliche Webanwendung von der eigenen
      // Rückschleife. Sie braucht keinen Zugang zu Node und bekommt ihn
      // deshalb auch nicht.
      nodeIntegration: false,
      contextIsolation: true,
    },
  });

  if (state.maximized) {
    window.maximize();
  }

  window.once('ready-to-show', () => {
    window?.show();
  });

  // Beim Schließen, nicht laufend: `getNormalBounds()` steht auch dann
  // noch, und ein Schreibvorgang je Sitzung genügt.
  window.on('close', () => {
    if (window !== null) {
      saveWindowState(window, stateDir, currentTheme);
    }
  });

  window.on('closed', () => {
    window = null;
  });

  // Externe Verweise gehören in den Browser, nicht in dieses Fenster —
  // sonst wird aus der Anwendung unversehens ein Browser ohne Adresszeile.
  window.webContents.setWindowOpenHandler(({ url: target }) => {
    void shell.openExternal(target);
    return { action: 'deny' };
  });

  void window.loadURL(url);
}

/**
 * Der Menüpunkt „Nach Updates suchen …".
 *
 * Dieselbe Prüfung wie in den Einstellungen, nur mit nativer Rückmeldung:
 * Wer sie im Menü auslöst, hat die Oberfläche gerade nicht vor Augen und
 * erwartet eine Antwort dort, wo er geklickt hat. Ohne Rückmeldung bliebe
 * der Punkt wirkungslos, sobald nichts Neues da ist.
 */
async function checkForUpdates(): Promise<void> {
  if (updates === null) return;

  const status = await updates.check();

  if (status.state === 'microsoft-store') {
    await dialog.showMessageBox({
      type: 'info',
      message: 'Updates kommen über den Microsoft Store.',
      detail: 'Öffne den Microsoft Store und suche dort nach Updates für Privatura.',
    });
    return;
  }

  if (status.state === 'abgeschaltet') {
    await dialog.showMessageBox({
      type: 'info',
      message: 'Die Updateprüfung ist abgeschaltet.',
      detail: 'Diese Installation fragt den Updatefeed nicht ab.',
    });
    return;
  }

  if (status.state === 'fehler') {
    await dialog.showMessageBox({
      type: 'warning',
      message: 'Die Updateprüfung ist fehlgeschlagen.',
      detail: status.error ?? 'Unbekannter Fehler.',
    });
    return;
  }

  // Schon geladen? Dann ist die nächste Handlung die Installation.
  if (status.state === 'bereit' && status.ready !== null) {
    const install = 0;
    const answer = await dialog.showMessageBox({
      type: 'info',
      message: `Privatura ${status.ready.version} ist bereit.`,
      detail:
        'Vor der Installation wird automatisch ein Backup erstellt. Die ' +
        'Anwendung startet danach neu — ungespeicherte Änderungen in einem ' +
        'Rechnungsentwurf gehen dabei verloren.',
      buttons: ['Neu starten und installieren', 'Später'],
      defaultId: install,
      cancelId: 1,
    });

    if (answer.response === install) {
      const result = await updates.install();
      // Auch ein gescheitertes Backup gehört hierher: Der Zustand heißt
      // dann weiter „bereit", die Installation hat aber nicht
      // stattgefunden, und im Menü gibt es keine zweite Stelle, an der das
      // zu sehen wäre.
      if (result.error !== null) {
        dialog.showErrorBox('Die Installation ist fehlgeschlagen', result.error);
      }
    }
    return;
  }

  if (status.available === null) {
    await dialog.showMessageBox({
      type: 'info',
      message: `Privatura ${status.currentVersion} ist aktuell.`,
    });
    return;
  }

  const load = 0;
  const answer = await dialog.showMessageBox({
    type: 'info',
    message: `Privatura ${status.available.version} ist verfügbar.`,
    detail:
      `${status.available.notes ?? 'Neue Fassung vom ' + status.available.releasedAt}\n\n` +
      (status.available.download === null
        ? 'Für dieses System gibt es kein eigenes Paket; der Knopf öffnet die ' +
          'Versionshinweise im Browser.'
        : 'Das Paket wird geladen. Installiert wird erst nach einem weiteren ' +
          'Klick, und vorher entsteht ein Backup.'),
    buttons: ['Update laden', 'Später'],
    defaultId: load,
    cancelId: 1,
  });

  if (answer.response !== load) return;

  if (status.available.download === null) {
    await updates.openDownload();
    return;
  }

  // Der Fortschritt steht danach in der Oberfläche; hier genügt der Anstoß.
  await updates.download();
  window?.focus();
}

/**
 * Die Installation und der Neustart danach.
 *
 * Der plattformabhängige Teil des Updatewegs (Abschnitt 28 der
 * Architektur): Auf macOS tauscht die Anwendung ihr eigenes Bundle aus und
 * startet sich neu; unter Windows übernimmt das der signierte
 * NSIS-Installer, dem sie dafür das Feld räumt. Beide Wege enden damit,
 * dass an derselben Stelle die neue Fassung läuft.
 *
 * `app.relaunch()` vor `app.quit()`: Electron startet den nächsten Prozess
 * erst, wenn dieser beendet ist — auf macOS liegt am selben Pfad dann schon
 * die neue Anwendung. Unter Windows startet der Installer sie mit
 * `--force-run` selbst, und ein zweiter Start wäre einer zu viel.
 *
 * `app.quit()` und nicht `app.exit()`: Beendet wird über den
 * `before-quit`-Haken, der die Nest-Anwendung schließt und damit die
 * offenen Prisma-Verbindungen. Eine Installation, die die Datenbank mitten
 * im Schreiben unterbricht, wäre ein teuer bezahlter Neustart.
 */
async function installUpdate(ready: { filePath: string; version: string }): Promise<boolean> {
  if (process.windowsStore) return false;
  if (!canInstall(process.platform)) return false;

  const context = {
    filePath: ready.filePath,
    version: ready.version,
    exePath: app.getPath('exe'),
    log,
  };

  if (process.platform === 'darwin') {
    if (!(await installMacUpdate(context))) return false;
    app.relaunch();
  } else if (!(await startWindowsInstaller(context))) {
    return false;
  }

  app.quit();
  return true;
}

/**
 * Ein Archiv, ohne jemanden zu fragen.
 *
 * Denselben Weg nehmen vier Auslöser: der Knopf in den Einstellungen, der
 * Menüpunkt, die Tagessicherung und die Installation eines Updates. Nur der
 * Menüpunkt zeigt hinterher einen Dialog. Der Anlass geht mit, damit er
 * später am Dateinamen abzulesen ist — beim Zurückspielen will man wissen,
 * woher ein Archiv kommt.
 */
async function createBackupArchive(reason: BackupReason): Promise<BackupSummary> {
  if (api === null) {
    throw new Error('Der Server läuft nicht; es kann kein Backup entstehen.');
  }

  const { BackupService } = await import('@privatura/api/dist/backup/backup.service');
  const service = api.get(BackupService);
  const summary = await service.createBackup({ reason });
  log(`Backup erstellt: ${summary.filename}`);
  return summary;
}

/**
 * Ein Archiv von Hand.
 *
 * Denselben Weg nimmt der Knopf in den Einstellungen; hier steht er im
 * Menü, damit er auch dann erreichbar ist, wenn die Oberfläche gerade
 * nicht mitspielt.
 */
async function createBackup(): Promise<void> {
  if (api === null) return;

  const summary = await createBackupArchive('manuell');
  const paths = resolvePaths();
  const showInFolder = 1;
  const answer = await dialog.showMessageBox({
    type: 'info',
    message: 'Backup erstellt',
    detail:
      `${summary.filename}\n\n` +
      `${String(summary.counts.invoices)} Rechnungen, ` +
      `${String(summary.counts.documents)} PDFs, ` +
      `${String(summary.counts.assets)} Assets`,
    buttons: ['OK', 'Im Ordner zeigen'],
    defaultId: 0,
    cancelId: 0,
  });

  if (answer.response === showInFolder) {
    shell.showItemInFolder(path.join(paths.dataDir, 'backups', summary.filename));
  }
}
