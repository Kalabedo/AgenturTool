/**
 * Verträge rund um die Updateprüfung (D41, D43).
 *
 * Die Anwendung aktualisiert sich nicht selbst. Sie sieht nach, ob es eine
 * neuere Fassung gibt, und sagt es — laden und installieren tut der
 * Benutzer. Das ist bewusst so: Ein Installationsvorgang, der eine laufende
 * Anwendung mit offenen Rechnungsentwürfen ersetzt, braucht mehr
 * Zusicherungen (Backup, Migrationslauf, Wiederanlauf), als eine
 * Versionsanzeige rechtfertigt. Der Weg dorthin ist damit nicht verbaut:
 * Der Feed unten trägt Prüfsumme und Größe bereits mit, weil ein Updater
 * genau die braucht.
 *
 * Der Feed ist eine einzelne JSON-Datei auf der eigenen Domain. Kein
 * GitHub-Release-Endpunkt: Die Downloads sollen später hinter Lizenz- und
 * Kaufbedingungen liegen können, und eine Datei, die man mit `scp`
 * hinlegt, ist der kleinste Kanal, der das aushält.
 *
 * Diese Datei liegt in `shared`, weil drei Seiten dieselben Regeln brauchen:
 * der Hauptprozess, der den Feed liest, die Oberfläche, die den Zustand
 * zeigt, und die Tests, die beides festhalten.
 */

/**
 * Die Pakete, die es gibt (docs/RELEASE.md).
 *
 * Windows ARM64 führt das x64-Paket über die Emulation aus und bekommt
 * deshalb keinen eigenen Schlüssel; Linux ist kein Releaseziel.
 */
export const UPDATE_PLATFORMS = ['macos-arm64', 'macos-x64', 'windows-x64'] as const;

export type UpdatePlatform = (typeof UPDATE_PLATFORMS)[number];

/** Ein herunterladbares Paket. */
export interface UpdateDownload {
  /** Absolute HTTPS-Adresse auf der eigenen Domain. */
  url: string;
  sizeBytes: number;
  /** SHA-256 in Kleinbuchstaben — dieselbe Zeile wie in `SHA256SUMS`. */
  sha256: string;
}

/** Der Inhalt der Feed-Datei. */
export interface UpdateFeed {
  /** Aufbau der Datei; steigt, wenn sich das Format ändert. */
  formatVersion: number;
  /** Die angebotene Fassung, stabiles SemVer ohne führendes `v`. */
  version: string;
  /** Veröffentlichungsdatum als `JJJJ-MM-TT`. */
  releasedAt: string;
  /** Ein bis zwei Sätze für das Banner. */
  notes: string | null;
  /** Seite mit den vollständigen Versionshinweisen. */
  notesUrl: string | null;
  /** Mindestens ein Paket; fehlende Plattformen bekommen keine Meldung. */
  downloads: Partial<Record<UpdatePlatform, UpdateDownload>>;
}

export const UPDATE_FEED_FORMAT_VERSION = 1;

/**
 * Wie es um die Anwendung steht — die Antwort von `GET /api/app/update`.
 *
 * Ein einziger Zustand statt mehrerer Felder, die sich widersprechen
 * könnten: Die Oberfläche schaltet danach, und was sie zeigt, ist an genau
 * einer Stelle entschieden.
 */
export type UpdateState =
  /** Kein Gastgeber — der Browserbetrieb bei `pnpm dev`. Nichts anzeigen. */
  | 'nicht-unterstuetzt'
  /** Der Benutzer hat die Prüfung abgeschaltet, oder die Umgebung tat es. */
  | 'abgeschaltet'
  /** Noch nie geprüft. */
  | 'unbekannt'
  /** Eine Prüfung läuft gerade. */
  | 'prueft'
  /** Geprüft, und es gibt nichts Neues. */
  | 'aktuell'
  /** Es gibt eine neuere Fassung. */
  | 'verfuegbar'
  /** Die letzte Prüfung ist gescheitert. */
  | 'fehler';

/** Die neuere Fassung, so wie die Oberfläche sie zeigt. */
export interface AvailableUpdate {
  version: string;
  releasedAt: string;
  notes: string | null;
  notesUrl: string | null;
  /** Das Paket für diesen Rechner — `null`, wenn der Feed keines führt. */
  download: UpdateDownload | null;
}

