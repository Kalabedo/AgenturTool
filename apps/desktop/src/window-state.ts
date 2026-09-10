/**
 * Größe und Ort des Fensters über Sitzungen hinweg.
 *
 * Wer seinen Bildschirm einmal eingerichtet hat, erwartet ihn beim
 * nächsten Start wieder so. Das ist die Art Kleinigkeit, an der sich eine
 * Anwendung von einer Webseite in einem Rahmen unterscheidet.
 *
 * Die Datei liegt in `stateDir`, nicht in `Daten/`: Das ist Zustand der
 * Installation, nicht des Betriebs. Ein Backup soll Rechnungen sichern
 * und keine Fensterkoordinaten, und ein Umzug auf einen anderen Rechner
 * soll dessen Bildschirm nicht die Maße des alten aufzwingen.
 */
import fs from 'node:fs';
import path from 'node:path';
import { screen, type BrowserWindow, type Rectangle } from 'electron';

const FILE = 'fenster.json';

export interface WindowState {
  width: number;
  height: number;
  x?: number;
  y?: number;
  maximized: boolean;
}

const DEFAULT: WindowState = { width: 1280, height: 860, maximized: false };

/**
 * Die gespeicherte Lage — oder die voreingestellte.
 *
 * Zwei Fälle führen zurück zur Voreinstellung, und beide sind keine
 * Fehler: eine unlesbare Datei (dann ist eine vernünftige Größe besser
 * als ein Absturz) und ein Rechteck, das auf keinem angeschlossenen
 * Bildschirm mehr liegt. Der zweite Fall ist der häufigere — ein Laptop,
 * der ohne seinen zweiten Monitor aufgeklappt wird. Ohne die Prüfung
 * öffnete die Anwendung außerhalb des Sichtbaren, und der Benutzer sähe
 * nur, dass nichts passiert.
 */
export function readWindowState(stateDir: string): WindowState {
  let stored: Partial<WindowState>;
  try {
    stored = JSON.parse(fs.readFileSync(path.join(stateDir, FILE), 'utf8')) as Partial<WindowState>;
  } catch {
    return DEFAULT;
  }

  const width = size(stored.width, DEFAULT.width);
  const height = size(stored.height, DEFAULT.height);
  const state: WindowState = { width, height, maximized: stored.maximized === true };

  if (
    typeof stored.x === 'number' &&
    typeof stored.y === 'number' &&
    onSomeDisplay({ x: stored.x, y: stored.y, width, height })
  ) {
    state.x = stored.x;
    state.y = stored.y;
  }

  return state;
}

/**
 * Die Lage sichern.
 *
 * `getNormalBounds()` statt `getBounds()`: Ein maximiertes oder
 * verkleinertes Fenster gäbe sonst die Maße des Bildschirms zurück, und
 * beim Wiederherstellen ließe sich das Fenster nicht mehr verkleinern.
 */
export function saveWindowState(window: BrowserWindow, stateDir: string): void {
  const bounds = window.getNormalBounds();
  const state: WindowState = { ...bounds, maximized: window.isMaximized() };

  try {
    fs.mkdirSync(stateDir, { recursive: true });
    fs.writeFileSync(path.join(stateDir, FILE), `${JSON.stringify(state, null, 2)}\n`, 'utf8');
  } catch {
    // Eine nicht schreibbare Fensterlage ist kein Grund, den Benutzer zu
    // behelligen — beim nächsten Start steht das Fenster eben in der Mitte.
  }
}

function size(value: unknown, fallback: number): number {
  return typeof value === 'number' && Number.isFinite(value) && value > 0 ? value : fallback;
}

/** Liegt das Rechteck wenigstens teilweise auf einem Bildschirm? */
function onSomeDisplay(bounds: Rectangle): boolean {
  return screen.getAllDisplays().some(({ workArea }) => {
    return (
      bounds.x < workArea.x + workArea.width &&
      bounds.x + bounds.width > workArea.x &&
      bounds.y < workArea.y + workArea.height &&
      bounds.y + bounds.height > workArea.y
    );
  });
}
