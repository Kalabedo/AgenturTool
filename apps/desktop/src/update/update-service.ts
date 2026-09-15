/**
 * Der Weg eines Updates (D41, D43, D54).
 *
 * Diese Klasse führt ihn vom Anfang bis zum Neustart, und zwar in Schritten,
 * die jeder einen Klick brauchen:
 *
 * 1. `check()` holt den Feed und vergleicht die Fassungen — selbsttätig
 *    höchstens einmal am Tag.
 * 2. `download()` lädt das Paket, prüft Größe und SHA-256 und legt es unter
 *    `Updates/` ab. Der Fortschritt steht im Zustand; die Arbeit im Fenster
 *    läuft weiter.
 * 3. `install()` erzeugt ein Backup, prüft die Signatur des Betriebssystems,
 *    tauscht die Installation aus und startet die Anwendung neu.
 *
 * Was ausdrücklich nicht passiert: laden ohne Klick, installieren ohne
 * zweiten Klick, neu starten mitten in der Arbeit. Ein Update, das sich im
 * Hintergrund einspielt, wäre bei einem Programm, in dem gerade eine
 * Rechnung offen ist, der falsche Dienst am Benutzer.
 *
 * Warum im Hauptprozess: Das Fenster weist jede Anfrage außerhalb der
 * Rückschleife ab (`network.ts`, D36), und daran soll sich nichts ändern.
 * Diese Klasse spricht mit `fetch` aus Node, an Chromiums Netzwerkstapel
 * und damit am Fenster vorbei. Was den Rechner dabei verlässt: ein GET auf
 * die Feed-Adresse, in der Kennung die eigene Version und Plattform. Keine
 * Kennung des Rechners, keine Kunden-, Rechnungs- oder Nutzungsdaten.
 *
 * Elektron kommt hier nicht vor: `openExternal`, das Backup, die
 * Installation, der Neustart, die Uhr und `fetch` werden hereingereicht.
 * Der Hauptprozess bindet sie in `main.ts` an Electron; die Tests binden
 * sie an nichts und können den ganzen Ablauf durchspielen — bis auf den
 * Austausch des Bundles selbst, der ein echtes macOS braucht.
 */
import fs from 'node:fs';
import path from 'node:path';
import {
  isNewerVersion,
  parseUpdateFeed,
  updatePlatform,
  type AvailableUpdate,
  type ReadyUpdate,
  type UpdateFeed,
  type UpdateProgress,
  type UpdateState as UpdateStateName,
  type UpdateStatus,
} from '@privatura/shared';
import type { UpdateFeedConfig } from '../config';
import { downloadPackage, pruneDownloads } from './download';
import { canInstall } from './install';
import { readUpdateState, saveUpdateState, type UpdateState } from './store';

/** Der Abstand zwischen zwei selbsttätigen Prüfungen. */
export const CHECK_INTERVAL_MS = 24 * 60 * 60 * 1000;

/** Zeitlimit einer Anfrage. Der Feed ist eine kleine Datei. */
const REQUEST_TIMEOUT_MS = 10_000;

/**
 * Obergrenze für die Antwort.
 *
 * Der Feed ist ein paar hundert Byte groß. Die Grenze ist gegen einen
 * Server, der statt einer Datei einen Strom schickt — nicht gegen den
 * eigenen.
 */
const MAX_FEED_BYTES = 64 * 1024;

