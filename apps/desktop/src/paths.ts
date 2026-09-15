/**
 * Wo die Teile der Anwendung liegen.
 *
 * Zwei Formen, ein Ort für die Antwort: Im Repository liegen API, Frontend
 * und Prisma-CLI in den Paketen nebeneinander; in der gepackten Anwendung
 * unter `resources`. Alles andere im Hauptprozess soll diese Unterscheidung
 * nicht kennen müssen.
 *
 * Der Zustand liegt in beiden Fällen außerhalb: `app.getPath('userData')`,
 * auf einem Mac also `~/Library/Application Support/Privatura`. Er gehört
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
  /**
   * Geladene Updatepakete.
   *
   * Neben dem Zustand der Installation und ausdrücklich nicht in `Daten/`:
   * Ein Installer ist kein Geschäftsdatum, gehört in kein Backup und darf
   * beim Aufräumen jederzeit verschwinden.
   */
  updatesDir: string;
  /** Die SQLite-Datei. */
  databaseFile: string;
}

/**
 * Das gebaute Frontend.
 *
 * Die eine Stelle, an der sich die beiden Formen wirklich unterscheiden.
 * Im Repository liegt das Frontend als Schwesterpaket neben der API. Im
 * Paket liegt es unter `web/` neben dem Hauptprozess, und zwar
 * ausdrücklich außerhalb von `node_modules`: Was dort landet, bestimmt
 * electron-builder allein aus den `dependencies`. Das Frontend als
 * Abhängigkeit einzutragen, hätte auch React, den Router und alles
 * Weitere mitgebracht — obwohl Vite genau das längst in `dist` gebündelt
 * hat.
 */
function resolveWebRoot(apiDir: string): string {
  return app.isPackaged
    ? path.join(app.getAppPath(), 'web')
    : path.join(apiDir, '..', 'web', 'dist');
}

export function resolvePaths(): AppPaths {
  const apiDir = path.dirname(require.resolve('@privatura/api/package.json'));

  // Die Geschäftsdaten in einen eigenen Unterordner, nicht direkt nach
  // `userData`: Dort legt Chromium seine Caches, Cookies und Datenbanken
  // ab. Wer „Datenordner zeigen" wählt, soll Rechnungen sehen und nicht
  // ein Dutzend Verzeichnisse, die ihn nichts angehen.
  const stateDir = app.getPath('userData');
  const dataDir = path.join(stateDir, 'Daten');

  return {
    apiDir,
    webRoot: resolveWebRoot(apiDir),
    prismaDir: path.join(apiDir, 'prisma'),
    // Aus dem Blickwinkel des API-Pakets aufgelöst: `prisma` ist dessen
    // Abhängigkeit, nicht die der Desktop-Hülle.
    prismaCli: require.resolve('prisma/build/index.js', { paths: [apiDir] }),
    dataDir,
    stateDir,
    updatesDir: path.join(stateDir, 'Updates'),
    databaseFile: path.join(dataDir, 'db.sqlite'),
  };
}
