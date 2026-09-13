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
  progress: null,
  ready: null,
  error: null,
  feedUrl: 'https://updates.agenturtool.de/stable/updates.json',
};

const READY: UpdateStatus = {
  ...STATUS,
  state: 'bereit',
  ready: {
    version: '1.4.0',
    filePath:
      '/Users/tom/Library/Application Support/AgenturTool/Updates/AgenturTool-1.4.0-arm64.dmg',
    sizeBytes: 98_000_000,
    installable: true,
  },
};

function host(overrides: Partial<UpdateHost> = {}): UpdateHost {
  return {
    status: () => STATUS,
    check: async () => STATUS,
    setAutomatic: (automatic) => ({ ...STATUS, automatic }),
    download: async () => ({ ...STATUS, state: 'laedt' }),
    cancelDownload: () => STATUS,
    install: async () => ({ ...READY, state: 'installiert' }),
    revealDownload: () => true,
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

  it('gibt den Download frei und meldet den laufenden Zustand', async () => {
    const controller = new AppUpdateController(host());

    // Die Antwort kommt sofort, mit „laedt" — nicht erst nach hundert
    // Megabyte.
    await expect(controller.download()).resolves.toMatchObject({ state: 'laedt' });
  });

  it('bricht einen Download ab', () => {
    const controller = new AppUpdateController(host());

    expect(controller.cancel().state).toBe('verfuegbar');
  });

  it('installiert und meldet, dass die Anwendung sich beendet', async () => {
    const steps: string[] = [];
    const controller = new AppUpdateController(
      host({
        install: async () => {
          steps.push('install');
          return { ...READY, state: 'installiert' };
        },
      }),
    );

    await expect(controller.install()).resolves.toMatchObject({ state: 'installiert' });
    expect(steps).toEqual(['install']);
  });

  it('zeigt das geladene Paket im Dateimanager', () => {
    const controller = new AppUpdateController(host());

    expect(controller.reveal()).toEqual({ revealed: true });
    expect(() => new AppUpdateController(host({ revealDownload: () => false })).reveal()).toThrow(
      'kein geladenes Paket',
    );
  });

  it('öffnet den Download im Browser', async () => {
    const opened: boolean[] = [];
    const controller = new AppUpdateController(
      host({
        openDownload: async () => {
          opened.push(true);
          return true;
        },
      }),
    );

    await expect(controller.open()).resolves.toEqual({ opened: true });
    expect(opened).toHaveLength(1);
  });

  it('antwortet mit 404, wenn es nichts zu laden gibt', async () => {
    const controller = new AppUpdateController(host({ openDownload: async () => false }));

    await expect(controller.open()).rejects.toThrow('kein Paket zum Laden');
    await expect(new AppUpdateController(null).open()).rejects.toThrow('kein Paket zum Laden');
  });

  it('bleibt ohne Gastgeber bei jedem Schritt sprachfähig', async () => {
    const controller = new AppUpdateController(null);

    await expect(controller.download()).resolves.toMatchObject({ state: 'nicht-unterstuetzt' });
    await expect(controller.install()).resolves.toMatchObject({ state: 'nicht-unterstuetzt' });
    expect(controller.cancel().state).toBe('nicht-unterstuetzt');
    expect(() => controller.reveal()).toThrow('kein geladenes Paket');
  });
});
