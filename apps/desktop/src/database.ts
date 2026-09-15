/**
 * Die Datenbank startklar machen.
 *
 * Backup vor jeder Änderung, leere Datei für eine frische Installation,
 * dann Migrationen und die idempotenten Grunddaten. Derselbe Ablauf, den
 * früher der Entrypoint des Docker-Images ging — nur ohne Shell.
 *
 * Die Reihenfolge ist nicht beliebig. Das Backup steht vor den
 * Migrationen, weil eine Migration das Einzige ist, was hier Daten
 * verlieren kann; und die leere Datei muss vorher da sein, weil Prisma 6
 * sie bei `migrate deploy` nicht zuverlässig selbst anlegt.
 *
 * Gesichert wird allerdings nur, wenn auch wirklich eine Migration ansteht.
 * Vorher entstand bei jedem Start ein vollständiges Archiv — bei fünf
 * Starts am Tag fünf Kopien des ganzen Datenbestands, für fünfmal
 * denselben unveränderten Schemastand. Den Fall „seit gestern wurde
 * gearbeitet" deckt die Tagessicherung ab (`backup-schedule.ts`).
 */
import { execFileSync } from 'node:child_process';
import fs from 'node:fs';
import path from 'node:path';
import { PrismaClient } from '@prisma/client';
import { BackupService } from '@privatura/api/dist/backup/backup.service';
import { StorageConfig } from '@privatura/api/dist/common/config.service';
import { seed } from '@privatura/api/dist/common/seed';

export interface PrepareOptions {
  /** Absoluter Pfad zur SQLite-Datei. */
  databaseFile: string;
  /** Ablage für Assets, PDFs und Sicherungen. */
  dataDir: string;
  /** Verzeichnis mit `schema.prisma` und `migrations/`. */
  prismaDir: string;
  /** Die Prisma-CLI (`node_modules/prisma/build/index.js`). */
  prismaCli: string;
  log: (message: string) => void;
}

export async function prepareDatabase(options: PrepareOptions): Promise<void> {
  const { databaseFile, dataDir, prismaDir, prismaCli, log } = options;
  const databaseUrl = `file:${databaseFile}`;

  fs.mkdirSync(dataDir, { recursive: true });
  fs.mkdirSync(path.dirname(databaseFile), { recursive: true });

  const existing = fs.existsSync(databaseFile) && fs.statSync(databaseFile).size > 0;

  if (existing) {
    await backupIfMigrationsPending(databaseUrl, dataDir, prismaDir, log);
  } else {
    log('Frische Installation — Datenbank wird angelegt.');
    fs.writeFileSync(databaseFile, '');
  }

  migrate({ databaseUrl, prismaDir, prismaCli, log });

  const prisma = new PrismaClient({ datasources: { db: { url: databaseUrl } } });
  try {
    const counts = await seed(prisma);
    log(`Grunddaten stehen: ${String(counts.steuerprofile)} Steuerprofile.`);
  } finally {
    await prisma.$disconnect();
  }
}

/**
 * Welche Migrationen `migrate deploy` gleich anwenden wird.
 *
 * Rein und ohne Datenbank, damit sie sich prüfen lässt. Zwei Feinheiten,
 * die beide in die falsche Richtung kippen könnten:
 *
 * - Nur Verzeichnisse zählen. Neben den Migrationen liegt
 *   `migration_lock.toml`; als Eintrag mitgezählt wäre sie eine ewig
 *   ausstehende Migration — und das alte „bei jedem Start ein Archiv" wäre
 *   klammheimlich zurück.
 * - Angewandt ist eine Migration nur, wenn sie fertig **und** nicht
 *   zurückgerollt ist. `migrate resolve --rolled-back` lässt die Zeile
 *   stehen, und `migrate deploy` wendet sie erneut an. Wer das übersieht,
 *   verzichtet auf die Sicherung genau vor dem Lauf, für den es sie gibt.
 */
export function pendingMigrations(applied: readonly string[], migrationsDir: string): string[] {
  let entries: fs.Dirent[];
  try {
    entries = fs.readdirSync(migrationsDir, { withFileTypes: true });
  } catch {
    return [];
  }

  const known = new Set(applied);
  return entries
    .filter((entry) => entry.isDirectory() && !known.has(entry.name))
    .map((entry) => entry.name)
    .sort();
}