export interface UpdateServiceOptions {
  /** Die installierte Fassung, aus `app.getVersion()`. */
  currentVersion: string;
  /** Wo die Zustandsdatei liegt. */
  stateDir: string;
  feed: UpdateFeedConfig;
  platform: string;
  arch: string;
  log: (message: string) => void;
  /** Öffnet eine Adresse im Browser des Rechners. */
  openExternal: (url: string) => Promise<void>;
  /** Verzeichnis für geladene Pakete — `userData/Updates`. */
  updatesDir: string;
  /**
   * Das Backup unmittelbar vor der Installation (D41).
   *
   * Kein „meistens" und kein „wenn es schnell geht": Der Schritt läuft
   * vor jeder Installation, und schlägt er fehl, wird nicht installiert.
   * Ein Update ist der einzige Vorgang, der die Datenbank einer fremden
   * Fassung vorsetzt — davor gehört eine Sicherung, die der Benutzer nicht
   * erst anfordern muss.
   */
  createBackup: () => Promise<void>;
  /**
   * Der Austausch der Installation samt Neustart.
   *
   * Hereingereicht, weil er plattformabhängig ist und Electron braucht:
   * `install.ts` tauscht das Bundle beziehungsweise startet den
   * NSIS-Installer, `main.ts` hängt `app.relaunch()` und `app.quit()`
   * daran. `false` heißt „auf diesem Rechner nicht möglich" — dann bleibt
   * der Weg über den Dateimanager.
   */
  installPackage: (ready: { filePath: string; version: string }) => Promise<boolean>;
  /** Zeigt das Paket im Dateimanager — der Rückweg, wenn nichts anderes geht. */
  revealPackage: (filePath: string) => void;
  /** Für die Tests austauschbar. */
  fetchImpl?: typeof fetch;
  now?: () => Date;
}

export class UpdateService {
  private readonly options: UpdateServiceOptions;
  private state: UpdateState;
  private running: Promise<UpdateStatus> | null = null;
  private checking = false;
  private error: string | null = null;
  private timer: NodeJS.Timeout | null = null;
  /** Läuft ein Download, steht hier sein Fortschritt. */
  private progress: UpdateProgress | null = null;
  private downloading: Promise<UpdateStatus> | null = null;
  private abort: AbortController | null = null;
  private installing = false;

  constructor(options: UpdateServiceOptions) {
    this.options = options;
    this.state = readUpdateState(options.stateDir, options.feed.allowedHosts);

    /*
     * Was hier liegt, gehört zur vorigen Runde: ein Paket, das die laufende
     * Fassung nicht mehr überholt (also eingespielt oder überholt), oder
     * eine abgebrochene `.teil`-Datei. Beides sind hundert Megabyte, die
     * niemand mehr braucht — und ein Paket, das noch zählt, bleibt liegen.
     */
    if (
      this.state.ready !== null &&
      !isNewerVersion(this.state.ready.version, options.currentVersion)
    ) {
      this.options.log(`Eingespieltes Paket verworfen: ${this.state.ready.file}`);
      this.state = { ...this.state, ready: null };
      saveUpdateState(options.stateDir, this.state);
    }
    pruneDownloads(options.updatesDir, this.state.ready?.file ?? null);
  }

  /**
   * Die erste Prüfung planen.
   *
   * Nicht sofort: Beim Start hat die Anwendung Wichtigeres zu tun, als auf
   * eine Antwort aus dem Netz zu warten — und wer sie startet, will
   * arbeiten und nicht aktualisieren. Nach der ersten Prüfung läuft der
   * Zeitgeber weiter, damit auch eine Anwendung, die wochenlang offen
   * steht, hin und wieder nachsieht.
   *
   * @param delayMs Abstand zur ersten Prüfung.
   */
  start(delayMs = 10_000): void {
    if (this.timer !== null) return;

    const tick = (): void => {
      if (this.due()) {
        void this.check().catch(() => {
          // `check` legt den Fehler in den Zustand; hier bleibt nichts zu tun.
        });
      }
    };

    this.timer = setTimeout(() => {
      tick();
      this.timer = setInterval(tick, 60 * 60 * 1000);
      this.timer.unref?.();
    }, delayMs);
    this.timer.unref?.();
  }

  /** Den Zeitgeber anhalten — beim Beenden der Anwendung. */
  stop(): void {
    if (this.timer !== null) {
      clearTimeout(this.timer);
      clearInterval(this.timer);
      this.timer = null;
    }
  }

