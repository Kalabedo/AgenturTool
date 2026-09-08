/**
 * `pnpm restore <archiv> [--force]` — der Weg zurück.
 *
 * Bewusst ein Skript und kein Knopf: Die Wiederherstellung ersetzt das
 * Datenverzeichnis und die Datenbank. Wer sie ausführt, soll die Anwendung
 * vorher anhalten — deshalb steht das auch in der Ausgabe.
 */
import path from 'node:path';
import { execFileSync } from 'node:child_process';
import { fileURLToPath } from 'node:url';
import { config as loadEnv } from 'dotenv';
import { restoreBackup } from '../src/backup/restore';
import { resolveSqliteFile } from '../src/backup/database-file';

const apiRoot = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
loadEnv({ path: path.join(apiRoot, '../../.env') });

async function main(): Promise<void> {
  const [, , archiveArgument, ...rest] = process.argv;

  if (archiveArgument === undefined) {
    console.error('Aufruf: pnpm restore <archiv.zip> [--force]');
    process.exit(1);
  }

  const databaseUrl = process.env.DATABASE_URL;
  if (databaseUrl === undefined) {
    console.error('DATABASE_URL ist nicht gesetzt.');
    process.exit(1);
  }

  const dataDir = path.resolve(process.cwd(), process.env.DATA_DIR ?? './data');
  const databaseFile = resolveSqliteFile(databaseUrl, path.join(apiRoot, 'prisma'));

  console.log('Die Anwendung sollte währenddessen gestoppt sein.\n');

  try {
    const result = await restoreBackup({
      archivePath: path.resolve(process.cwd(), archiveArgument),
      dataDir,
      databaseFile,
      force: rest.includes('--force'),
    });

    console.log(
      `Wiederhergestellt aus einem Backup vom ${new Date(result.manifest.createdAt).toLocaleString('de-DE')}:\n` +
        `  ${result.manifest.counts.invoices} Rechnungen, ${result.restoredFiles} Dateien\n` +
        `  Schemastand des Archivs: ${result.manifest.schemaVersion ?? 'unbekannt'}`,
    );
    if (result.movedExistingTo !== null) {
      console.log(`  Bisherige Daten liegen unter ${result.movedExistingTo}`);
    }

    // Ein älteres Backup kann gegen ein älteres Schema geschrieben sein.
    // Die Migrationen laufen deshalb direkt hinterher — sonst startet die
    // Anwendung gegen eine Datenbank, der Spalten fehlen.
    console.log('\nMigrationen werden angewandt …');
    execFileSync('pnpm', ['exec', 'prisma', 'migrate', 'deploy'], {
      cwd: apiRoot,
      env: { ...process.env, DATABASE_URL: databaseUrl },
      stdio: 'inherit',
    });

    console.log('\nFertig. Die Anwendung kann wieder gestartet werden.');
  } catch (error) {
    console.error(
      `\nWiederherstellung abgebrochen: ${error instanceof Error ? error.message : error}`,
    );
    process.exit(1);
  }
}

void main();
