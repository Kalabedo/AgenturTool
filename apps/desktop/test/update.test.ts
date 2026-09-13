import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { DEFAULT_UPDATE_FEED_URL, updateFeedConfig } from '../src/config';
import { readUpdateState, saveUpdateState } from '../src/update/store';
import { UpdateService } from '../src/update/update-service';

/**
 * Die Updateprüfung.
 *
 * Sie ist die einzige Stelle, an der diese Anwendung von sich aus mit
 * einem fremden Rechner spricht. Entsprechend prüfen die Tests hier nicht
 * nur, ob eine Versionsnummer ankommt, sondern auch, was die Anwendung
 * einem Feed nicht glaubt: eine fremde Domain, eine Umleitung, eine
 * Antwort ohne Prüfsumme.
 */

const FEED = {
  url: 'https://updates.agenturtool.de/stable/updates.json',
  allowedHosts: ['updates.agenturtool.de', 'agenturtool.de'],
};

const SHA = 'b'.repeat(64);

function feedBody(version = '1.4.0'): string {
  return JSON.stringify({
    formatVersion: 1,
    version,
    releasedAt: '2026-09-13',
    notes: 'Schnellere Vorschau.',
    notesUrl: 'https://agenturtool.de/releases',
    downloads: {
      'macos-arm64': {
        url: `https://updates.agenturtool.de/stable/AgenturTool-${version}-arm64.dmg`,
        sizeBytes: 98_000_000,
        sha256: SHA,
      },
      'windows-x64': {
        url: `https://updates.agenturtool.de/stable/AgenturTool-${version}-x64.exe`,
        sizeBytes: 92_000_000,
        sha256: SHA,
      },
    },
  });
}

/** Eine Antwort, wie `fetch` sie liefert — ohne Netz. */
function answering(body: string, init: { status?: number; url?: string } = {}): typeof fetch {
  return (async () => {
    const response = new Response(body, {
      status: init.status ?? 200,
      headers: { 'Content-Type': 'application/json' },
    });
    // `url` ist die Adresse nach allen Umleitungen und sonst leer; ein
    // `Response` aus dem Konstruktor kennt sie nicht von selbst.
    if (init.url !== undefined) Object.defineProperty(response, 'url', { value: init.url });
    return response;
  }) as unknown as typeof fetch;
}

let stateDir = '';
const opened: string[] = [];
const logged: string[] = [];

function service(overrides: Partial<ConstructorParameters<typeof UpdateService>[0]> = {}) {
  return new UpdateService({
    currentVersion: '1.0.0',
    stateDir,
    feed: FEED,
    platform: 'darwin',
    arch: 'arm64',
    log: (message) => logged.push(message),
    openExternal: async (url) => {
      opened.push(url);
    },
    fetchImpl: answering(feedBody()),
    ...overrides,
  });
}

beforeEach(() => {
  stateDir = fs.mkdtempSync(path.join(os.tmpdir(), 'agentur-tool-update-'));
  opened.length = 0;
  logged.length = 0;
});

afterEach(() => {
  fs.rmSync(stateDir, { recursive: true, force: true });
});

describe('updateFeedConfig', () => {
  it('nimmt ohne Angabe die eingebaute Adresse', () => {
    const config = updateFeedConfig(undefined);
    expect(config.url).toBe(DEFAULT_UPDATE_FEED_URL);
    expect(config.allowedHosts).toContain('updates.agenturtool.de');
  });

  it('lässt sich abschalten', () => {
    expect(updateFeedConfig('aus').url).toBeNull();
    expect(updateFeedConfig('off').url).toBeNull();
  });

  it('erlaubt eine eigene Adresse, aber nur über HTTPS', () => {
    const config = updateFeedConfig('https://test.example.de/feed.json');
    expect(config.url).toBe('https://test.example.de/feed.json');
    // Eine Testdomain schaltet nicht nebenbei die Produktionsadressen frei.
    expect(config.allowedHosts).toEqual(['test.example.de']);

    expect(() => updateFeedConfig('http://test.example.de/feed.json')).toThrow('HTTPS');
    expect(() => updateFeedConfig('irgendwas')).toThrow('AGENTUR_TOOL_UPDATE_FEED');
  });
});