  status(): UpdateStatus {
    const available = this.availableUpdate();
    const ready = this.readyUpdate();

    return {
      state: this.stateName(available, ready),
      currentVersion: this.options.currentVersion,
      automatic: this.state.automatic,
      lastCheckedAt: this.state.lastCheckedAt,
      available,
      progress: this.progress,
      ready,
      error: this.error,
      feedUrl: this.options.feed.url,
    };
  }

  setAutomatic(automatic: boolean): UpdateStatus {
    this.state = { ...this.state, automatic };
    saveUpdateState(this.options.stateDir, this.state);
    return this.status();
  }

  /**
   * Nachsehen, ob es etwas Neues gibt.
   *
   * Läuft schon eine Prüfung, wird deren Ergebnis zurückgegeben, statt eine
   * zweite Anfrage zu stellen: Der Knopf in den Einstellungen und der
   * Zeitgeber können zusammenfallen.
   */
  async check(): Promise<UpdateStatus> {
    if (this.running !== null) return this.running;
    if (this.options.feed.url === null) return this.status();

    this.checking = true;
    this.error = null;
    this.running = this.run(this.options.feed.url);

    try {
      return await this.running;
    } finally {
      this.running = null;
    }
  }

  /**
   * Der eigentliche Lauf.
   *
   * Getrennt von `check`, damit `checking` zurückgesetzt ist, bevor der
   * Zustand gebildet wird: Sonst meldete die Antwort auf eine gerade
   * abgeschlossene Prüfung „prüft".
   */
  private async run(url: string): Promise<UpdateStatus> {
    try {
      const feed = await this.load(url);
      this.state = {
        ...this.state,
        lastCheckedAt: this.now().toISOString(),
        lastFeed: feed,
      };
      saveUpdateState(this.options.stateDir, this.state);
      this.options.log(
        isNewerVersion(feed.version, this.options.currentVersion)
          ? `Update verfügbar: ${feed.version}`
          : `Updateprüfung: ${this.options.currentVersion} ist aktuell.`,
      );
    } catch (error: unknown) {
      this.error = error instanceof Error ? error.message : String(error);
      this.options.log(`Updateprüfung fehlgeschlagen: ${this.error}`);
    } finally {
      this.checking = false;
    }

    return this.status();
  }

  /**
   * Das Paket laden.
   *
   * Kehrt zurück, sobald der Download läuft — nicht erst, wenn er fertig
   * ist: Ein Fortschrittsbalken, der auf seine eigene Antwort wartet, wäre
   * keiner. Die Oberfläche fragt danach den Zustand ab.
   */
  async download(): Promise<UpdateStatus> {
    if (this.downloading !== null) return this.status();
    if (this.installing) return this.status();

    const available = this.availableUpdate();
    const target = available?.download;
    if (available === null || target === undefined || target === null) {
      this.error = 'Für dieses System liegt kein Paket bereit.';
      return this.status();
    }

    // Schon geladen und geprüft? Dann führt der Weg direkt zum Installieren.
    if (this.readyUpdate()?.version === available.version) return this.status();

    const file = packageFileName(target.url);
    if (file === null) {
      this.error = `Der Updatefeed nennt keinen brauchbaren Dateinamen: ${target.url}`;
      this.options.log(this.error);
      return this.status();
    }

    this.error = null;
    this.progress = { transferredBytes: 0, totalBytes: target.sizeBytes, percent: 0 };
    this.abort = new AbortController();
    this.downloading = this.runDownload(available.version, target, file);

    // Das Versprechen wird bewusst nicht abgewartet. Die Fehlerbehandlung
    // sitzt in `runDownload`; hier bleibt nur, den Zustand zurückzugeben.
    void this.downloading.finally(() => {
      this.downloading = null;
      this.abort = null;
    });

    return this.status();
  }

  /** Bricht einen laufenden Download ab. */
  cancelDownload(): UpdateStatus {
    this.abort?.abort();
    return this.status();
  }

