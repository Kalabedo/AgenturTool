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
   * Öffnet das Paket im Browser des Rechners.
   *
   * `false` heißt „es gibt gerade nichts zu laden". Heruntergeladen wird im
   * Browser und nicht in der Anwendung: Dort sieht der Benutzer, woher die
   * Datei kommt, und die Anwendung muss keinen halb geladenen Installer
   * verwalten.
   */
  openDownload(): Promise<boolean>;
}

export const UPDATE_HOST = Symbol('UPDATE_HOST');
