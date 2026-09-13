import { parseBackupFilename, utcDayNumber } from '@agentur-tool/shared';

/**
 * Die Aufbewahrung nach Generationen (Abschnitt 17).
 *
 * Jedes Archiv enthält den ganzen Datenbestand. Ohne Ausdünnung wächst
 * `data/backups` mit jeder Sicherung um die volle Größe der Daten — auf einem
 * Arbeitsplatzrechner ein Ordner, der irgendwann die Platte füllt, ohne dass
 * je jemand danach gefragt hätte.
 *
 * Die Regel muss man in einem Satz sagen können: **alle Sicherungen der
 * letzten sieben Tage, danach eine je Woche für acht Wochen, danach eine je
 * Monat für zwölf Monate.** Was älter ist, fällt weg. Die jüngsten drei
 * Archive bleiben immer — wer die Anwendung zweimal im Jahr öffnet, soll
 * nicht beim Öffnen feststellen, dass die letzte Sicherung mitgelöscht wurde.
 *
 * Zwei Festlegungen, die dabei nicht beliebig sind:
 *
 * - **Gerechnet wird in Kalenderfächern, nicht in Altersfenstern.** Ein
 *   „älter als 7 × 24 Stunden" hinge am Zeitpunkt des Laufs: Derselbe Ordner
 *   ergäbe je nach Uhrzeit ein anderes Ergebnis, und ein zweiter Lauf löschte
 *   mehr als der erste. Kalenderfächer sind idempotent.
 * - **Je Fach bleibt das älteste Archiv, nicht das jüngste.** Bliebe das
 *   jüngste, verdrängte jede neue Sicherung die bisher behaltene — das
 *   Archiv, auf das sich jemand verlässt, wechselte unter ihm die Identität.
 */

export interface RetentionRules {
  /** Kalendertage, aus denen alles bleibt. */
  days: number;
  /** Kalenderwochen, aus denen je ein Archiv bleibt. */
  weeks: number;
  /** Kalendermonate, aus denen je ein Archiv bleibt. */
  months: number;
  /** So viele der jüngsten Archive bleiben in jedem Fall. */
  minimumKeep: number;
}

export const RETENTION: RetentionRules = { days: 7, weeks: 8, months: 12, minimumKeep: 3 };

/**
 * Die UTC-Kalenderwoche als fortlaufende Zahl.
 *
 * Der 1. Januar 1970 war ein Donnerstag; `+ 3` rückt den Wochenanfang auf
 * Montag, so wie ihn ein Kalender hierzulande zeigt.
 */
function utcWeekNumber(date: Date): number {
  return Math.floor((utcDayNumber(date) + 3) / 7);
}

/** Der UTC-Kalendermonat als fortlaufende Zahl. */
function utcMonthNumber(date: Date): number {
  return date.getUTCFullYear() * 12 + date.getUTCMonth();
}

interface Candidate {
  filename: string;
  createdAt: Date;
  sequence: number;
}

/**
 * Welche Archive weichen dürfen.
 *
 * Nimmt Dateinamen und gibt Dateinamen zurück — ohne Dateisystem, damit sich
 * die Regel ohne einen einzigen Zip prüfen lässt.
 *
 * Was sich nicht als Name dieser Anwendung lesen lässt, steht nie im
 * Ergebnis. `data/backups` ist ein Ordner, in den Benutzer laut Anleitung
 * selbst Archive legen und den sie synchronisieren; ein fremdes `.zip` dort
 * zu löschen wäre der schlimmste Fehler, den diese Funktion machen könnte.
 */
export function archivesToRemove(
  filenames: readonly string[],
  now: Date,
  rules: RetentionRules = RETENTION,
): string[] {
  const candidates: Candidate[] = [];

  for (const filename of filenames) {
    const parsed = parseBackupFilename(filename);
    if (parsed === null) continue;
    candidates.push({ filename, createdAt: parsed.createdAt, sequence: parsed.sequence });
  }

  // Neueste zuerst, und bei gleicher Sekunde nach der Nummer: „die jüngsten
  // drei" darf nicht von der Reihenfolge abhängen, in der das Dateisystem
  // seine Einträge ausspuckt.
  const newestFirst = [...candidates].sort(compareNewestFirst);

  const keep = new Set<string>(newestFirst.slice(0, rules.minimumKeep).map((one) => one.filename));

  const today = utcDayNumber(now);
  const thisWeek = utcWeekNumber(now);
  const thisMonth = utcMonthNumber(now);

  for (const candidate of newestFirst) {
    if (today - utcDayNumber(candidate.createdAt) < rules.days) keep.add(candidate.filename);
  }

  for (const oldest of oldestPerBucket(newestFirst, utcWeekNumber)) {
    if (thisWeek - utcWeekNumber(oldest.createdAt) < rules.weeks) keep.add(oldest.filename);
  }

  for (const oldest of oldestPerBucket(newestFirst, utcMonthNumber)) {
    if (thisMonth - utcMonthNumber(oldest.createdAt) < rules.months) keep.add(oldest.filename);
  }

  return newestFirst.filter((one) => !keep.has(one.filename)).map((one) => one.filename);
}

/** Je Fach das älteste Archiv. */
function oldestPerBucket(
  newestFirst: readonly Candidate[],
  bucketOf: (date: Date) => number,
): Candidate[] {
  const oldest = new Map<number, Candidate>();

  // Die Liste läuft von neu nach alt; der jeweils letzte Treffer eines Fachs
  // ist damit sein ältestes Archiv.
  for (const candidate of newestFirst) {
    oldest.set(bucketOf(candidate.createdAt), candidate);
  }

  return [...oldest.values()];
}

function compareNewestFirst(a: Candidate, b: Candidate): number {
  const byTime = b.createdAt.getTime() - a.createdAt.getTime();
  if (byTime !== 0) return byTime;

  const bySequence = b.sequence - a.sequence;
  if (bySequence !== 0) return bySequence;

  return b.filename.localeCompare(a.filename);
}