  /**
   * Sichern, installieren, neu starten.
   *
   * Die Reihenfolge ist die Zusage (D41): Erst das Backup — und nur wenn es
   * gelingt —, dann die Signaturprüfung des Betriebssystems, dann der
   * Austausch, dann der Neustart. Schlägt etwas fehl, steht die alte
   * Installation unangetastet da, und die Meldung sagt, woran es lag.
   *
   * Ob die Anwendung danach noch antwortet, ist offen: Auf dem
   * Erfolgsweg beendet sie sich. Die Oberfläche hat ihre Antwort dann
   * schon erhalten oder verliert die Verbindung — beides ist in Ordnung,
   * weil gleich darauf die neue Fassung hochkommt.
   */
  async install(): Promise<UpdateStatus> {
    if (this.installing) return this.status();

    const ready = this.readyUpdate();
    if (ready === null) {
      this.error = 'Es liegt kein geprüftes Paket zum Installieren bereit.';
      return this.status();
    }

    if (!ready.installable) {
      // Kein Weg für diese Plattform: dann wenigstens den Ordner zeigen.
      this.options.revealPackage(ready.filePath);
      this.error =
        'Diese Installation kann sich nicht selbst ersetzen. Das geladene ' +
        'Paket liegt im Dateimanager bereit.';
      return this.status();
    }

    this.installing = true;
    this.error = null;

    try {
      this.options.log('Backup vor der Installation …');
      await this.options.createBackup();
    } catch (error: unknown) {
      this.installing = false;
      this.error = `Das Backup vor der Installation ist fehlgeschlagen: ${message(error)}`;
      this.options.log(this.error);
      return this.status();
    }

    try {
      const installed = await this.options.installPackage({
        filePath: ready.filePath,
        version: ready.version,
      });

      if (!installed) {
        this.installing = false;
        this.options.revealPackage(ready.filePath);
        this.error =
          'Die Installation war auf diesem Rechner nicht möglich. Das ' +
          'geladene Paket liegt im Dateimanager bereit.';
        return this.status();
      }
    } catch (error: unknown) {
      this.installing = false;
      this.error = `Die Installation ist fehlgeschlagen: ${message(error)}`;
      this.options.log(this.error);
      return this.status();
    }

    // Der Austausch ist durch; das Paket hat seinen Dienst getan.
    this.state = { ...this.state, ready: null };
    saveUpdateState(this.options.stateDir, this.state);
    return this.status();
  }

  /**
   * Das Paket im Browser öffnen.
   *
   * Der zweite Weg, und er bleibt: Wer der Anwendung den Austausch nicht
   * anvertrauen will, lädt im Browser und installiert wie beim ersten Mal.
   * Für Systeme ohne eigenes Paket ist es der einzige Weg — dort führt er
   * zur Hinweisseite.
   */
  async openDownload(): Promise<boolean> {
    const available = this.availableUpdate();
    const url = available?.download?.url ?? available?.notesUrl ?? null;
    if (url === null) return false;

    await this.options.openExternal(url);
    this.options.log(`Download im Browser geöffnet: ${url}`);
    return true;
  }

  /** Zeigt das geladene Paket im Dateimanager. */
  revealDownload(): boolean {
    const ready = this.readyUpdate();
    if (ready === null) return false;

    this.options.revealPackage(ready.filePath);
    return true;
  }

  /** Der Download selbst — außerhalb von `download`, damit der zurückkehren kann. */
  private async runDownload(
    version: string,
    target: { url: string; sizeBytes: number; sha256: string },
    file: string,
  ): Promise<UpdateStatus> {
    const targetFile = path.join(this.options.updatesDir, file);

    try {
      this.options.log(`Lade ${target.url}`);
      await downloadPackage({
        url: target.url,
        expectedSha256: target.sha256,
        expectedSizeBytes: target.sizeBytes,
        targetFile,
        signal: this.abort?.signal,
        fetchImpl: this.options.fetchImpl,
        onProgress: (transferred) => {
          this.progress = {
            transferredBytes: transferred,
            totalBytes: target.sizeBytes,
            percent: Math.min(100, Math.round((transferred / target.sizeBytes) * 100)),
          };
        },
      });

      this.state = {
        ...this.state,
        ready: { version, file, sizeBytes: target.sizeBytes },
      };
      saveUpdateState(this.options.stateDir, this.state);
      // Ältere Pakete haben sich damit erledigt.
      pruneDownloads(this.options.updatesDir, file);
      this.options.log(`Paket geprüft und bereit: ${targetFile}`);
    } catch (error: unknown) {
      this.error = message(error);
      this.options.log(`Download fehlgeschlagen: ${this.error}`);
    } finally {
      this.progress = null;
    }

    return this.status();
  }

