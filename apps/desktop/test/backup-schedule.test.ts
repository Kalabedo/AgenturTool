import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { backupFilename, type BackupSummary } from '@agentur-tool/shared';
import { BackupSchedule } from '../src/backup-schedule';

/**
 * Die Tagessicherung.
 *
 * Geprüft wird die Frage „ist heute schon gesichert worden?" — und zwar
 * gegen den Ordner, denn genau dort steht die Antwort. Ein eigener Zustand
 * auf der Platte wäre eine zweite Wahrheit, die veralten kann.
 */

let dataDir: string;
let directory: string;
let databaseFile: string;

beforeEach(() => {
  dataDir = fs.mkdtempSync(path.join(os.tmpdir(), 'agentur-tool-zeitplan-'));
  directory = path.join(dataDir, 'backups');
  databaseFile = path.join(dataDir, 'db.sqlite');
  fs.mkdirSync(directory, { recursive: true });
});

afterEach(() => {
  fs.rmSync(dataDir, { recursive: true, force: true });
});

/** Ein Archiv, wie es im Ordner läge. */
function archive(iso: string): void {
  fs.writeFileSync(path.join(directory, backupFilename(new Date(iso), 'taeglich')), 'Archiv');
}

/** Die Datenbank, zuletzt geschrieben zu diesem Zeitpunkt. */
function database(iso: string): void {
  fs.writeFileSync(databaseFile, 'Datenbank');
  const when = new Date(iso);
  fs.utimesSync(databaseFile, when, when);
}

function schedule(
  now: string,
  overrides: Partial<ConstructorParameters<typeof BackupSchedule>[0]> = {},
) {
  return new BackupSchedule({
    directory,
    databaseFile,
    createBackup: () => Promise.resolve({ filename: 'unwichtig.zip' } as BackupSummary),
    log: () => {},
    now: () => new Date(now),
    ...overrides,
  });
}

describe('BackupSchedule', () => {
  it('sichert, wenn es noch gar kein Archiv gibt', () => {
    expect(schedule('2026-09-13T09:00:00Z').due()).toBe(true);
  });

  it('sichert nicht zweimal am selben Tag', () => {
    archive('2026-09-13T02:00:00Z');
    database('2026-09-13T08:00:00Z');

    expect(schedule('2026-09-13T09:00:00Z').due()).toBe(false);
  });

  it('sichert am nächsten Tag wieder', () => {
    archive('2026-09-12T02:00:00Z');
    database('2026-09-12T17:00:00Z');

    expect(schedule('2026-09-13T09:00:00Z').due()).toBe(true);
  });

  it('sichert nicht, wenn seit dem letzten Archiv nichts geschrieben wurde', () => {
    // Wer die Anwendung öffnet, etwas nachsieht und sie wieder schließt,
    // bekommt dafür kein Archiv des ganzen Datenbestands.
    database('2026-09-10T17:00:00Z');
    archive('2026-09-11T02:00:00Z');

    expect(schedule('2026-09-13T09:00:00Z').due()).toBe(false);
  });

  it('lässt sich von der Änderungszeit der Archive nicht täuschen', () => {
    // Ein Sync in die Cloud setzt jede Änderungszeit auf „jetzt". Stammte
    // der Zeitpunkt daher, hielte die Drossel jeden Tag für erledigt.
    archive('2026-09-11T02:00:00Z');
    database('2026-09-12T17:00:00Z');

    const jetzt = new Date('2026-09-13T09:00:00Z');
    for (const name of fs.readdirSync(directory)) {
      fs.utimesSync(path.join(directory, name), jetzt, jetzt);
    }

    expect(schedule('2026-09-13T09:00:00Z').due()).toBe(true);
  });

  it('übergeht Drossel und Wartezeit, wenn die Rauchprobe es verlangt', () => {
    archive('2026-09-13T02:00:00Z');
    database('2026-09-13T01:00:00Z');

    expect(schedule('2026-09-13T09:00:00Z', { force: true }).due()).toBe(true);
  });

  it('zählt ein fremdes Archiv nicht als Sicherung', () => {
    fs.writeFileSync(path.join(directory, 'urlaubsfotos.zip'), 'nicht von uns');

    expect(schedule('2026-09-13T09:00:00Z').due()).toBe(true);
  });

  it('macht aus einer gescheiterten Sicherung keinen Absturz', async () => {
    const meldungen: string[] = [];
    const plan = schedule('2026-09-13T09:00:00Z', {
      createBackup: () => Promise.reject(new Error('Kein Platz mehr.')),
      log: (message) => meldungen.push(message),
    });

    await expect(plan.run()).resolves.toBeUndefined();
    expect(meldungen.join(' ')).toContain('Kein Platz mehr.');
  });

  it('sichert nicht zweimal gleichzeitig', async () => {
    let laeufe = 0;
    const plan = schedule('2026-09-13T09:00:00Z', {
      createBackup: async () => {
        laeufe += 1;
        await new Promise((resolve) => setTimeout(resolve, 10));
        return { filename: 'unwichtig.zip' } as BackupSummary;
      },
    });

    // Der Zeitgeber und der Knopf in den Einstellungen können zusammenfallen.
    await Promise.all([plan.run(), plan.run()]);
    expect(laeufe).toBe(1);
  });

  it('startet nach der Wartezeit und hört auf `stop`', () => {
    vi.useFakeTimers();
    try {
      const plan = schedule('2026-09-13T09:00:00Z');
      const run = vi.spyOn(plan, 'run').mockResolvedValue();

      plan.start(1_000);
      expect(run).not.toHaveBeenCalled();

      vi.advanceTimersByTime(1_000);
      expect(run).toHaveBeenCalledTimes(1);

      plan.stop();
      vi.advanceTimersByTime(24 * 60 * 60 * 1000);
      expect(run).toHaveBeenCalledTimes(1);
    } finally {
      vi.useRealTimers();
    }
  });

  it('schaut auch in einer lange offenen Sitzung wieder nach', () => {
    vi.useFakeTimers();
    try {
      // Kein Archiv im Ordner: Der Zeitgeber findet jedes Mal etwas zu tun.
      const plan = schedule('2026-09-13T09:00:00Z');
      const run = vi.spyOn(plan, 'run').mockResolvedValue();

      plan.start(1_000);
      vi.advanceTimersByTime(1_000);
      vi.advanceTimersByTime(3 * 60 * 60 * 1000);

      expect(run).toHaveBeenCalledTimes(4);
      plan.stop();
    } finally {
      vi.useRealTimers();
    }
  });
});
