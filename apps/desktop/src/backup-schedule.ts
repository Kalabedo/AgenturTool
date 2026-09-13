import fs from 'node:fs';
import path from 'node:path';
import { parseBackupFilename, utcDayNumber, type BackupSummary } from '@agentur-tool/shared';

/**
 * Die Tagessicherung.
 *
 * Ein nächtlicher Cron wäre die Antwort für einen Server. Diese Anwendung
 * läuft auf dem Rechner der Agentur und nicht durch: Um drei Uhr morgens ist
 * sie aus. Der Zeitpunkt muss deshalb an einem Ereignis der Anwendung
 * hängen — und der ruhigste ist der Start, wenn Fenster und Server stehen
 * und der Datenbestand noch unangetastet ist. Der stündliche Blick danach
 * ist für die Sitzung, die zwei Wochen offen bleibt.
 *
 * **Kein eigener Zustand auf der Platte.** Wann zuletzt gesichert wurde,
 * steht im Ordner: Das jüngste Archiv sagt es. Das übersteht Neustarts,
 * heilt sich selbst, wenn jemand den Ordner leert, und es gibt keine zweite
 * Wahrheit, die veralten könnte. Bricht eine Sicherung ab, sieht der nächste
 * Start weiterhin das Archiv von gestern als jüngstes und versucht es erneut.
 *
 * Ohne Electron-Import, damit sich das alles ohne Fenster prüfen lässt.
 */

/** Der Abstand zwischen zwei Blicken in den Ordner. */
export const CHECK_INTERVAL_MS = 60 * 60 * 1000;

/**
 * Die Wartezeit bis zum ersten Blick.
 *
 * Deutlich länger als die zehn Sekunden der Updateprüfung: Die holt ein paar
 * hundert Byte übers Netz, diese Aufgabe liest und schreibt den ganzen
 * Datenbestand. Wer die Anwendung öffnet, will zuerst arbeiten.
 */
export const START_DELAY_MS = 60 * 1000;

export interface BackupScheduleOptions {
  /** Wo die Archive liegen (`Daten/backups`). */
  directory: string;
  /** Die SQLite-Datei — für die Frage, ob seit dem letzten Archiv etwas geschrieben wurde. */
  databaseFile: string;
  createBackup: () => Promise<BackupSummary>;
  log: (message: string) => void;
  /**
   * Drossel und Wartezeit überspringen.
   *
   * Für die Rauchprobe: Sie startet die gepackte Anwendung, prüft ein paar
   * Sekunden lang und beendet sie wieder — eine Minute Wartezeit erlebt sie
   * nie. Ohne diesen Weg bliebe die automatische Sicherung im Paket
   * ungeprüft, also genau dort, wo die Modulauflösung anders aussieht als
   * im Repository.
   */
  force?: boolean;
  now?: () => Date;
}

export class BackupSchedule {
  private timer: NodeJS.Timeout | null = null;
  private running: Promise<void> | null = null;

  constructor(private readonly options: BackupScheduleOptions) {}

  /**
   * Startet den Zeitgeber.
   *
   * Wirft nie: Der Aufruf steht im Startpfad, dessen `catch` die Anwendung
   * beendet. Eine Sicherung darf den Start nicht verhindern.
   */
  start(delayMs = START_DELAY_MS): void {
    if (this.timer !== null) return;

    const tick = (): void => {
      try {
        if (this.due()) void this.run();
      } catch {
        // Ein Blick in den Ordner, der schiefgeht, darf den Zeitgeber nicht
        // mitnehmen — beim nächsten Mal steht der Ordner vielleicht wieder.
      }
    };

    if (this.options.force === true) {
      void this.run();
    }

    this.timer = setTimeout(() => {
      tick();
      this.timer = setInterval(tick, CHECK_INTERVAL_MS);
      this.timer.unref?.();
    }, delayMs);
    this.timer.unref?.();
  }

  stop(): void {
    if (this.timer === null) return;
    clearTimeout(this.timer);
    clearInterval(this.timer);
    this.timer = null;
  }

  /**
   * Ist heute schon gesichert worden?
   *
   * Zwei Bedingungen, und die zweite ist die freundlichere: Wer die
   * Anwendung nur öffnet, um etwas nachzusehen, und sie wieder schließt,
   * soll dafür kein Archiv des ganzen Datenbestands bekommen.
   */
  due(): boolean {
    if (this.options.force === true) return true;

    const latest = this.latestArchive();
    if (latest === null) return true;

    const now = this.now();
    if (utcDayNumber(latest) === utcDayNumber(now)) return false;

    const written = this.databaseWrittenAt();
    return written === null || written > latest;
  }

  /**
   * Sichert — und schluckt dabei jeden Fehler.
   *
   * Ein zweiter Aufruf, während der erste läuft, hängt sich an ihn an: Der
   * Zeitgeber und ein Knopf in den Einstellungen können zusammenfallen.
   */
  async run(): Promise<void> {
    if (this.running !== null) return this.running;

    this.running = (async () => {
      try {
        const summary = await this.options.createBackup();
        this.options.log(`Tagessicherung: ${summary.filename}`);
      } catch (error) {
        this.options.log(
          `Tagessicherung fehlgeschlagen: ${error instanceof Error ? error.message : String(error)}`,
        );
      } finally {
        this.running = null;
      }
    })();

    return this.running;
  }

  /**
   * Der Zeitpunkt des jüngsten Archivs — aus dem Dateinamen.
   *
   * Nicht aus der Änderungszeit: Ein synchronisierter oder zurückkopierter
   * Ordner trägt überall die Zeit des Kopiervorgangs, und die Drossel hielte
   * danach jeden Tag für erledigt.
   */
  private latestArchive(): Date | null {
    let names: string[];
    try {
      names = fs.readdirSync(this.options.directory);
    } catch {
      return null;
    }

    let latest: Date | null = null;
    for (const name of names) {
      const parsed = parseBackupFilename(name);
      if (parsed === null) continue;
      if (latest === null || parsed.createdAt > latest) latest = parsed.createdAt;
    }
    return latest;
  }

  /** Wann zuletzt in die Datenbank geschrieben wurde — das Journal zählt mit. */
  private databaseWrittenAt(): Date | null {
    let newest: number | null = null;

    for (const suffix of ['', '-wal']) {
      try {
        const stats = fs.statSync(`${this.options.databaseFile}${suffix}`);
        if (newest === null || stats.mtimeMs > newest) newest = stats.mtimeMs;
      } catch {
        // Fehlt die Datei, sagt sie nichts — nicht, dass nichts geschah.
      }
    }

    return newest === null ? null : new Date(newest);
  }

  private now(): Date {
    return this.options.now?.() ?? new Date();
  }
}

/** Der Ordner, in dem die Archive liegen. */
export function backupDirectory(dataDir: string): string {
  return path.join(dataDir, 'backups');
}
