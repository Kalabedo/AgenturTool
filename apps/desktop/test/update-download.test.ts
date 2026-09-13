import crypto from 'node:crypto';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { downloadPackage, pruneDownloads } from '../src/update/download';

/**
 * Der Download eines Pakets.
 *
 * Hier hängt mehr dran als ein Fortschrittsbalken: Was diese Funktion
 * durchlässt, wird anschließend über die bestehende Installation
 * geschrieben. Die Tests halten deshalb vor allem fest, was sie *nicht*
 * durchlässt — und dass sie im Fehlerfall nichts zurücklässt, das wie ein
 * fertiges Paket aussieht.
 */

const BODY = Buffer.from('ein sehr kleines Installationspaket');
const SHA = crypto.createHash('sha256').update(BODY).digest('hex');

/** Eine Antwort, wie `fetch` sie liefert — ohne Netz. */
function serving(
  body: Buffer | null,
  init: { status?: number; contentLength?: string | null } = {},
): typeof fetch {
  return (async () => {
    const headers = new Headers();
    const length =
      init.contentLength === undefined ? String(body?.byteLength ?? 0) : init.contentLength;
    if (length !== null) headers.set('Content-Length', length);

    return new Response(body === null ? null : new Uint8Array(body), {
      status: init.status ?? 200,
      headers,
    });
  }) as unknown as typeof fetch;
}

let dir = '';
let target = '';

beforeEach(() => {
  dir = fs.mkdtempSync(path.join(os.tmpdir(), 'agentur-tool-dl-'));
  target = path.join(dir, 'AgenturTool-1.4.0-arm64.dmg');
});

afterEach(() => {
  fs.rmSync(dir, { recursive: true, force: true });
});

function request(overrides: Record<string, unknown> = {}) {
  const seen: number[] = [];
  return {
    seen,
    options: {
      url: 'https://updates.agenturtool.de/stable/AgenturTool-1.4.0-arm64.dmg',
      expectedSha256: SHA,
      expectedSizeBytes: BODY.byteLength,
      targetFile: target,
      onProgress: (transferred: number) => seen.push(transferred),
      fetchImpl: serving(BODY),
      ...overrides,
    } as Parameters<typeof downloadPackage>[0],
  };
}

describe('downloadPackage', () => {
  it('legt das geprüfte Paket ab und meldet den Fortschritt', async () => {
    const { options, seen } = request();

    const file = await downloadPackage(options);

    expect(file).toBe(target);
    expect(fs.readFileSync(target)).toEqual(BODY);
    expect(seen.at(-1)).toBe(BODY.byteLength);
  });

  it('verwirft ein Paket mit falscher Prüfsumme', async () => {
    const { options } = request({ expectedSha256: 'f'.repeat(64) });

    await expect(downloadPackage(options)).rejects.toThrow('Prüfsumme');
    // Nichts bleibt liegen — auch keine halbe Datei unter anderem Namen.
    expect(fs.readdirSync(dir)).toEqual([]);
  });

  it('weist eine angekündigte Größe ab, die nicht zum Feed passt', async () => {
    const { options } = request({ fetchImpl: serving(BODY, { contentLength: '999999' }) });

    await expect(downloadPackage(options)).rejects.toThrow('Byte groß');
    expect(fs.readdirSync(dir)).toEqual([]);
  });

  it('bricht ab, sobald mehr kommt als angekündigt', async () => {
    // Der Server schickt mehr, als der Feed versprochen hat. Ohne diese
    // Grenze schrieben wir, solange Platz ist.
    const { options } = request({
      expectedSizeBytes: 5,
      fetchImpl: serving(BODY, { contentLength: null }),
    });

    await expect(downloadPackage(options)).rejects.toThrow('größer als angekündigt');
    expect(fs.readdirSync(dir)).toEqual([]);
  });

  it('erkennt ein unvollständiges Paket', async () => {
    const { options } = request({
      expectedSizeBytes: BODY.byteLength + 10,
      fetchImpl: serving(BODY, { contentLength: null }),
    });

    await expect(downloadPackage(options)).rejects.toThrow('unvollständig');
  });

  it('macht aus einer Fehlerseite keinen Installer', async () => {
    const { options } = request({ fetchImpl: serving(Buffer.from('weg'), { status: 404 }) });

    await expect(downloadPackage(options)).rejects.toThrow('HTTP 404');
  });

  it('lässt sich abbrechen', async () => {
    const controller = new AbortController();
    controller.abort();
    const { options } = request({ signal: controller.signal });

    await expect(downloadPackage(options)).rejects.toThrow('abgebrochen');
    expect(fs.readdirSync(dir)).toEqual([]);
  });
});

describe('pruneDownloads', () => {
  it('behält genau das eine Paket, das noch zählt', () => {
    fs.writeFileSync(path.join(dir, 'AgenturTool-1.4.0-arm64.dmg'), 'neu');
    fs.writeFileSync(path.join(dir, 'AgenturTool-1.3.0-arm64.dmg'), 'alt');
    fs.writeFileSync(path.join(dir, 'AgenturTool-1.4.0-arm64.dmg.teil'), 'halb');

    pruneDownloads(dir, 'AgenturTool-1.4.0-arm64.dmg');

    expect(fs.readdirSync(dir)).toEqual(['AgenturTool-1.4.0-arm64.dmg']);
  });

  it('räumt alles weg, wenn nichts mehr zählt', () => {
    fs.writeFileSync(path.join(dir, 'AgenturTool-1.3.0-arm64.dmg'), 'alt');

    pruneDownloads(dir, null);

    expect(fs.readdirSync(dir)).toEqual([]);
  });

  it('stört sich nicht an einem Verzeichnis, das es nicht gibt', () => {
    expect(() => pruneDownloads(path.join(dir, 'weg'), null)).not.toThrow();
  });
});
