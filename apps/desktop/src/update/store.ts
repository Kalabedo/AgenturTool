/**
 * Was die Anwendung über Updates behält.
 *
 * Vier Dinge, und jedes hat einen Grund, die Sitzung zu überleben:
 *
 * - **die Einstellung**, weil „nicht selbsttätig prüfen" sonst bei jedem
 *   Start wieder verfiele;
 * - **der Zeitpunkt der letzten Prüfung**, weil der Abstand von 24 Stunden
 *   sonst nur innerhalb einer Sitzung gälte — wer seine Anwendung täglich
 *   schließt, fragte sonst bei jedem Start neu an;
 * - **der zuletzt gesehene Feed**, weil das Banner dann sofort steht,
 *   statt erst nach der ersten erfolgreichen Anfrage des neuen Starts;
 * - **das geladene Paket**, weil „Später" sonst hundert Megabyte kostet,
 *   die beim nächsten Start erneut über die Leitung gingen.
 *
 * Die Datei liegt in `stateDir` neben `fenster.json` — Zustand der
 * Installation, nicht der Buchhaltung. Ein Backup soll Rechnungen
 * sichern und nicht den Zeitpunkt der letzten Updateprüfung.
 */
import fs from 'node:fs';
import path from 'node:path';
import { isStableVersion, parseUpdateFeed, type UpdateFeed } from '@agentur-tool/shared';

const FILE = 'aktualisierung.json';

export interface UpdateState {
  /** Selbsttätig prüfen? Vorbelegt mit `true` (D41). */
  automatic: boolean;
  /** Zeitpunkt der letzten erfolgreichen Prüfung, ISO-8601. */
  lastCheckedAt: string | null;
  /** Der zuletzt gelesene Feed, unverändert wie er ankam. */
  lastFeed: UpdateFeed | null;
  /**
   * Das geladene, geprüfte Paket — Dateiname und Fassung.
   *
   * Auch das überlebt die Sitzung: Wer „Später" wählt und die Anwendung
   * schließt, soll das Paket beim nächsten Start nicht erneut laden
   * müssen. Gespeichert wird der Dateiname, nicht der ganze Pfad — das
   * Verzeichnis kennt die Anwendung selbst, und nach einem Umzug des
   * Benutzerordners wäre ein alter absoluter Pfad falsch.
   */
  ready: { version: string; file: string; sizeBytes: number } | null;
}

export const DEFAULT_UPDATE_STATE: UpdateState = {
  automatic: true,
  lastCheckedAt: null,
  lastFeed: null,
  ready: null,
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
    ready: readyFrom(stored.ready),
  };
}

/**
 * Das gemerkte Paket — oder `null`.
 *
 * Der Dateiname wird auf einen einzelnen Namen begrenzt: Aus der
 * Zustandsdatei kommt später ein Pfad, an dem installiert wird, und ein
 * `..` darin hätte dort nichts zu suchen.
 */
function readyFrom(raw: unknown): UpdateState['ready'] {
  if (typeof raw !== 'object' || raw === null) return null;
  const candidate = raw as Record<string, unknown>;

  const { version, file, sizeBytes } = candidate;
  if (typeof version !== 'string' || !isStableVersion(version)) return null;
  if (typeof file !== 'string' || file === '' || path.basename(file) !== file) return null;
  if (typeof sizeBytes !== 'number' || !Number.isInteger(sizeBytes) || sizeBytes <= 0) return null;

  return { version, file, sizeBytes };
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
