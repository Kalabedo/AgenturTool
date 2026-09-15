import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { parseUpdateFeed } from '@privatura/shared';
import {
  DEFAULT_BASE_URL,
  buildFeed,
  collectPackages,
  parseFeedArguments,
} from '../scripts/updatefeed.mjs';

/**
 * Die Feed-Datei der Releasepipeline.
 *
 * Der entscheidende Test ist der letzte: Was die Pipeline schreibt, muss
 * die Anwendung annehmen. Beides von Hand gleichzuhalten ginge genau
 * einmal gut — bis jemand ein Feld umbenennt und es erst der erste Kunde
 * merkt, bei dem kein Update mehr ankommt.
 */

let dir = '';

beforeEach(() => {
  dir = fs.mkdtempSync(path.join(os.tmpdir(), 'privatura-feed-'));
});

afterEach(() => {
  fs.rmSync(dir, { recursive: true, force: true });
});

describe('parseFeedArguments', () => {
  it('verlangt Verzeichnis und Version', () => {
    expect(() => parseFeedArguments([])).toThrow('--dir fehlt');
    expect(() => parseFeedArguments(['--dir', 'dist'])).toThrow('--version fehlt');
  });

  it('nimmt nur stabile Versionen und Datumsangaben an', () => {
    expect(() => parseFeedArguments(['--dir', 'dist', '--version', 'v1.4.0'])).toThrow('SemVer');
    expect(() =>
      parseFeedArguments(['--dir', 'dist', '--version', '1.4.0', '--released-at', 'heute']),
    ).toThrow('JJJJ-MM-TT');
  });

  it('lässt keine unverschlüsselte Downloadadresse zu', () => {
    expect(() =>
      parseFeedArguments(['--dir', 'dist', '--version', '1.4.0', '--base-url', 'http://x.de']),
    ).toThrow('HTTPS');
  });

  it('kennt eine Vorbelegung für die Downloadadresse', () => {
    const options = parseFeedArguments(['--dir', 'dist', '--version', '1.4.0']);
    expect(options.baseUrl).toBe(DEFAULT_BASE_URL);
  });

  it('weist unbekannte Optionen ab, statt sie zu übergehen', () => {
    expect(() => parseFeedArguments(['--alles'])).toThrow('Unbekannte Option');
  });
});

describe('collectPackages', () => {
  it('findet genau die Pakete dieser Version', () => {
    fs.writeFileSync(path.join(dir, 'Privatura-1.4.0-arm64.dmg'), 'mac-arm');
    fs.writeFileSync(path.join(dir, 'Privatura-1.4.0-x64.dmg'), 'mac-intel');
    fs.writeFileSync(path.join(dir, 'Privatura-1.4.0-x64.exe'), 'windows');
    // Reste eines früheren Laufs gehören nicht in diesen Feed.
    fs.writeFileSync(path.join(dir, 'Privatura-1.3.0-x64.exe'), 'alt');
    fs.writeFileSync(path.join(dir, 'SHA256SUMS'), 'egal');

    const files = collectPackages(dir, '1.4.0');

    expect(files.map((file) => file.platform)).toEqual(['macos-arm64', 'macos-x64']);
    expect(files[0].sizeBytes).toBe(7);
    // sha256 von „mac-arm"
    expect(files[0].sha256).toMatch(/^[0-9a-f]{64}$/u);
  });

  it('meldet nichts, wenn nichts da ist', () => {
    expect(collectPackages(dir, '1.4.0')).toEqual([]);
  });
});

describe('buildFeed', () => {
  it('baut Adressen aus Grundadresse und Dateinamen', () => {
    const feed = buildFeed({
      version: '1.4.0',
      releasedAt: '2026-09-13',
      notes: 'Schnellere Vorschau.',
      notesUrl: null,
      baseUrl: 'https://updates.privatura.de/stable/',
      files: [
        {
          platform: 'macos-arm64',
          name: 'Privatura-1.4.0-arm64.dmg',
          sizeBytes: 98_000_000,
          sha256: 'a'.repeat(64),
        },
      ],
    });

    expect(feed.downloads['macos-arm64'].url).toBe(
      'https://updates.privatura.de/stable/Privatura-1.4.0-arm64.dmg',
    );
    expect(feed.notesUrl).toBe('https://privatura.de/releases/1.4.0');
  });

  it('verweigert einen Feed ohne ein einziges Paket', () => {
    expect(() =>
      buildFeed({
        version: '1.4.0',
        releasedAt: null,
        notes: null,
        notesUrl: null,
        baseUrl: DEFAULT_BASE_URL,
        files: [],
      }),
    ).toThrow('Keine Releasedatei');
  });

  it('erzeugt einen Feed, den die Anwendung auch annimmt', () => {
    fs.writeFileSync(path.join(dir, 'Privatura-1.4.0-arm64.dmg'), 'mac-arm');
    fs.writeFileSync(path.join(dir, 'Privatura-1.4.0-x64.exe'), 'windows');

    const feed = buildFeed({
      version: '1.4.0',
      releasedAt: '2026-09-13',
      notes: 'Schnellere Vorschau.',
      notesUrl: null,
      baseUrl: DEFAULT_BASE_URL,
      files: collectPackages(dir, '1.4.0'),
    });

    // Derselbe Weg wie in der Anwendung: durch die Prüfung aus `shared`,
    // mit den Hosts, die dort erlaubt sind.
    const parsed = parseUpdateFeed(JSON.parse(JSON.stringify(feed)), [
      'updates.privatura.de',
      'privatura.de',
    ]);

    expect(parsed.version).toBe('1.4.0');
    expect(Object.keys(parsed.downloads)).toEqual(['macos-arm64']);
  });
});