export interface UpdateStatus {
  state: UpdateState;
  /** Die installierte Fassung. */
  currentVersion: string;
  /** Prüft die Anwendung von sich aus (höchstens einmal in 24 Stunden)? */
  automatic: boolean;
  /** Zeitpunkt der letzten erfolgreichen Prüfung, ISO-8601. */
  lastCheckedAt: string | null;
  available: AvailableUpdate | null;
  /** Klartext der letzten gescheiterten Prüfung. */
  error: string | null;
  /** Die Adresse, die gefragt wird — damit sie niemand erraten muss. */
  feedUrl: string | null;
}

/** Was `PUT /api/app/update/settings` entgegennimmt. */
export interface UpdateSettingsRequest {
  automatic: boolean;
}

const VERSION_PATTERN = /^(?:0|[1-9]\d*)\.(?:0|[1-9]\d*)\.(?:0|[1-9]\d*)$/u;

/** Ist das eine stabile Fassung in der Form, die Releases tragen? */
export function isStableVersion(value: string): boolean {
  return VERSION_PATTERN.test(value);
}

/**
 * Vergleicht zwei Fassungen: negativ, wenn `a` älter ist.
 *
 * Nur die drei Zahlen, keine Vorabkennungen — Releases haben laut
 * `release-preflight.mjs` keine. Ein Wert, der nicht in diese Form passt,
 * gilt als älter als alles; so führt eine unlesbare Angabe im Feed nicht
 * dazu, dass die Anwendung sich für veraltet hält.
 */
export function compareVersions(a: string, b: string): number {
  const left = parts(a);
  const right = parts(b);
  if (left === null || right === null) {
    if (left === right) return 0;
    return left === null ? -1 : 1;
  }

  for (let index = 0; index < 3; index += 1) {
    const difference = (left[index] ?? 0) - (right[index] ?? 0);
    if (difference !== 0) return difference < 0 ? -1 : 1;
  }
  return 0;
}

/** Ist `candidate` neuer als die installierte Fassung? */
export function isNewerVersion(candidate: string, installed: string): boolean {
  return compareVersions(candidate, installed) > 0;
}

function parts(value: string): [number, number, number] | null {
  if (!VERSION_PATTERN.test(value)) return null;
  const [major, minor, patch] = value.split('.').map(Number);
  return [major ?? 0, minor ?? 0, patch ?? 0];
}

/** Welches Paket dieser Rechner braucht — `null` für Systeme ohne Release. */
export function updatePlatform(platform: string, arch: string): UpdatePlatform | null {
  if (platform === 'darwin') {
    return arch === 'arm64' ? 'macos-arm64' : arch === 'x64' ? 'macos-x64' : null;
  }
  if (platform === 'win32' && arch === 'x64') {
    return 'windows-x64';
  }
  return null;
}

/**
 * Liest den Feed und weist alles zurück, was nicht genau der Form entspricht.
 *
 * Streng, weil dieser Text von außerhalb des Rechners kommt — der einzige,
 * der das tut. Er landet in der Oberfläche und in einem `openExternal`;
 * beides sind Wege, auf denen ein manipulierter Feed sonst etwas anderes
 * erreichen könnte als eine Versionsanzeige. Deshalb: nur HTTPS, nur die
 * erlaubten Hosts, begrenzte Textlängen und eine Prüfsumme in der Form,
 * die eine Prüfsumme hat.
 *
 * @param allowedHosts Hosts, von denen Downloads und Hinweisseiten stammen
 *   dürfen. Leer heißt: keiner — dann ist der Feed unbrauchbar, und das
 *   soll auffallen.
 */
