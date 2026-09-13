/**
 * Das Paket holen — und ihm erst danach glauben.
 *
 * Der Download läuft im Hauptprozess, nicht im Fenster: Dort gilt die
 * Sperre gegen jede Anfrage außerhalb der Rückschleife (`network.ts`, D36),
 * und sie soll gelten bleiben. Geschrieben wird nach `Updates/` neben dem
 * übrigen Installationszustand, nicht in den Datenordner — ein
 * heruntergeladener Installer ist kein Geschäftsdatum und gehört in kein
 * Backup.
 *
 * Drei Dinge machen aus einer geladenen Datei ein vertrauenswürdiges Paket:
 *
 * 1. **Die Größe** aus dem Feed. Sie begrenzt auch den Schreibvorgang: Wer
 *    mehr schickt als angekündigt, wird mitten im Strom abgewiesen, statt
 *    die Platte zu füllen.
 * 2. **Die SHA-256** aus dem Feed. Sie schließt den Weg über einen
 *    fehlerhaften Proxy oder einen halben Download.
 * 3. **Die Signatur des Betriebssystems** (`install.ts`). Sie ist die
 *    eigentliche Sicherung: Feed und Prüfsumme kommen von derselben
 *    Domain — wer sie fälschen kann, fälscht beide. Die Signatur kann er
 *    nicht fälschen, ohne den privaten Schlüssel zu haben.
 *
 * Geschrieben wird in eine `.teil`-Datei und erst nach allen Prüfungen
 * umbenannt. Ein abgebrochener Lauf hinterlässt damit nie etwas, das wie
 * ein fertiges Paket aussieht.
 */
import crypto from 'node:crypto';
import fs from 'node:fs';
import path from 'node:path';
import { Readable } from 'node:stream';
import { pipeline } from 'node:stream/promises';

export interface DownloadRequest {
  url: string;
  expectedSha256: string;
  expectedSizeBytes: number;
  /** Zielpfad der fertigen Datei. */
  targetFile: string;
  onProgress: (transferredBytes: number) => void;
  signal?: AbortSignal;
  fetchImpl?: typeof fetch;
}

/** Die Endung der noch unfertigen Datei. */
const PARTIAL_SUFFIX = '.teil';

/**
 * Lädt das Paket und gibt seinen Pfad zurück.
 *
 * Wirft mit einer deutschen Meldung, sobald etwas nicht zusammenpasst; der
 * Aufrufer legt sie in den Zustand, und die Oberfläche zeigt sie an.
 */
export async function downloadPackage(request: DownloadRequest): Promise<string> {
  const partial = `${request.targetFile}${PARTIAL_SUFFIX}`;
  fs.mkdirSync(path.dirname(request.targetFile), { recursive: true });
  fs.rmSync(partial, { force: true });

  const get = request.fetchImpl ?? fetch;
  let response: Response;
  try {
    response = await get(request.url, {
      method: 'GET',
      redirect: 'follow',
      headers: { Accept: 'application/octet-stream' },
      signal: request.signal,
    });
  } catch (error: unknown) {
    throw new Error(`Der Download ist fehlgeschlagen: ${reason(error)}`);
  }

  if (!response.ok) {
    throw new Error(`Der Download antwortete mit HTTP ${String(response.status)}.`);
  }
  if (response.body === null) {
    throw new Error('Der Download kam ohne Inhalt zurück.');
  }

  // Wenn der Server eine Größe nennt, muss sie die des Feeds sein. Ein
  // Paket, das anders groß ist als angekündigt, ist nicht das erwartete —
  // das steht fest, bevor das erste Byte auf der Platte liegt.
  const declared = response.headers.get('content-length');
  if (declared !== null && Number(declared) !== request.expectedSizeBytes) {
    throw new Error(
      `Das Paket ist ${declared} Byte groß, erwartet waren ` +
        `${String(request.expectedSizeBytes)}.`,
    );
  }

  const hash = crypto.createHash('sha256');
  let transferred = 0;

  try {
    await pipeline(
      Readable.fromWeb(response.body as Parameters<typeof Readable.fromWeb>[0]),
      async function* (source: AsyncIterable<Buffer>) {
        for await (const chunk of source) {
          transferred += chunk.byteLength;
          if (transferred > request.expectedSizeBytes) {
            throw new Error('Der Download ist größer als angekündigt und wurde abgebrochen.');
          }
          hash.update(chunk);
          request.onProgress(transferred);
          yield chunk;
        }
      },
      fs.createWriteStream(partial),
      { signal: request.signal },
    );
  } catch (error: unknown) {
    fs.rmSync(partial, { force: true });
    if (request.signal?.aborted === true) {
      throw new Error('Der Download wurde abgebrochen.');
    }
    throw new Error(`Der Download ist fehlgeschlagen: ${reason(error)}`);
  }

  if (transferred !== request.expectedSizeBytes) {
    fs.rmSync(partial, { force: true });
    throw new Error(
      `Das Paket ist unvollständig: ${String(transferred)} von ` +
        `${String(request.expectedSizeBytes)} Byte.`,
    );
  }

  const digest = hash.digest('hex');
  if (digest !== request.expectedSha256) {
    fs.rmSync(partial, { force: true });
    throw new Error(
      'Die Prüfsumme des geladenen Pakets stimmt nicht mit dem Updatefeed ' +
        'überein. Das Paket wurde verworfen.',
    );
  }

  // Erst jetzt trägt die Datei ihren richtigen Namen.
  fs.rmSync(request.targetFile, { force: true });
  fs.renameSync(partial, request.targetFile);
  return request.targetFile;
}

/**
 * Räumt das Verzeichnis auf.
 *
 * Aufgerufen beim Start und nach jedem erfolgreichen Download: Ein Paket,
 * das nicht mehr neuer ist als die installierte Fassung, ist entweder
 * eingespielt oder überholt — in beiden Fällen sind es hundert Megabyte,
 * die niemand mehr braucht. `.teil`-Dateien gehen immer.
 *
 * @param keep Dateiname, der bleiben soll (das aktuell bereite Paket).
 */
export function pruneDownloads(directory: string, keep: string | null): void {
  let entries: string[];
  try {
    entries = fs.readdirSync(directory);
  } catch {
    return;
  }

  for (const entry of entries) {
    if (entry === keep) continue;
    try {
      fs.rmSync(path.join(directory, entry), { force: true, recursive: true });
    } catch {
      // Eine Datei, die sich nicht löschen lässt — etwa weil sie gerade
      // installiert wird —, ist kein Grund, den Start zu stören.
    }
  }
}

function reason(error: unknown): string {
  if (error instanceof Error) {
    return error.name === 'AbortError' ? 'abgebrochen' : error.message;
  }
  return String(error);
}
