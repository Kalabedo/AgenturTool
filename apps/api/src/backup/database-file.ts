import path from 'node:path';

/**
 * Der Pfad der SQLite-Datei aus `DATABASE_URL`.
 *
 * Prisma löst einen relativen Pfad gegen das Verzeichnis der
 * `schema.prisma` auf, nicht gegen das Arbeitsverzeichnis — deshalb steht in
 * der `.env` ein `../../../data/db.sqlite`. Wer das beim Wiederherstellen
 * anders auslegt, schreibt die Datenbank an eine Stelle, an der die
 * Anwendung sie nicht sucht, und findet danach eine leere Anwendung vor.
 */
export function resolveSqliteFile(databaseUrl: string, schemaDirectory: string): string {
  if (!databaseUrl.startsWith('file:')) {
    throw new Error(
      `DATABASE_URL zeigt nicht auf eine SQLite-Datei: ${databaseUrl}. ` +
        'Die Wiederherstellung funktioniert nur mit SQLite.',
    );
  }

  const location = databaseUrl.slice('file:'.length);
  return path.isAbsolute(location) ? location : path.resolve(schemaDirectory, location);
}
