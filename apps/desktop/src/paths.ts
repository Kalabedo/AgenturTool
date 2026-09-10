/**
 * Wo die Teile der Anwendung liegen.
 *
 * Zwei Formen, ein Ort für die Antwort: Im Repository liegen API, Frontend
 * und Prisma-CLI in den Paketen nebeneinander; in der gepackten Anwendung
 * unter `resources`. Alles andere im Hauptprozess soll diese Unterscheidung
 * nicht kennen müssen.
 *
 * Der Zustand liegt in beiden Fällen außerhalb: `app.getPath('userData')`,
 * auf einem Mac also `~/Library/Application Support/AgenturTool`. Er gehört
 * dem Benutzer, nicht der Installation — ein Update darf ihn nicht
 * anfassen, und eine Deinstallation nicht mitnehmen.
 */
import path from 'node:path';
import { app } from 'electron';

export interface AppPaths {
  /** Wurzel des API-Pakets (enthält `dist/` und `prisma/`). */
  apiDir: string;
  /** Das gebaute Frontend. */
  webRoot: string;
  /** Verzeichnis mit `schema.prisma` und `migrations/`. */
  prismaDir: string;
  /** Einstiegspunkt der Prisma-CLI. */
  prismaCli: string;
  /** Datenverzeichnis: Datenbank, Assets, PDFs, Sicherungen. */
  dataDir: string;
  /** Electrons eigener Zustand — Caches, Cookies, Fenstergrößen. */
  stateDir: string;
  /** Die SQLite-Datei. */
  databaseFile: string;
}

export function resolvePaths(): AppPaths {
  const apiDir = path.dirname(require.resolve('@agentur-tool/api/package.json'));

  // Die Geschäftsdaten in einen eigenen Unterordner, nicht direkt nach
  // `userData`: Dort legt Chromium seine Caches, Cookies und Datenbanken
  // ab. Wer „Datenordner zeigen" wählt, soll Rechnungen sehen und nicht
  // ein Dutzend Verzeichnisse, die ihn nichts angehen.
  const stateDir = app.getPath('userData');
  const dataDir = path.join(stateDir, 'Daten');

  return {
    apiDir,
    // Das Frontend liegt neben der API, im Repository wie im Paket.
    webRoot: path.join(apiDir, '..', 'web', 'dist'),
    prismaDir: path.join(apiDir, 'prisma'),
    // Aus dem Blickwinkel des API-Pakets aufgelöst: `prisma` ist dessen
    // Abhängigkeit, nicht die der Desktop-Hülle.
    prismaCli: require.resolve('prisma/build/index.js', { paths: [apiDir] }),
    dataDir,
    stateDir,
    databaseFile: path.join(dataDir, 'db.sqlite'),
  };
}