export function parseUpdateFeed(raw: unknown, allowedHosts: readonly string[]): UpdateFeed {
  if (typeof raw !== 'object' || raw === null || Array.isArray(raw)) {
    throw new Error('Der Updatefeed ist kein JSON-Objekt.');
  }
  const feed = raw as Record<string, unknown>;

  if (feed.formatVersion !== UPDATE_FEED_FORMAT_VERSION) {
    throw new Error(
      `Unbekanntes Feed-Format: ${String(feed.formatVersion)} ` +
        `(erwartet ${String(UPDATE_FEED_FORMAT_VERSION)}).`,
    );
  }

  const version = feed.version;
  if (typeof version !== 'string' || !isStableVersion(version)) {
    throw new Error(`Der Updatefeed nennt keine stabile Version: ${String(version)}`);
  }

  const releasedAt = feed.releasedAt;
  if (typeof releasedAt !== 'string' || !/^\d{4}-\d{2}-\d{2}$/u.test(releasedAt)) {
    throw new Error(`Der Updatefeed nennt kein Datum als JJJJ-MM-TT: ${String(releasedAt)}`);
  }

  const downloads: Partial<Record<UpdatePlatform, UpdateDownload>> = {};
  const rawDownloads = feed.downloads;
  if (typeof rawDownloads !== 'object' || rawDownloads === null || Array.isArray(rawDownloads)) {
    throw new Error('Der Updatefeed enthält keine Downloadliste.');
  }

  for (const platform of UPDATE_PLATFORMS) {
    const entry = (rawDownloads as Record<string, unknown>)[platform];
    if (entry === undefined) continue;
    downloads[platform] = parseDownload(platform, entry, allowedHosts);
  }

  if (Object.keys(downloads).length === 0) {
    throw new Error('Der Updatefeed enthält kein einziges bekanntes Paket.');
  }

  return {
    formatVersion: UPDATE_FEED_FORMAT_VERSION,
    version,
    releasedAt,
    notes: text(feed.notes, 'notes', 600),
    notesUrl:
      feed.notesUrl === undefined || feed.notesUrl === null
        ? null
        : httpsUrl(feed.notesUrl, allowedHosts, 'notesUrl'),
    downloads,
  };
}

function parseDownload(
  platform: UpdatePlatform,
  raw: unknown,
  allowedHosts: readonly string[],
): UpdateDownload {
  if (typeof raw !== 'object' || raw === null || Array.isArray(raw)) {
    throw new Error(`Der Eintrag für ${platform} ist kein Objekt.`);
  }
  const entry = raw as Record<string, unknown>;

  const sizeBytes = entry.sizeBytes;
  if (typeof sizeBytes !== 'number' || !Number.isInteger(sizeBytes) || sizeBytes <= 0) {
    throw new Error(`Der Eintrag für ${platform} nennt keine Dateigröße.`);
  }

  const sha256 = entry.sha256;
  if (typeof sha256 !== 'string' || !/^[0-9a-f]{64}$/u.test(sha256)) {
    throw new Error(`Der Eintrag für ${platform} nennt keine SHA-256-Prüfsumme.`);
  }

  return {
    url: httpsUrl(entry.url, allowedHosts, `${platform}.url`),
    sizeBytes,
    sha256,
  };
}

/**
 * Eine Adresse, die aus dem Feed kommen darf.
 *
 * HTTP ohne S wird nicht angenommen: Eine Adresse, der man auf dem Weg
 * etwas anderes unterschieben kann, ist als Downloadquelle nichts wert.
 */
function httpsUrl(raw: unknown, allowedHosts: readonly string[], field: string): string {
  if (typeof raw !== 'string') {
    throw new Error(`${field} ist keine Adresse.`);
  }

  let parsed: URL;
  try {
    parsed = new URL(raw);
  } catch {
    throw new Error(`${field} ist keine gültige Adresse: ${raw}`);
  }

  if (parsed.protocol !== 'https:') {
    throw new Error(`${field} ist nicht HTTPS: ${raw}`);
  }
  if (!allowedHosts.includes(parsed.hostname)) {
    throw new Error(`${field} zeigt auf einen nicht erlaubten Host: ${parsed.hostname}`);
  }
  return parsed.toString();
}

function text(raw: unknown, field: string, maxLength: number): string | null {
  if (raw === undefined || raw === null) return null;
  if (typeof raw !== 'string') {
    throw new Error(`${field} ist kein Text.`);
  }
  const trimmed = raw.trim();
  if (trimmed === '') return null;
  if (trimmed.length > maxLength) {
    throw new Error(`${field} ist länger als ${String(maxLength)} Zeichen.`);
  }
  return trimmed;
}
