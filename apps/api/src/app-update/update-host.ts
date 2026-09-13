/**
 * Wer nach Updates sieht — und warum nicht die Oberfläche (D41, D43).
 *
 * Die Prüfung gehört in den Hauptprozess. Er ist der einzige Teil der
 * Anwendung, der überhaupt nach außen sprechen darf: Das Fenster hat einen
 * Filter, der jede Anfrage außerhalb der Rückschleife abweist (D36), und
 * dieser Filter soll für eine Versionsanzeige nicht gelockert werden.
 *
 * Die Oberfläche bekommt deshalb nur den Zustand, über dieselbe schmale
 * Brücke, die schon den PDF-Renderer, die Mail-Übergabe und das
 * Erscheinungsbild trägt. Sie sieht nie die Adresse des Feeds in einem
 * `fetch` und lädt nie fremde Inhalte in ihr Fenster.
 *
 * Ohne Gastgeber — der Browserbetrieb bei `pnpm dev` — gibt es das alles
 * nicht, und der Endpunkt sagt genau das. Eine Weboberfläche im Browser
 * aktualisiert sich, indem man sie neu lädt.
 */
import type { UpdateStatus } from '@agentur-tool/shared';

export interface UpdateHost {
  /** Der zuletzt bekannte Zustand; fragt nichts nach draußen. */
  status(): UpdateStatus;

  /**
   * Fragt den Feed, ohne auf den 24-Stunden-Abstand zu warten.
   *
   * Das ist der Weg des Knopfes „Jetzt nach Updates suchen". Ein Fehler
   * landet im Zustand und nicht in einer Ausnahme: Eine gescheiterte
   * Prüfung ist eine Information für die Oberfläche, kein Serverfehler.
   */
  check(): Promise<UpdateStatus>;

  /** Schaltet die selbsttätige Prüfung ein oder aus. */
  setAutomatic(automatic: boolean): UpdateStatus;

  /**
   * Lädt das Paket — und kehrt zurück, sobald der Download läuft.
   *
   * Nicht erst, wenn er fertig ist: Hundert Megabyte dauern, und eine
   * Anfrage, die so lange offen bleibt, ist eine Anfrage, die abbricht.
   * Die Oberfläche fragt danach den Zustand ab und zeigt den Fortschritt.
   */
  download(): Promise<UpdateStatus>;

  /** Bricht einen laufenden Download ab. */
  cancelDownload(): UpdateStatus;

  /**
   * Backup, Installation, Neustart — in dieser Reihenfolge (D41).
   *
   * Auf dem Erfolgsweg beendet sich die Anwendung. Die Antwort erreicht
   * die Oberfläche dann vielleicht nicht mehr, und das ist in Ordnung:
   * Gleich darauf kommt die neue Fassung hoch und lädt sie neu.
   */
  install(): Promise<UpdateStatus>;

  /** Zeigt das geladene Paket im Dateimanager. */
  revealDownload(): boolean;

  /**
   * Öffnet das Paket im Browser des Rechners.
   *
   * Der zweite Weg, und er bleibt: Wer der Anwendung den Austausch nicht
   * anvertrauen will, lädt im Browser und installiert wie beim ersten Mal.
   * Für ein System ohne eigenes Paket ist es der einzige Weg — dort führt
   * er zu den Versionshinweisen. `false` heißt „es gibt gerade nichts".
   */
  openDownload(): Promise<boolean>;
}

export const UPDATE_HOST = Symbol('UPDATE_HOST');
