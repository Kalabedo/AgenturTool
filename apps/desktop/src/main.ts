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
import { BrowserWindow, app, dialog, shell } from 'electron';
import type { INestApplication } from '@nestjs/common';
import { bootstrap } from '@agentur-tool/api/dist/main';
import { prepareDatabase } from './database';
import { buildMenu } from './menu';
import { resolvePaths } from './paths';
import { ElectronPdfRenderer } from './pdf-renderer';

// Vor allem anderen: Der Name bestimmt, wo `userData` liegt — auf einem
// Mac `~/Library/Application Support/AgenturTool`. Ohne ihn nähme Electron
// den Paketnamen aus der package.json, und der Datenordner hieße nach einem
// npm-Namensraum.
app.setName('AgenturTool');

// Die Anwendung ist selbst gehostet und hat keinen Grund, beim Start
// irgendwo anzuklopfen; Chromium täte das von sich aus. Die beiden
// Schalter nehmen den größten Teil davon weg — vollständig ist es nicht:
// Gemessen bleibt ein Versuch beim Start übrig. Wer ihn auch noch
// abstellen will, braucht einen webRequest-Filter auf der Standard-Session
// des Fensters, wie ihn der PDF-Renderer für seine eigene schon hat.
app.commandLine.appendSwitch('disable-background-networking');
app.commandLine.appendSwitch('disable-component-update');

let api: INestApplication | null = null;
let window: BrowserWindow | null = null;
let apiUrl = '';

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

async function start(): Promise<void> {
  const paths = resolvePaths();
  const log = (message: string): void => {
    process.stdout.write(`${message}\n`);
  };

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
    process.env.PORT = '0';
    // Ein Anmeldeformular ergäbe hier keinen Sinn: Der Server hört nur auf
    // die Rückschleife, und wer am Rechner sitzt, ist angemeldet.
    process.env.AUTH_ENABLED ??= 'false';

    const timeoutMs = Number(process.env.PDF_TIMEOUT_MS ?? 30_000);
    const running = await bootstrap({
      pdfRenderer: new ElectronPdfRenderer(timeoutMs, (url) => {
        log(`Anfrage aus dem Dokument abgewiesen: ${url}`);
      }),
    });

    api = running.app;
    apiUrl = running.url;

    buildMenu({ dataDir: paths.dataDir, onBackup: createBackup });
    openWindow(apiUrl);
  } catch (error) {
    dialog.showErrorBox(
      'AgenturTool konnte nicht starten',
      error instanceof Error ? error.message : String(error),
    );
    app.exit(1);
  }
}

function openWindow(url: string): void {
  window = new BrowserWindow({
    width: 1280,
    height: 860,
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

  window.once('ready-to-show', () => {
    window?.show();
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
