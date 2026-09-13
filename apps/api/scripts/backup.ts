/**
 * `pnpm backup` — ein Archiv von der Kommandozeile.
 *
 * Derselbe Weg wie der Knopf in den Einstellungen, nur ohne laufende
 * Anwendung: für den Entwicklungsrechner und für das automatische Backup vor
 * jeder Migration.
 *
 * `--if-exists` macht daraus einen stillen Vorgang, wenn es noch gar keine
 * Datenbank gibt — bei der allerersten Migration wäre ein Abbruch sonst der
 * erste Eindruck der Anwendung. Die Option kommt aus `db:migrate` und
 * `db:deploy`; sie ist damit zugleich das Zeichen, dass hier vor einer
 * Migration gesichert wird und nicht, weil jemand `pnpm backup` getippt hat.
 */
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { config as loadEnv } from 'dotenv';
import { PrismaClient } from '@prisma/client';
import { BackupService } from '../src/backup/backup.service';
import { StorageConfig } from '../src/common/config.service';
import { resolveSqliteFile } from '../src/backup/database-file';

const apiRoot = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
loadEnv({ path: path.join(apiRoot, '../../.env') });

async function main(): Promise<void> {
  const ifExists = process.argv.includes('--if-exists');
  const databaseUrl = process.env.DATABASE_URL;

  if (databaseUrl === undefined) {
    console.error('DATABASE_URL ist nicht gesetzt.');
    process.exit(1);
  }

  const databaseFile = resolveSqliteFile(databaseUrl, path.join(apiRoot, 'prisma'));
  if (!fs.existsSync(databaseFile)) {
    if (ifExists) {
      console.log('Noch keine Datenbank vorhanden — kein Backup nötig.');
      return;
    }
    console.error(`Keine Datenbank unter ${databaseFile}.`);
    process.exit(1);
  }

  const prisma = new PrismaClient({ datasources: { db: { url: databaseUrl } } });
  const storage = new StorageConfig({
    get: (key: string) => process.env[key],
  } as never);

  try {
    const summary = await new BackupService(prisma as never, storage).createBackup({
      reason: ifExists ? 'migration' : 'manuell',
    });
    console.log(
      `Backup: ${path.join(storage.dataDir, 'backups', summary.filename)}\n` +
        `  ${summary.counts.invoices} Rechnungen, ${summary.counts.documents} PDFs, ` +
        `${summary.counts.assets} Assets\n` +
        `  ${(summary.sizeBytes / 1024 / 1024).toFixed(1)} MB · SHA-256 ${summary.sha256}`,
    );
    if (summary.removed.length > 0) {
      console.log(`  Ausgedünnt: ${summary.removed.join(', ')}`);
    }
  } finally {
    await prisma.$disconnect();
  }
}

void main();
