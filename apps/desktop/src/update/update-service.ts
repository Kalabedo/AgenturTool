/**
 * Die Updateprüfung (D41, D43).
 *
 * Was sie tut: einmal in 24 Stunden eine JSON-Datei von der eigenen Domain
 * holen, ihre Version mit der installierten vergleichen und das Ergebnis
 * hinlegen. Mehr nicht. Geladen und installiert wird von Hand — die
 * Anwendung öffnet den Installer im Browser des Rechners und geht der
 * Installation aus dem Weg.
 *
 * Warum nicht mehr: Ein Updater, der sich selbst ersetzt, muss vorher ein
 * Backup ziehen, die laufende Datenbank freigeben, den Migrationslauf des
 * Neustarts überstehen und im Fehlerfall zurückkönnen. Das ist ein eigenes
 * Vorhaben, und es hängt an Zusagen, die eine Versionsanzeige nicht
 * braucht. Der Weg dorthin bleibt offen: Der Feed trägt Prüfsumme und
 * Größe jedes Pakets bereits mit.
 *
 * Warum im Hauptprozess: Das Fenster weist jede Anfrage außerhalb der
 * Rückschleife ab (`network.ts`, D36), und daran soll sich nichts ändern.
 * Diese Klasse spricht mit `fetch` aus Node, an Chromiums Netzwerkstapel
 * und damit am Fenster vorbei. Was den Rechner dabei verlässt: ein GET auf
 * die Feed-Adresse, in der Kennung die eigene Version und Plattform. Keine
 * Kennung des Rechners, keine Kunden-, Rechnungs- oder Nutzungsdaten.
 *
 * Elektron kommt hier nicht vor: `openExternal`, die Uhr und `fetch`
 * werden hereingereicht. Der Hauptprozess bindet sie in `main.ts` an
 * Electron; die Tests binden sie an nichts und können den ganzen Ablauf
 * durchspielen.
 */
import {
  isNewerVersion,
  parseUpdateFeed,
  updatePlatform,
  type AvailableUpdate,
  type UpdateFeed,
  type UpdateState as UpdateStateName,
  type UpdateStatus,
} from '@agentur-tool/shared';
import type { UpdateFeedConfig } from '../config';
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

  constructor(options: UpdateServiceOptions) {
    this.options = options;
    this.state = readUpdateState(options.stateDir, options.feed.allowedHosts);
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

    return {
      state: this.stateName(available),
      currentVersion: this.options.currentVersion,
      automatic: this.state.automatic,
      lastCheckedAt: this.state.lastCheckedAt,
      available,
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
   * Das Paket im Browser öffnen.
   *
   * Bewusst außerhalb der Anwendung: Der Browser zeigt, woher die Datei
   * kommt, kann den Download fortsetzen und legt sie dorthin, wo der
   * Benutzer seine Downloads sucht. Ein eigener Ladevorgang im Fenster
   * brächte nichts davon mit — und ein zweites Programm, das im
   * Hintergrund hundert Megabyte zieht, will niemand.
   */
  async openDownload(): Promise<boolean> {
    const available = this.availableUpdate();
    const url = available?.download?.url ?? available?.notesUrl ?? null;
    if (url === null) return false;

    await this.options.openExternal(url);
    this.options.log(`Download geöffnet: ${url}`);
    return true;
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

  private stateName(available: AvailableUpdate | null): UpdateStateName {
    if (this.options.feed.url === null) return 'abgeschaltet';
    if (this.checking) return 'prueft';
    if (available !== null) return 'verfuegbar';
    if (this.error !== null) return 'fehler';
    if (this.state.lastCheckedAt === null) return 'unbekannt';
    return 'aktuell';
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
          'User-Agent': `AgenturTool/${this.options.currentVersion} (${this.options.platform}; ${this.options.arch})`,
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
