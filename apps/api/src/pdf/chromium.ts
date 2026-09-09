import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { Injectable } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';

/**
 * Auffinden des Browsers für die PDF-Erzeugung.
 *
 * Bewusst `puppeteer-core` statt `puppeteer`: Der Chromium-Download beim
 * `npm install` würde bei jedem Build rund 150 MB laden und im Docker-Image
 * ein zweites Chromium neben dem des Paketmanagers ablegen (Abschnitt 19).
 * Der Preis dafür ist diese Datei — der Pfad muss selbst gefunden werden.
 *
 * Gesucht wird in drei Stufen: erst `PUPPETEER_EXECUTABLE_PATH` (so wird es
 * im Container gesetzt), dann die üblichen Orte einer Installation aus der
 * Paketverwaltung, zuletzt der Zwischenspeicher, in den `pnpm
 * chromium:install` lädt. Die dritte Stufe ist der Grund, warum die
 * Entwicklungsumgebung ohne Systempaket auskommt — sie kostet nur ein
 * Verzeichnis-Listing und findet genau das, was das Skript ablegt.
 *
 * Gibt es keinen Browser, ist das ein Konfigurationsfehler und keine
 * Ausnahme im laufenden Betrieb — die Meldung sagt deshalb, was zu tun ist.
 */

/** Wohin `pnpm chromium:install` lädt, wenn nichts anderes gesetzt ist. */
export function puppeteerCacheDir(): string {
  const configured = process.env.PUPPETEER_CACHE_DIR;
  if (configured !== undefined && configured !== '') return configured;
  return path.join(os.homedir(), '.cache', 'puppeteer');
}

/**
 * Die Orte einer Installation aus der Paketverwaltung, in der Reihenfolge,
 * in der sie ausprobiert werden.
 *
 * Zuerst Chromium und Chrome, danach Edge: Edge ist derselbe Motor und
 * druckt dasselbe PDF, aber es ist der Browser, der auf einem Windows-Rechner
 * ohnehin da ist — als erste Wahl würde er ein absichtlich installiertes
 * Chromium verdecken. Andere Chromium-Abkömmlinge (Brave, Vivaldi, Opera)
 * stehen bewusst nicht hier: Die Liste soll kurz und vorhersagbar bleiben,
 * und für sie genügt ein `PUPPETEER_EXECUTABLE_PATH` in der `.env`.
 *
 * Firefox und Safari fehlen nicht aus Versehen — das PDF entsteht über
 * Chromiums Druckweg, den es dort nicht gibt.
 */
export function candidatePaths(): string[] {
  const paths = [
    '/usr/bin/chromium',
    '/usr/bin/chromium-browser',
    '/usr/bin/google-chrome',
    '/usr/bin/google-chrome-stable',
    '/usr/local/bin/chromium',
    '/snap/bin/chromium',
    '/opt/homebrew/bin/chromium',
    '/Applications/Google Chrome.app/Contents/MacOS/Google Chrome',
    '/Applications/Chromium.app/Contents/MacOS/Chromium',
    '/usr/bin/microsoft-edge',
    '/usr/bin/microsoft-edge-stable',
    '/Applications/Microsoft Edge.app/Contents/MacOS/Microsoft Edge',
  ];

  // Unter Windows stehen die Orte nicht fest, sondern in der Umgebung —
  // deshalb ist diese Liste eine Funktion und keine Konstante.
  for (const base of [
    process.env.LOCALAPPDATA,
    process.env.PROGRAMFILES,
    process.env['PROGRAMFILES(X86)'],
  ]) {
    if (base === undefined || base === '') continue;
    paths.push(path.join(base, 'Google', 'Chrome', 'Application', 'chrome.exe'));
    paths.push(path.join(base, 'Chromium', 'Application', 'chrome.exe'));
    paths.push(path.join(base, 'Microsoft', 'Edge', 'Application', 'msedge.exe'));
  }

  return paths;
}

