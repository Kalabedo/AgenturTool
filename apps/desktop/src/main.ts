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
import { BrowserWindow, app, dialog, session, shell } from 'electron';
import type { INestApplication } from '@nestjs/common';
import { bootstrap } from '@agentur-tool/api/dist/main';
import { pdfTimeoutMs } from './config';
import { prepareDatabase } from './database';
import { buildMenu } from './menu';
import { blockOutboundRequests } from './network';
import { resolvePaths } from './paths';
import { ElectronPdfRenderer } from './pdf-renderer';
import { readWindowState, saveWindowState } from './window-state';

// Vor allem anderen: Der Name bestimmt, wo `userData` liegt — auf einem
// Mac `~/Library/Application Support/AgenturTool`. Ohne ihn nähme Electron
// den Paketnamen aus der package.json, und der Datenordner hieße nach einem
// npm-Namensraum.
app.setName('AgenturTool');

// Die Anwendung ist selbst gehostet und hat keinen Grund, beim Start
// irgendwo anzuklopfen; Chromium täte das von sich aus. Die beiden
// Schalter nehmen den größten Teil davon weg, den Rest der Filter in
// `network.ts` — er hängt an der Session und wird unten gesetzt, sobald
// `app` bereit ist.
app.commandLine.appendSwitch('disable-background-networking');
app.commandLine.appendSwitch('disable-component-update');

let api: INestApplication | null = null;
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
const devUrl = process.env.AGENTUR_TOOL_DEV_URL;

async function start(): Promise<void> {
  const paths = resolvePaths();
  stateDir = paths.stateDir;
  const log = (message: string): void => {
    process.stdout.write(`${message}\n`);
  };

  // Nichts verlässt diesen Rechner. Vor dem ersten Fenster, damit auch
  // dessen erste Anfrage schon durch den Filter geht.
  blockOutboundRequests(session.defaultSession, (url) => {
    log(`Anfrage nach außen abgewiesen: ${url}`);
  });

  app.setAboutPanelOptions({
    applicationName: 'AgenturTool',
    applicationVersion: app.getVersion(),
    copyright: '© Tom Wenczel',
  });

  try {
    await prepareDatabase({
      databaseFile: paths.databaseFile,
      dataDir: paths.dataDir,
      prismaDir: paths.prismaDir,
      prismaCli: paths.prismaCli,
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

    const running = await bootstrap({
      pdfRenderer: new ElectronPdfRenderer(pdfTimeoutMs(), (url) => {
        log(`Anfrage aus dem Dokument abgewiesen: ${url}`);
      }),
    });

    api = running.app;
    apiUrl = running.url;

    // Die Adresse in einer erkennbaren Zeile: Der Port wird bei jedem
    // Start neu vergeben, und die Rauchprobe (scripts/rauchprobe.mjs)
    // muss wissen, wohin sie ihre Anfragen schickt.
    log(`AGENTUR_TOOL_URL ${apiUrl}`);

    buildMenu({ dataDir: paths.dataDir, onBackup: createBackup });

    // Im Entwicklungsbetrieb zeigt das Fenster auf den Vite-Server, damit
    // Änderungen an der Oberfläche sofort nachladen. Der Server läuft
    // trotzdem — er liefert die API und, über ihn, die PDFs.
    openWindow(devUrl ?? apiUrl);
  } catch (error) {
    dialog.showErrorBox(
      'AgenturTool konnte nicht starten',
      error instanceof Error ? error.message : String(error),
    );
    app.exit(1);
  }
}

function openWindow(url: string): void {
  const state = readWindowState(stateDir);

  window = new BrowserWindow({
    width: state.width,
    height: state.height,
    x: state.x,
    y: state.y,
    minWidth: 900,
    minHeight: 600,
    title: 'AgenturTool',
    show: false,
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
      saveWindowState(window, stateDir);
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
 * Ein Archiv von Hand.
 *
 * Denselben Weg nimmt der Knopf in den Einstellungen; hier steht er im
 * Menü, damit er auch dann erreichbar ist, wenn die Oberfläche gerade
 * nicht mitspielt.
 */
async function createBackup(): Promise<void> {
  if (api === null) return;

  const { BackupService } = await import('@agentur-tool/api/dist/backup/backup.service');
  const service = api.get(BackupService);
  const summary = await service.createBackup();

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
