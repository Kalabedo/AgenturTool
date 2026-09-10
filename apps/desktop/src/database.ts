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
 */
import { execFileSync } from 'node:child_process';
import fs from 'node:fs';
import path from 'node:path';
import { PrismaClient } from '@prisma/client';
import { BackupService } from '@agentur-tool/api/dist/backup/backup.service';
import { StorageConfig } from '@agentur-tool/api/dist/common/config.service';
import { seed } from '@agentur-tool/api/dist/common/seed';

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
    await backup(databaseUrl, dataDir, log);
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
 * Sicherung vor den Migrationen.
 *
 * Ein Fehlschlag hält den Start nicht auf: Wer die Anwendung öffnet, will
 * arbeiten. Er wird aber protokolliert — ein stillschweigend
 * ausgelassenes Backup wäre die schlechtere Überraschung.
 */
async function backup(
  databaseUrl: string,
  dataDir: string,
  log: (message: string) => void,
): Promise<void> {
  const prisma = new PrismaClient({ datasources: { db: { url: databaseUrl } } });
  const storage = new StorageConfig({ get: () => dataDir } as never);

  try {
    const summary = await new BackupService(prisma as never, storage).createBackup();
    log(`Backup vor der Migration: ${summary.filename}`);
  } catch (error) {
    log(`Backup fehlgeschlagen: ${error instanceof Error ? error.message : String(error)}`);
  } finally {
    await prisma.$disconnect();
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
