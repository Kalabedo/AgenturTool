/**
 * `pnpm dev:desktop` — die Anwendung im Entwicklungsbetrieb.
 *
 * Startet den Vite-Dev-Server und Electron zusammen. Das Fenster zeigt auf
 * Vite (Port 5173), damit Änderungen an der Oberfläche sofort nachladen;
 * der eingebaute NestJS-Server läuft trotzdem und liefert die API — und
 * über ihn die PDFs, die es im reinen Browser-Betrieb nicht gibt.
 *
 * Was hier bewusst fehlt: ein Watch-Modus für das Backend. Der
 * Hauptprozess bindet `apps/api/dist` beim Start ein; eine Änderung dort
 * wird erst nach einem Neustart wirksam. Für Arbeit am Backend ist
 * `pnpm dev` der schnellere Weg.
 */
import { spawn } from 'node:child_process';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const desktopDir = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const repoRoot = path.resolve(desktopDir, '../..');
const DEV_URL = 'http://127.0.0.1:5173';

/** Alles, was wir gestartet haben — damit nichts zurückbleibt. */
const children = [];

function start(command, args, options = {}) {
  const child = spawn(command, args, { stdio: 'inherit', shell: false, ...options });
  children.push(child);
  return child;
}

function stopAll() {
  for (const child of children) {
    if (child.exitCode === null && child.signalCode === null) {
      child.kill('SIGTERM');
    }
  }
}

process.on('SIGINT', () => {
  stopAll();
  process.exit(0);
});
process.on('SIGTERM', () => {
  stopAll();
  process.exit(0);
});

/** Wartet, bis Vite antwortet. Ohne das lädt Electron ins Leere. */
async function waitForVite(timeoutMs = 60_000) {
  const deadline = Date.now() + timeoutMs;

  while (Date.now() < deadline) {
    try {
      const response = await fetch(DEV_URL, { signal: AbortSignal.timeout(1000) });
      if (response.ok) return;
    } catch {
      // Noch nicht da — weiter warten.
    }
    await new Promise((resolve) => setTimeout(resolve, 250));
  }

  throw new Error(`Der Vite-Server war nach ${String(timeoutMs)} ms nicht unter ${DEV_URL}.`);
}

const vite = start('pnpm', ['--filter', '@agentur-tool/web', 'dev'], { cwd: repoRoot });
vite.on('exit', (code) => {
  if (code !== 0 && code !== null) {
    stopAll();
    process.exit(code);
  }
});

await waitForVite();

const electron = start('pnpm', ['exec', 'electron', 'dist/main.js'], {
  cwd: desktopDir,
  env: { ...process.env, AGENTUR_TOOL_DEV_URL: DEV_URL },
});

electron.on('exit', (code) => {
  stopAll();
  process.exit(code ?? 0);
});
