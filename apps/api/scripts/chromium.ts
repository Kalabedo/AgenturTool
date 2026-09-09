/**
 * `pnpm chromium:install` — lädt den Browser für die PDF-Erzeugung.
 *
 * Die Anwendung benutzt `puppeteer-core` und bringt deshalb kein Chromium
 * mit (D32). Im Docker-Image kommt es aus der Paketverwaltung; auf einem
 * Entwicklungsrechner ist es der eine Schritt, der zwischen `pnpm install`
 * und einem fertigen PDF fehlt. Dieses Skript ist die Antwort auf die
 * Fehlermeldung „Es wurde kein Chromium gefunden".
 *
 * Geladen wird nach `~/.cache/puppeteer` (oder `PUPPETEER_CACHE_DIR`) —
 * genau dorthin, wo `findChromiumExecutable` von sich aus nachsieht. Es
 * bleibt also nichts in der `.env` einzutragen.
 */
import { Browser, detectBrowserPlatform, install, resolveBuildId } from '@puppeteer/browsers';
import { findChromiumExecutable, puppeteerCacheDir } from '../src/pdf/chromium';

const force = process.argv.includes('--force');

async function main(): Promise<void> {
  // Erst nachsehen, ob es überhaupt etwas zu tun gibt — und zwar mit
  // derselben Suche, die auch der Server benutzt. Ein Chromium aus der
  // Paketverwaltung ist genauso gut wie ein geladenes; 150 MB dafür zu
  // holen wäre reine Verschwendung.
  const existing = findChromiumExecutable(process.env.PUPPETEER_EXECUTABLE_PATH);
  if (existing !== null && !force) {
    console.log(`Chromium ist bereits vorhanden: ${existing}`);
    console.log('Trotzdem laden: pnpm chromium:install --force');
    return;
  }

  const platform = detectBrowserPlatform();
  if (platform === undefined) {
    throw new Error(
      'Für diese Plattform gibt es keinen Download. Bitte Chromium über die ' +
        'Paketverwaltung installieren und PUPPETEER_EXECUTABLE_PATH in der .env setzen.',
    );
  }

  const cacheDir = puppeteerCacheDir();

  // Beide Schritte gehen ins Netz. Ohne diese Zeile stünde das Terminal beim
  // ersten von beiden minutenlang still — und wer hinter einem Proxy sitzt,
  // wüsste nicht einmal, worauf gewartet wird.
  console.log('Suche die aktuelle Chromium-Version …');
  const buildId = await resolveBuildId(Browser.CHROME, platform, 'stable');
  console.log(`Lade Chromium ${buildId} (${platform}) nach ${cacheDir} …`);

  // Der Fortschritt wird in ganzen Zehnteln gemeldet, nicht als Fortschritts-
  // balken: Die Ausgabe landet auch in Protokollen und CI-Ausgaben, und dort
  // ist eine Zeile je Schritt lesbar, tausend überschriebene nicht.
  let reported = -1;
  const installed = await install({
    browser: Browser.CHROME,
    buildId,
    cacheDir,
    downloadProgressCallback: (downloadedBytes: number, totalBytes: number) => {
      if (totalBytes <= 0) return;
      const step = Math.floor((downloadedBytes / totalBytes) * 10) * 10;
      if (step <= reported) return;
      reported = step;
      console.log(`  ${step} %`);
    },
  });

  console.log(`Fertig: ${installed.executablePath}`);
  console.log('Die Anwendung findet den Browser dort von selbst.');
}

main().catch((error: unknown) => {
  // Der häufigste Fehler ist kein Programmfehler, sondern ein Netz, das den
  // Download nicht durchlässt (Proxy, Firmennetz). Deshalb steht neben der
  // Meldung immer auch der Weg, der ohne Download auskommt.
  console.error('Chromium konnte nicht geladen werden.');
  console.error(error instanceof Error ? error.message : error);
  console.error(
    'Alternative: Chromium über die Paketverwaltung installieren und ' +
      'PUPPETEER_EXECUTABLE_PATH in der .env auf die ausführbare Datei setzen.',
  );
  process.exitCode = 1;
});
