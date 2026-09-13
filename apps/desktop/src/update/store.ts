/**
 * Was die Anwendung über Updates behält.
 *
 * Drei Dinge, und jedes hat einen Grund, die Sitzung zu überleben:
 *
 * - **die Einstellung**, weil „nicht selbsttätig prüfen" sonst bei jedem
 *   Start wieder verfiele;
 * - **der Zeitpunkt der letzten Prüfung**, weil der Abstand von 24 Stunden
 *   sonst nur innerhalb einer Sitzung gälte — wer seine Anwendung täglich
 *   schließt, fragte sonst bei jedem Start neu an;
 * - **der zuletzt gesehene Feed**, weil das Banner dann sofort steht,
 *   statt erst nach der ersten erfolgreichen Anfrage des neuen Starts.
 *
 * Die Datei liegt in `stateDir` neben `fenster.json` — Zustand der
 * Installation, nicht der Buchhaltung. Ein Backup soll Rechnungen
 * sichern und nicht den Zeitpunkt der letzten Updateprüfung.
 */
import fs from 'node:fs';
import path from 'node:path';
import { parseUpdateFeed, type UpdateFeed } from '@agentur-tool/shared';

const FILE = 'aktualisierung.json';

export interface UpdateState {
  /** Selbsttätig prüfen? Vorbelegt mit `true` (D41). */
  automatic: boolean;
  /** Zeitpunkt der letzten erfolgreichen Prüfung, ISO-8601. */
  lastCheckedAt: string | null;
  /** Der zuletzt gelesene Feed, unverändert wie er ankam. */
  lastFeed: UpdateFeed | null;
}

export const DEFAULT_UPDATE_STATE: UpdateState = {
  automatic: true,
  lastCheckedAt: null,
  lastFeed: null,
};

/**
 * Den gemerkten Zustand lesen.
 *
 * Der gespeicherte Feed geht durch dieselbe Prüfung wie ein frisch
 * geladener. Das ist kein Misstrauen gegen die eigene Datei, sondern gegen
 * die Zeit: Die erlaubten Hosts können sich mit einer neuen Fassung der
 * Anwendung ändern, und dann darf eine alte Adresse aus der Datei nicht
 * weiterhin als Downloadziel gelten.
 */
export function readUpdateState(stateDir: string, allowedHosts: readonly string[]): UpdateState {
  let stored: Partial<UpdateState>;
  try {
    stored = JSON.parse(fs.readFileSync(path.join(stateDir, FILE), 'utf8')) as Partial<UpdateState>;
  } catch {
    return { ...DEFAULT_UPDATE_STATE };
  }

  let lastFeed: UpdateFeed | null = null;
  if (stored.lastFeed != null) {
    try {
      lastFeed = parseUpdateFeed(stored.lastFeed, allowedHosts);
    } catch {
      lastFeed = null;
    }
  }

  return {
    automatic: stored.automatic !== false,
    lastCheckedAt: typeof stored.lastCheckedAt === 'string' ? stored.lastCheckedAt : null,
    lastFeed,
  };
}

/**
 * Den Zustand sichern.
 *
 * Ein Fehler bleibt hier: Eine nicht schreibbare Zustandsdatei ist kein
 * Grund, den Benutzer zu behelligen — die Anwendung fragt dann eben beim
 * nächsten Start noch einmal nach.
 */
export function saveUpdateState(stateDir: string, state: UpdateState): void {
  try {
    fs.mkdirSync(stateDir, { recursive: true });
    fs.writeFileSync(path.join(stateDir, FILE), `${JSON.stringify(state, null, 2)}\n`, 'utf8');
  } catch {
    // Siehe oben.
  }
}
