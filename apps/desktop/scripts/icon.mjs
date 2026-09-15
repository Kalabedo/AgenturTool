/**
 * `node scripts/icon.mjs` — das Programmsymbol aus dem gemeinsamen
 * Privatura-Markenasset in den Build-Ordner kopieren.
 *
 * Die 1024-Pixel-PNG ist zugleich die unveränderte Quelle für macOS und
 * Windows. electron-builder leitet daraus `.icns` und `.ico` ab.
 */
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const desktopDir = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const source = path.resolve(desktopDir, '../web/public/privatura-icon.png');
const target = path.join(desktopDir, 'build/icon.png');

if (!fs.existsSync(source)) {
  throw new Error(`Das Privatura-Icon fehlt: ${source}`);
}

fs.mkdirSync(path.dirname(target), { recursive: true });
fs.copyFileSync(source, target);
process.stdout.write(
  `${path.relative(desktopDir, target)} aus ${path.relative(desktopDir, source)} ` +
    `(${String(Math.round(fs.statSync(target).size / 1024))} kB)\n`,
);
