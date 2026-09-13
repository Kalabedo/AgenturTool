import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { pendingMigrations } from '../src/database';

/**
 * Welche Migrationen `migrate deploy` gleich anwenden wird.
 *
 * An dieser Frage hängt, ob beim Start ein vollständiges Archiv entsteht.
 * Fällt sie versehentlich immer mit „ja" aus, ist das alte Verhalten
 * zurück — fünf Archive bei fünf Starts — und niemand merkt es, weil
 * nichts kaputtgeht.
 */

let migrationsDir: string;

beforeEach(() => {
  migrationsDir = fs.mkdtempSync(path.join(os.tmpdir(), 'agentur-tool-migrationen-'));
  for (const name of ['20260907172730_init', '20260908042706_tax_profile_archiving']) {
    fs.mkdirSync(path.join(migrationsDir, name));
  }
  fs.writeFileSync(path.join(migrationsDir, 'migration_lock.toml'), 'provider = "sqlite"\n');
});

afterEach(() => {
  fs.rmSync(migrationsDir, { recursive: true, force: true });
});

describe('pendingMigrations', () => {
  it('meldet nichts, wenn alles angewandt ist', () => {
    expect(
      pendingMigrations(
        ['20260907172730_init', '20260908042706_tax_profile_archiving'],
        migrationsDir,
      ),
    ).toEqual([]);
  });

  it('meldet die neue Migration', () => {
    expect(pendingMigrations(['20260907172730_init'], migrationsDir)).toEqual([
      '20260908042706_tax_profile_archiving',
    ]);
  });

  it('zählt migration_lock.toml nicht mit', () => {
    // Sonst stünde dauerhaft eine Migration aus, die es nicht gibt — und
    // vor jedem Start entstünde wieder ein Archiv.
    const offen = pendingMigrations(
      ['20260907172730_init', '20260908042706_tax_profile_archiving'],
      migrationsDir,
    );

    expect(offen).not.toContain('migration_lock.toml');
  });

  it('hält eine leere Datenbank für vollständig unmigriert', () => {
    // Die leere Liste kommt auch dann, wenn sich `_prisma_migrations` nicht
    // lesen lässt. Dann muss gesichert werden, nicht übersprungen.
    expect(pendingMigrations([], migrationsDir)).toHaveLength(2);
  });

  it('meldet nichts, wenn es das Verzeichnis nicht gibt', () => {
    expect(pendingMigrations([], path.join(migrationsDir, 'gibt-es-nicht'))).toEqual([]);
  });
});
