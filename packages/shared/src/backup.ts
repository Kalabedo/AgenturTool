/**
 * Verträge rund um die Datensicherung (Abschnitt 17).
 *
 * Ein Backup ist eine Datei, die alles enthält: Datenbank, hochgeladene
 * Assets, erzeugte PDFs und ein Manifest mit Hashes. Die Wiederherstellung
 * läuft bewusst nicht über die API, sondern über `pnpm restore` — sie
 * ersetzt das Verzeichnis unter den Füßen der laufenden Anwendung, und das
 * ist nichts, was ein Klick im Browser tun sollte.
 */

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
  counts: BackupManifest['counts'];
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
}

export interface BackupStatusResponse {
  /** Neueste zuerst. */
  backups: BackupArchive[];
  /** Wohin die Archive geschrieben werden — für den Hinweis auf `pnpm restore`. */
  directory: string;
}

export const BACKUP_FORMAT_VERSION = 1;

/** Dateiname eines Archivs: sortierbar und ohne Zeichen, die Dateisysteme stören. */
export function backupFilename(createdAt: Date): string {
  const stamp = createdAt
    .toISOString()
    .replace(/[-:]/gu, '')
    .replace(/\..+$/u, '')
    .replace('T', '-');
  return `agentur-tool-backup-${stamp}.zip`;
}