  /**
   * Ist die nächste selbsttätige Prüfung fällig?
   *
   * Öffentlich, weil daran der Unterschied zwischen „prüft höchstens
   * einmal am Tag" und „prüft bei jedem Start" hängt — und das ist eine
   * Zusage an den Benutzer, keine Einzelheit des Zeitgebers.
   */
  due(): boolean {
    if (!this.state.automatic || this.options.feed.url === null) return false;
    if (this.state.lastCheckedAt === null) return true;

    const last = Date.parse(this.state.lastCheckedAt);
    if (Number.isNaN(last)) return true;
    return this.now().getTime() - last >= CHECK_INTERVAL_MS;
  }

  /**
   * Der eine Zustand, nach dem die Oberfläche schaltet.
   *
   * Die Reihenfolge der Abfragen ist die Rangfolge: Was gerade läuft, geht
   * vor dem, was bereitsteht, und ein Fehler geht dem Wartezustand vor —
   * nur ein geladenes Paket ist stärker als ein Fehler, weil es die
   * nächste Handlung trägt.
   */
  private stateName(available: AvailableUpdate | null, ready: ReadyUpdate | null): UpdateStateName {
    if (this.options.feed.url === null) return 'abgeschaltet';
    if (this.installing) return 'installiert';
    if (this.downloading !== null) return 'laedt';
    if (ready !== null) return 'bereit';
    if (this.error !== null) return 'fehler';
    if (this.checking) return 'prueft';
    if (available !== null) return 'verfuegbar';
    if (this.state.lastCheckedAt === null) return 'unbekannt';
    return 'aktuell';
  }

  /**
   * Das geladene Paket — wenn es noch da ist.
   *
   * Die Datei wird bei jeder Abfrage nachgesehen: Wer sein
   * Downloadverzeichnis aufräumt, soll keinen Knopf vorfinden, der ins
   * Leere greift.
   */
  private readyUpdate(): ReadyUpdate | null {
    const ready = this.state.ready;
    if (ready === null) return null;
    if (!isNewerVersion(ready.version, this.options.currentVersion)) return null;

    const filePath = path.join(this.options.updatesDir, ready.file);
    if (!fs.existsSync(filePath)) return null;

    return {
      version: ready.version,
      filePath,
      sizeBytes: ready.sizeBytes,
      installable: canInstall(this.options.platform),
    };
  }

  /**
   * Die neuere Fassung — oder `null`.
   *
   * Ein Feed ohne Paket für diesen Rechner meldet trotzdem: Wer sein
   * System wechselt, soll erfahren, dass es eine neue Fassung gibt, auch
   * wenn der Knopf ihn dann auf die Hinweisseite führt.
   */
  private availableUpdate(): AvailableUpdate | null {
    const feed = this.state.lastFeed;
    if (feed === null) return null;
    if (!isNewerVersion(feed.version, this.options.currentVersion)) return null;

    const platform = updatePlatform(this.options.platform, this.options.arch);

    return {
      version: feed.version,
      releasedAt: feed.releasedAt,
      notes: feed.notes,
      notesUrl: feed.notesUrl,
      download: (platform === null ? undefined : feed.downloads[platform]) ?? null,
    };
  }