/**
 * Sicherung vor den Migrationen — wenn welche anstehen.
 *
 * Ein Fehlschlag hält den Start nicht auf: Wer die Anwendung öffnet, will
 * arbeiten. Er wird aber protokolliert — ein stillschweigend
 * ausgelassenes Backup wäre die schlechtere Überraschung.
 *
 * Ein einziger Client für Abfrage und Sicherung, und er wird geschlossen,
 * bevor `migrate deploy` als Kindprozess übernimmt. `prisma migrate status`
 * wäre die bequemere Antwort auf dieselbe Frage und kostete bei jedem
 * einzelnen Start einen weiteren Kindprozess.
 */
async function backupIfMigrationsPending(
  databaseUrl: string,
  dataDir: string,
  prismaDir: string,
  log: (message: string) => void,
): Promise<void> {
  const prisma = new PrismaClient({ datasources: { db: { url: databaseUrl } } });
  const storage = new StorageConfig({ get: () => dataDir } as never);

  try {
    const pending = pendingMigrations(
      await appliedMigrations(prisma),
      path.join(prismaDir, 'migrations'),
    );

    if (pending.length === 0) {
      log('Datenbank ist auf Stand — kein Backup nötig.');
      return;
    }

    log(`Ausstehende Migrationen: ${pending.join(', ')}`);
    const summary = await new BackupService(prisma as never, storage).createBackup({
      reason: 'migration',
    });
    log(`Backup vor der Migration: ${summary.filename}`);
  } catch (error) {
    log(`Backup fehlgeschlagen: ${error instanceof Error ? error.message : String(error)}`);
  } finally {
    await prisma.$disconnect();
  }
}

/**
 * Die bereits angewandten Migrationen.
 *
 * Fehlt die Tabelle, ist die Liste leer und damit **alles** ausstehend — die
 * Sicherung entsteht. Das ist die Richtung, in die dieser Zweifel fallen
 * muss: Eine Datenbank ohne Migrationstabelle ist entweder ganz neu oder
 * von woanders eingespielt, und im zweiten Fall schreibt der gleich
 * folgende Lauf das ganze Schema um.
 */
async function appliedMigrations(prisma: PrismaClient): Promise<string[]> {
  try {
    const rows = await prisma.$queryRawUnsafe<{ migration_name: string }[]>(
      `SELECT "migration_name" FROM "_prisma_migrations"
        WHERE "finished_at" IS NOT NULL AND "rolled_back_at" IS NULL`,
    );
    return rows.map((row) => row.migration_name);
  } catch {
    return [];
  }
}

/**
 * `prisma migrate deploy` als Kindprozess.
 *
 * Über `process.execPath` mit `ELECTRON_RUN_AS_NODE`: Electrons eigenes
 * Node führt die CLI aus, sodass in der gepackten Anwendung kein zweites
 * Node mitgeliefert werden muss.
 */
function migrate(options: {
  databaseUrl: string;
  prismaDir: string;
  prismaCli: string;
  log: (message: string) => void;
}): void {
  const { databaseUrl, prismaDir, prismaCli, log } = options;

  const output = execFileSync(
    process.execPath,
    [prismaCli, 'migrate', 'deploy', '--schema', path.join(prismaDir, 'schema.prisma')],
    {
      encoding: 'utf8',
      env: {
        ...process.env,
        ELECTRON_RUN_AS_NODE: '1',
        DATABASE_URL: databaseUrl,
        // Prisma fragt sonst beim ersten Lauf nach anonymen Statistiken.
        CHECKPOINT_DISABLE: '1',
      },
    },
  );

  // Prisma meldet „No pending migrations to apply." wenn nichts zu tun war.
  // Alles andere heißt, dass das Schema angefasst wurde — und genau dafür
  // wurde oben gesichert.
  log(
    output.includes('No pending migrations')
      ? 'Datenbank ist auf Stand.'
      : 'Migrationen angewandt.',
  );
}