/**
 * Der Zwischenspeicher liegt als `<Browser>/<Plattform>-<Version>/…` da.
 * Wo darin die ausführbare Datei steckt, hängt an der Plattform; alle
 * Möglichkeiten durchzuprobieren ist billiger, als die Plattform selbst zu
 * bestimmen und dabei einen Sonderfall zu übersehen.
 */
const CACHE_EXECUTABLES = [
  ['chrome-linux64', 'chrome'],
  ['chrome-linux', 'chrome'],
  ['chrome-win64', 'chrome.exe'],
  ['chrome-win32', 'chrome.exe'],
  ['chrome-win', 'chrome.exe'],
  [
    'chrome-mac-x64',
    'Google Chrome for Testing.app',
    'Contents',
    'MacOS',
    'Google Chrome for Testing',
  ],
  [
    'chrome-mac-arm64',
    'Google Chrome for Testing.app',
    'Contents',
    'MacOS',
    'Google Chrome for Testing',
  ],
  ['chrome-mac', 'Chromium.app', 'Contents', 'MacOS', 'Chromium'],
];

function subdirectories(directory: string): string[] {
  try {
    return fs
      .readdirSync(directory, { withFileTypes: true })
      .filter((entry) => entry.isDirectory())
      .map((entry) => entry.name);
  } catch {
    // Kein Zwischenspeicher ist der Normalfall, solange niemand
    // `chromium:install` aufgerufen hat — und kein Grund für einen Fehler.
    return [];
  }
}

export function findChromiumInCache(cacheDir: string): string | null {
  for (const browser of ['chrome', 'chromium']) {
    const browserDir = path.join(cacheDir, browser);

    // Neueste Version zuerst: `numeric` vergleicht 140 richtig gegen 99,
    // was eine gewöhnliche Zeichenkettensortierung nicht täte.
    const builds = subdirectories(browserDir).sort((a, b) =>
      b.localeCompare(a, 'en', { numeric: true }),
    );

    for (const build of builds) {
      for (const relative of CACHE_EXECUTABLES) {
        const candidate = path.join(browserDir, build, ...relative);
        if (fs.existsSync(candidate)) return candidate;
      }
    }
  }

  return null;
}

export function findChromiumExecutable(configured?: string | null): string | null {
  if (configured !== undefined && configured !== null && configured !== '') {
    return fs.existsSync(configured) ? configured : null;
  }
  return (
    candidatePaths().find((candidate) => fs.existsSync(candidate)) ??
    findChromiumInCache(puppeteerCacheDir())
  );
}

@Injectable()
export class ChromiumConfig {
  /** Explizit gesetzter Pfad; leer bedeutet „selbst suchen". */
  readonly configuredPath: string | null;

  /**
   * Ob Chromium ohne eigene Sandbox startet.
   *
   * Standard ist „mit Sandbox" (Abschnitt 16). `--no-sandbox` ist nur im
   * Container vertretbar, in dem der Prozess ohnehin als unprivilegierter
   * Benutzer und isoliert läuft; deshalb muss es dort ausdrücklich gesetzt
   * werden und ist nirgends die Voreinstellung.
   */
  readonly disableSandbox: boolean;

  /** Zeitlimit für einen Renderlauf. */
  readonly timeoutMs: number;

  constructor(config: ConfigService) {
    this.configuredPath = config.get<string>('PUPPETEER_EXECUTABLE_PATH') ?? null;
    const sandbox = config.get<string>('PUPPETEER_NO_SANDBOX') ?? 'false';
    if (sandbox !== 'true' && sandbox !== 'false') {
      throw new Error('PUPPETEER_NO_SANDBOX muss "true" oder "false" sein.');
    }
    this.disableSandbox = sandbox === 'true';

    const rawTimeout = config.get<string>('PDF_TIMEOUT_MS') ?? '30000';
    const parsedTimeout = Number(rawTimeout);
    if (!Number.isInteger(parsedTimeout) || parsedTimeout < 1_000 || parsedTimeout > 300_000) {
      throw new Error('PDF_TIMEOUT_MS muss eine ganze Zahl zwischen 1000 und 300000 sein.');
    }
    this.timeoutMs = parsedTimeout;
  }
}
