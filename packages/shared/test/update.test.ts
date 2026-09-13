import { describe, expect, it } from 'vitest';
import {
  compareVersions,
  isNewerVersion,
  isStableVersion,
  parseUpdateFeed,
  updatePlatform,
  type UpdateFeed,
} from '../src/index.js';

const HOSTS = ['updates.agenturtool.de', 'agenturtool.de'];

const SHA = 'a'.repeat(64);

function feed(overrides: Record<string, unknown> = {}): Record<string, unknown> {
  return {
    formatVersion: 1,
    version: '1.4.0',
    releasedAt: '2026-09-13',
    notes: 'Verbesserte Exporte und Fehlerkorrekturen.',
    notesUrl: 'https://agenturtool.de/releases/1.4.0',
    downloads: {
      'macos-arm64': {
        url: 'https://updates.agenturtool.de/stable/AgenturTool-1.4.0-arm64.dmg',
        sizeBytes: 123_456_789,
        sha256: SHA,
      },
    },
    ...overrides,
  };
}

/**
 * Der Versionsvergleich.
 *
 * Er entscheidet, ob ein Banner erscheint. Ein Vergleich als Zeichenkette
 * hielte „1.10.0" für älter als „1.9.0" — der Fehler fiele erst beim
 * zehnten Release auf, und dann bekäme niemand mehr eine Meldung.
 */
describe('compareVersions', () => {
  it('vergleicht die drei Zahlen und nicht den Text', () => {
    expect(compareVersions('1.10.0', '1.9.0')).toBe(1);
    expect(compareVersions('1.9.0', '1.10.0')).toBe(-1);
    expect(compareVersions('2.0.0', '1.99.99')).toBe(1);
    expect(compareVersions('1.2.3', '1.2.3')).toBe(0);
  });

  it('hält Unlesbares für älter als alles', () => {
    expect(isNewerVersion('1.4.0-beta.1', '1.0.0')).toBe(false);
    expect(isNewerVersion('', '1.0.0')).toBe(false);
    expect(isNewerVersion('v1.4.0', '1.0.0')).toBe(false);
  });

  it('erkennt stabile Fassungen', () => {
    expect(isStableVersion('0.1.0')).toBe(true);
    expect(isStableVersion('1.4.0')).toBe(true);
    expect(isStableVersion('01.4.0')).toBe(false);
    expect(isStableVersion('1.4')).toBe(false);
  });
});

describe('updatePlatform', () => {
  it('kennt die drei gebauten Pakete', () => {
    expect(updatePlatform('darwin', 'arm64')).toBe('macos-arm64');
    expect(updatePlatform('darwin', 'x64')).toBe('macos-x64');
    expect(updatePlatform('win32', 'x64')).toBe('windows-x64');
  });

  it('meldet für alles andere kein Paket', () => {
    expect(updatePlatform('linux', 'x64')).toBeNull();
    // Windows ARM64 führt das x64-Paket über die Emulation aus; ein eigenes
    // Paket gibt es nicht, und ein falsches anzubieten wäre schlimmer als
    // gar keines.
    expect(updatePlatform('win32', 'arm64')).toBeNull();
  });
});

/**
 * Der Feed ist der einzige Text, der von außerhalb des Rechners in diese
 * Anwendung kommt. Was hier durchkommt, landet in der Oberfläche und in
 * einem `openExternal` — deshalb prüft jeder Fall hier eine Zusage und
 * nicht bloß ein Schema.
 */
describe('parseUpdateFeed', () => {
  it('liest einen vollständigen Feed', () => {
    const parsed: UpdateFeed = parseUpdateFeed(feed(), HOSTS);

    expect(parsed.version).toBe('1.4.0');
    expect(parsed.releasedAt).toBe('2026-09-13');
    expect(parsed.notes).toBe('Verbesserte Exporte und Fehlerkorrekturen.');
    expect(parsed.downloads['macos-arm64']?.sha256).toBe(SHA);
    expect(parsed.downloads['windows-x64']).toBeUndefined();
  });

  it('nimmt fehlende Hinweise hin', () => {
    const parsed = parseUpdateFeed(feed({ notes: undefined, notesUrl: undefined }), HOSTS);
    expect(parsed.notes).toBeNull();
    expect(parsed.notesUrl).toBeNull();
  });

  it('weist fremde Hosts ab', () => {
    const fremd = feed({
      downloads: {
        'macos-arm64': {
          url: 'https://beispiel.invalid/AgenturTool.dmg',
          sizeBytes: 1,
          sha256: SHA,
        },
      },
    });
    expect(() => parseUpdateFeed(fremd, HOSTS)).toThrow('nicht erlaubten Host');
  });

  it('weist unverschlüsselte Adressen ab', () => {
    const unsicher = feed({
      downloads: {
        'macos-arm64': {
          url: 'http://updates.agenturtool.de/AgenturTool.dmg',
          sizeBytes: 1,
          sha256: SHA,
        },
      },
    });
    expect(() => parseUpdateFeed(unsicher, HOSTS)).toThrow('nicht HTTPS');
  });

  it('besteht auf Version, Datum, Größe und Prüfsumme', () => {
    expect(() => parseUpdateFeed(feed({ version: 'neueste' }), HOSTS)).toThrow('stabile Version');
    expect(() => parseUpdateFeed(feed({ releasedAt: 'gestern' }), HOSTS)).toThrow('JJJJ-MM-TT');
    expect(() =>
      parseUpdateFeed(
        feed({
          downloads: { 'macos-arm64': { url: 'https://agenturtool.de/a.dmg', sha256: SHA } },
        }),
        HOSTS,
      ),
    ).toThrow('Dateigröße');
    expect(() =>
      parseUpdateFeed(
        feed({
          downloads: {
            'macos-arm64': { url: 'https://agenturtool.de/a.dmg', sizeBytes: 1, sha256: 'kurz' },
          },
        }),
        HOSTS,
      ),
    ).toThrow('Prüfsumme');
  });

  it('weist ein anderes Feed-Format ab, statt es zu raten', () => {
    expect(() => parseUpdateFeed(feed({ formatVersion: 2 }), HOSTS)).toThrow('Feed-Format');
  });

  it('weist einen Feed ohne bekanntes Paket ab', () => {
    expect(() => parseUpdateFeed(feed({ downloads: { 'linux-x64': {} } }), HOSTS)).toThrow(
      'kein einziges bekanntes Paket',
    );
  });

  it('begrenzt die Länge der Hinweise', () => {
    expect(() => parseUpdateFeed(feed({ notes: 'x'.repeat(601) }), HOSTS)).toThrow('länger als');
  });

  it('weist alles ab, was kein Objekt ist', () => {
    expect(() => parseUpdateFeed('1.4.0', HOSTS)).toThrow('kein JSON-Objekt');
    expect(() => parseUpdateFeed([feed()], HOSTS)).toThrow('kein JSON-Objekt');
  });
});
