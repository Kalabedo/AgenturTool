/**
 * Verträge rund um die Datensicherung (Abschnitt 17).
 *
 * Ein Backup ist eine Datei, die alles enthält: Datenbank, hochgeladene
 * Assets, erzeugte PDFs und ein Manifest mit Hashes. Die Wiederherstellung
 * läuft bewusst nicht über die API, sondern über `pnpm restore` — sie
 * ersetzt das Verzeichnis unter den Füßen der laufenden Anwendung, und das
 * ist nichts, was ein Klick im Browser tun sollte.
 */

/**
 * Woher eine Sicherung kam.
 *
 * Steht im Dateinamen und im Manifest. Im Dateinamen, weil die Übersicht
 * ihn zeigen soll, ohne dafür jedes Archiv zu öffnen; im Manifest, weil ein
 * Archiv auch außerhalb dieses Ordners noch erzählen können soll, wozu es
 * entstanden ist.
 */
export type BackupReason = 'taeglich' | 'migration' | 'update' | 'manuell';

export const BACKUP_REASONS: readonly BackupReason[] = [
  'taeglich',
  'migration',
  'update',
  'manuell',
];

/** Die Beschriftung für die Oberfläche. */
export const BACKUP_REASON_LABELS: Record<BackupReason, string> = {
  taeglich: 'täglich',
  migration: 'vor der Migration',
  update: 'vor dem Update',
  manuell: 'von Hand',
};

/** Eine Datei im Archiv, mit dem Hash, an dem sich die Unversehrtheit zeigt. */
export interface BackupEntry {
  /** Pfad im Archiv, z. B. `files/invoices/2026/2026-001.pdf`. */
  path: string;
  sha256: string;
  sizeBytes: number;
}

export interface BackupManifest {
  /** Aufbau des Archivs; steigt, wenn sich das Format ändert. */
  formatVersion: number;
  appVersion: string;
  /** Zuletzt angewandte Migration — sagt, gegen welches Schema die Daten passen. */
  schemaVersion: string | null;
  createdAt: string;
  /**
   * Der Anlass — optional, und deshalb bleibt die Formatversion bei 1.
   * Ältere Archive haben das Feld nicht, neuere stören eine ältere Fassung
   * nicht: Die Wiederherstellung weist nur höhere Formatversionen ab.
   */
  reason?: BackupReason;
  counts: {
    invoices: number;
    documents: number;
    assets: number;
    customers: number;
  };
  database: BackupEntry;
  files: BackupEntry[];
}

/** Ein erzeugtes Archiv, wie es die API meldet. */
export interface BackupSummary {
  filename: string;
  sizeBytes: number;
  sha256: string;
  createdAt: string;
  reason: BackupReason;
  counts: BackupManifest['counts'];
  /**
   * Archive, die die Aufbewahrung im selben Zug ausgedünnt hat.
   *
   * Sichtbar statt heimlich: Wer eine Sicherung auslöst, soll erfahren, dass
   * dabei etwas gelöscht wurde.
   */
  removed: string[];
}

/**
 * Ein vorhandenes Archiv in der Übersicht.
 *
 * Bewusst ohne Hash und ohne Zählerstände: Beides steht im Manifest im
 * Archiv, und für eine Liste müsste dafür jedes Archiv geöffnet und
 * vollständig gelesen werden — bei mehreren hundert Megabyte je Datei eine
 * spürbare Wartezeit für eine Einstellungsseite. Geprüft wird beim
 * Wiederherstellen, wo es zählt.
 */
export interface BackupArchive {
  filename: string;
  sizeBytes: number;
  createdAt: string;
  /** Aus dem Dateinamen gelesen; `null` bei Archiven aus älteren Fassungen. */
  reason: BackupReason | null;
}

export interface BackupStatusResponse {
  /** Neueste zuerst. */
  backups: BackupArchive[];
  /** Wohin die Archive geschrieben werden — für den Hinweis auf `pnpm restore`. */
  directory: string;
}

export const BACKUP_FORMAT_VERSION = 1;

const DAY_MS = 24 * 60 * 60 * 1000;

/**
 * Der UTC-Kalendertag als fortlaufende Zahl.
 *
 * Eine Uhr für beide Seiten: Die Tagessicherung fragt damit, ob heute schon
 * gesichert wurde, die Aufbewahrung, in welches Tagesfach ein Archiv gehört.
 * Mit zwei Uhren — Ortszeit hier, UTC dort — wären sie sich in der
 * Sommerzeit jede Nacht zwei Stunden lang uneins.
 */
export function utcDayNumber(date: Date): number {
  return Math.floor(date.getTime() / DAY_MS);
}

/** Dateiname eines Archivs: sortierbar und ohne Zeichen, die Dateisysteme stören. */
export function backupFilename(createdAt: Date, reason: BackupReason): string {
  const stamp = createdAt
    .toISOString()
    .replace(/[-:]/gu, '')
    .replace(/\..+$/u, '')
    .replace('T', '-');
  return `agentur-tool-backup-${stamp}-${reason}.zip`;
}

/**
 * Der Name eines Archivs, auseinandergenommen.
 *
 * Der Zeitstempel kommt aus dem Namen und nicht aus der Änderungszeit der
 * Datei: Jede Kopie des Ordners — ein Sync in die Cloud, ein
 * zurückgespieltes Verzeichnis — setzt alle Änderungszeiten auf „jetzt".
 * Die Aufbewahrung hielte danach jedes Archiv für taggleich und löschte
 * nichts mehr; die Tagesdrossel hielte gleichzeitig jeden Tag für erledigt.
 *
 * Der Anlass steht als geschlossene Menge im Muster, damit er nie mit der
 * Nummer verwechselt wird, die zwei Sicherungen derselben Sekunde
 * unterscheidet. Namen aus älteren Fassungen tragen keinen Anlass und
 * bleiben trotzdem lesbar.
 */
const ARCHIVE_NAME =
  /^agentur-tool-backup-(\d{4})(\d{2})(\d{2})-(\d{2})(\d{2})(\d{2})(?:-(taeglich|migration|update|manuell))?(?:-(\d+))?\.zip$/u;

export interface ParsedBackupFilename {
  createdAt: Date;
  reason: BackupReason | null;
  /** Die Nummer aus dem Namen; 0, wenn keine dransteht. */
  sequence: number;
}

export function parseBackupFilename(filename: string): ParsedBackupFilename | null {
  const match = ARCHIVE_NAME.exec(filename);
  if (match === null) return null;

  const [, year, month, day, hour, minute, second, reason, sequence] = match;
  const createdAt = new Date(
    Date.UTC(
      Number(year),
      Number(month) - 1,
      Number(day),
      Number(hour),
      Number(minute),
      Number(second),
    ),
  );
  if (Number.isNaN(createdAt.getTime())) return null;

  return {
    createdAt,
    reason: (reason as BackupReason | undefined) ?? null,
    sequence: sequence === undefined ? 0 : Number(sequence),
  };
}