describe('UpdateService', () => {
  it('meldet eine neuere Fassung samt Paket für diesen Rechner', async () => {
    const status = await service().check();

    expect(status.state).toBe('verfuegbar');
    expect(status.available?.version).toBe('1.4.0');
    expect(status.available?.download?.url).toContain('arm64.dmg');
    expect(status.available?.download?.sha256).toBe(SHA);
    expect(status.lastCheckedAt).not.toBeNull();
  });

  it('meldet nichts, wenn die installierte Fassung die neueste ist', async () => {
    const status = await service({ currentVersion: '1.4.0' }).check();

    expect(status.state).toBe('aktuell');
    expect(status.available).toBeNull();
  });

  it('nennt eine neue Fassung auch ohne Paket für dieses System', async () => {
    // Linux wird nicht ausgeliefert. Wer trotzdem dort startet, soll von
    // der neuen Fassung erfahren — der Knopf führt dann zur Hinweisseite.
    const status = await service({ platform: 'linux', arch: 'x64' }).check();

    expect(status.state).toBe('verfuegbar');
    expect(status.available?.download).toBeNull();

    const updates = service({ platform: 'linux', arch: 'x64' });
    await updates.check();
    expect(await updates.openDownload()).toBe(true);
    expect(opened.at(-1)).toBe('https://agenturtool.de/releases');
  });

  it('öffnet das Paket im Browser und lädt nichts selbst', async () => {
    const updates = service();
    await updates.check();

    expect(await updates.openDownload()).toBe(true);
    expect(opened).toEqual(['https://updates.agenturtool.de/stable/AgenturTool-1.4.0-arm64.dmg']);
  });

  it('öffnet nichts, solange es nichts zu laden gibt', async () => {
    const updates = service({ currentVersion: '2.0.0' });
    await updates.check();

    expect(await updates.openDownload()).toBe(false);
    expect(opened).toEqual([]);
  });

  it('macht aus einer gescheiterten Prüfung keinen Absturz', async () => {
    const status = await service({
      fetchImpl: answering('nicht gefunden', { status: 404 }),
    }).check();

    expect(status.state).toBe('fehler');
    expect(status.error).toContain('404');
    expect(status.available).toBeNull();
  });

  it('weist einen Feed ab, der auf eine fremde Domain umgeleitet wurde', async () => {
    const status = await service({
      fetchImpl: answering(feedBody(), { url: 'https://beispiel.invalid/feed.json' }),
    }).check();

    expect(status.state).toBe('fehler');
    expect(status.error).toContain('umgeleitet');
  });

  it('weist einen Feed mit unlesbarem Inhalt ab', async () => {
    const status = await service({ fetchImpl: answering('<html>Wartung</html>') }).check();

    expect(status.state).toBe('fehler');
    expect(status.error).toContain('JSON');
  });

  it('sagt auf Deutsch, dass kein Netz da ist', async () => {
    // Der häufigste Fehlerfall überhaupt — ein Rechner ohne Verbindung.
    // In den Einstellungen soll dann nicht „fetch failed" stehen.
    const offline = (async () => {
      throw new TypeError('fetch failed');
    }) as unknown as typeof fetch;
    const status = await service({ fetchImpl: offline }).check();

    expect(status.state).toBe('fehler');
    expect(status.error).toBe('Der Updatefeed ist nicht erreichbar (updates.agenturtool.de).');
  });

  it('prüft nicht öfter als einmal in 24 Stunden', async () => {
    const updates = service();
    expect(updates.due()).toBe(true);

    await updates.check();
    expect(updates.due()).toBe(false);

    // Derselbe Zustand einen Tag später — und zwar über einen Neustart
    // hinweg, sonst bräuchte es die Datei gar nicht.
    const morgen = new UpdateService({
      currentVersion: '1.0.0',
      stateDir,
      feed: FEED,
      platform: 'darwin',
      arch: 'arm64',
      log: () => undefined,
      openExternal: async () => undefined,
      now: () => new Date(Date.now() + 25 * 60 * 60 * 1000),
    });
    expect(morgen.due()).toBe(true);
    // Der gemerkte Feed steht sofort, ohne eine einzige Anfrage.
    expect(morgen.status().available?.version).toBe('1.4.0');
  });

  it('prüft nicht, wenn der Benutzer es abgestellt hat', async () => {
    const updates = service();
    const status = updates.setAutomatic(false);

    expect(status.automatic).toBe(false);
    expect(updates.due()).toBe(false);
    // Die Entscheidung überlebt den Neustart.
    expect(readUpdateState(stateDir, FEED.allowedHosts).automatic).toBe(false);
  });

  it('prüft nichts, wenn die Umgebung die Prüfung abgeschaltet hat', async () => {
    const updates = service({ feed: { url: null, allowedHosts: [] } });
    const status = await updates.check();

    expect(status.state).toBe('abgeschaltet');
    expect(updates.due()).toBe(false);
  });
});

describe('Zustandsdatei', () => {
  it('fällt auf die Vorbelegung zurück, wenn es sie nicht gibt', () => {
    const state = readUpdateState(path.join(stateDir, 'leer'), FEED.allowedHosts);

    expect(state).toEqual({ automatic: true, lastCheckedAt: null, lastFeed: null });
  });

  it('vergisst einen gemerkten Feed, dessen Host nicht mehr erlaubt ist', async () => {
    const updates = service();
    await updates.check();
    expect(readUpdateState(stateDir, FEED.allowedHosts).lastFeed).not.toBeNull();

    expect(readUpdateState(stateDir, ['andere.example.de']).lastFeed).toBeNull();
  });

  it('übersteht eine beschädigte Datei', () => {
    saveUpdateState(stateDir, { automatic: false, lastCheckedAt: null, lastFeed: null });
    fs.writeFileSync(path.join(stateDir, 'aktualisierung.json'), '{kaputt', 'utf8');

    expect(readUpdateState(stateDir, FEED.allowedHosts).automatic).toBe(true);
  });
});