  /** Den Feed holen und lesen. */
  private async load(url: string): Promise<UpdateFeed> {
    const request = this.options.fetchImpl ?? fetch;

    let response: Response;
    try {
      response = await request(url, {
        method: 'GET',
        headers: {
          Accept: 'application/json',
          // Kein Zwischenspeicher: Die Datei ändert sich selten, aber wenn
          // sie sich ändert, ist genau das die Nachricht.
          'Cache-Control': 'no-cache',
          'User-Agent': `Privatura/${this.options.currentVersion} (${this.options.platform}; ${this.options.arch})`,
        },
        signal: AbortSignal.timeout(REQUEST_TIMEOUT_MS),
      });
    } catch (error: unknown) {
      /*
       * Kein Netz, kein DNS, kein Durchkommen — `fetch` wirft dafür
       * „fetch failed", und genau das stünde sonst in den Einstellungen.
       * Der häufigste Fall ist ein Rechner ohne Verbindung, und dann soll
       * dort kein englischer Bibliotheksfehler stehen, sondern die Lage.
       */
      const reason =
        error instanceof Error && error.name === 'TimeoutError'
          ? 'antwortet nicht innerhalb von zehn Sekunden'
          : 'ist nicht erreichbar';
      throw new Error(`Der Updatefeed ${reason} (${new URL(url).hostname}).`);
    }

    if (!response.ok) {
      throw new Error(`Der Updatefeed antwortete mit HTTP ${String(response.status)}.`);
    }

    // Umleitungen sind erlaubt — eine Domain darf von `www` auf sich selbst
    // zeigen —, aber nicht aus der Erlaubnisliste heraus. Ohne diese
    // Prüfung genügte eine Umleitung, um die feste Adresse zu umgehen.
    assertAllowed(response.url, url, this.options.feed.allowedHosts);

    const declared = Number(response.headers.get('content-length') ?? '0');
    if (declared > MAX_FEED_BYTES) {
      throw new Error('Der Updatefeed ist unerwartet groß.');
    }

    const text = await response.text();
    if (text.length > MAX_FEED_BYTES) {
      throw new Error('Der Updatefeed ist unerwartet groß.');
    }

    let raw: unknown;
    try {
      raw = JSON.parse(text);
    } catch {
      throw new Error('Der Updatefeed ist kein gültiges JSON.');
    }

    return parseUpdateFeed(raw, this.options.feed.allowedHosts);
  }

  private now(): Date {
    return this.options.now?.() ?? new Date();
  }
}

/**
 * Der Dateiname aus der Downloadadresse — oder `null`.
 *
 * Geprüft, bevor etwas geschrieben wird: Eine Adresse, die auf ein
 * Verzeichnis oder auf nichts endet, ergäbe einen Pfad, unter dem sich
 * nicht schreiben lässt, und die Meldung spräche dann von einem
 * Schreibfehler statt von dem, was wirklich nicht stimmt. Erlaubt sind
 * genau die beiden Endungen, die es gibt (docs/RELEASE.md).
 */
function packageFileName(url: string): string | null {
  const name = path.basename(new URL(url).pathname);
  return /^[\w.-]+\.(?:dmg|exe)$/u.test(name) ? name : null;
}

/** Der Text eines Fehlers, was auch geworfen wurde. */
function message(error: unknown): string {
  return error instanceof Error ? error.message : String(error);
}

/**
 * Wo die Antwort tatsächlich herkommt.
 *
 * `response.url` ist die Adresse nach allen Umleitungen. Eine leere
 * Zeichenkette liefert eine Antwort, die nie umgeleitet wurde — dann gilt
 * die angefragte Adresse, die ohnehin aus der Konfiguration stammt.
 */
function assertAllowed(finalUrl: string, requested: string, allowedHosts: readonly string[]): void {
  const parsed = new URL(finalUrl === '' ? requested : finalUrl);
  if (parsed.protocol !== 'https:' || !allowedHosts.includes(parsed.hostname)) {
    throw new Error(`Der Updatefeed wurde umgeleitet auf ${parsed.origin}.`);
  }
}
