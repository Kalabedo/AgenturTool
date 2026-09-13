import { describe, expect, it } from 'vitest';
import type { UpdateStatus } from '@agentur-tool/shared';
import { AppUpdateController } from '../src/app-update/app-update.controller';
import type { UpdateHost } from '../src/app-update/update-host';

/**
 * Die Brücke zwischen Hauptprozess und Oberfläche.
 *
 * Geprüft wird vor allem der Fall ohne Gastgeber: Im Browserbetrieb gibt
 * es keine Installation, die veralten könnte, und die Oberfläche darf
 * daran nicht hängenbleiben.
 */

const STATUS: UpdateStatus = {
  state: 'verfuegbar',
  currentVersion: '1.0.0',
  automatic: true,
  lastCheckedAt: '2026-09-13T08:00:00.000Z',
  available: {
    version: '1.4.0',
    releasedAt: '2026-09-13',
    notes: 'Schnellere Vorschau.',
    notesUrl: null,
    download: {
      url: 'https://updates.agenturtool.de/stable/AgenturTool-1.4.0-arm64.dmg',
      sizeBytes: 98_000_000,
      sha256: 'c'.repeat(64),
    },
  },
  error: null,
  feedUrl: 'https://updates.agenturtool.de/stable/updates.json',
};

function host(overrides: Partial<UpdateHost> = {}): UpdateHost {
  return {
    status: () => STATUS,
    check: async () => STATUS,
    setAutomatic: (automatic) => ({ ...STATUS, automatic }),
    openDownload: async () => true,
    ...overrides,
  };
}

describe('Updatezustand', () => {
  it('reicht den Zustand des Hauptprozesses durch', async () => {
    const controller = new AppUpdateController(host());

    expect(controller.status().available?.version).toBe('1.4.0');
    expect((await controller.check()).state).toBe('verfuegbar');
  });

  it('meldet ohne Gastgeber „nicht unterstützt" statt eines Fehlers', async () => {
    const controller = new AppUpdateController(null);

    expect(controller.status()).toMatchObject({ state: 'nicht-unterstuetzt', available: null });
    expect((await controller.check()).state).toBe('nicht-unterstuetzt');
    expect(controller.settings({ automatic: true }).state).toBe('nicht-unterstuetzt');
  });

  it('gibt die Einstellung weiter', () => {
    const controller = new AppUpdateController(host());

    expect(controller.settings({ automatic: false }).automatic).toBe(false);
  });

  it('öffnet den Download', async () => {
    const opened: boolean[] = [];
    const controller = new AppUpdateController(
      host({
        openDownload: async () => {
          opened.push(true);
          return true;
        },
      }),
    );

    await expect(controller.download()).resolves.toEqual({ opened: true });
    expect(opened).toHaveLength(1);
  });

  it('antwortet mit 404, wenn es nichts zu laden gibt', async () => {
    const controller = new AppUpdateController(host({ openDownload: async () => false }));

    await expect(controller.download()).rejects.toThrow('kein Paket zum Laden');
    await expect(new AppUpdateController(null).download()).rejects.toThrow('kein Paket zum Laden');
  });
});
