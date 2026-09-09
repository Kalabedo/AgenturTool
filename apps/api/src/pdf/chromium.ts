import fs from 'node:fs';
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
 * Reihenfolge: erst `PUPPETEER_EXECUTABLE_PATH` (so wird es im Container
 * gesetzt), dann die üblichen Orte einer lokalen Installation. Gibt es
 * keinen, ist das ein Konfigurationsfehler und keine Ausnahme im laufenden
 * Betrieb — die Meldung sagt deshalb, was zu tun ist.
 */

const CANDIDATE_PATHS = [
  '/usr/bin/chromium',
  '/usr/bin/chromium-browser',
  '/usr/bin/google-chrome',
  '/usr/bin/google-chrome-stable',
  '/snap/bin/chromium',
  '/opt/homebrew/bin/chromium',
  '/Applications/Google Chrome.app/Contents/MacOS/Google Chrome',
  '/Applications/Chromium.app/Contents/MacOS/Chromium',
];

export function findChromiumExecutable(configured?: string | null): string | null {
  if (configured !== undefined && configured !== null && configured !== '') {
    return fs.existsSync(configured) ? configured : null;
  }
  return CANDIDATE_PATHS.find((candidate) => fs.existsSync(candidate)) ?? null;
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
    this.disableSandbox = config.get<string>('PUPPETEER_NO_SANDBOX') === 'true';
    this.timeoutMs = Number(config.get<string>('PDF_TIMEOUT_MS') ?? 30_000);
  }
}
