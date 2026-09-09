/**
 * Das Auffinden des Browsers.
 *
 * Geprüft wird der Zwischenspeicher, in den `pnpm chromium:install` lädt:
 * Er ist die Stufe, die auf einem Entwicklungsrechner ohne Systempaket
 * darüber entscheidet, ob ein PDF entsteht. Die Suche in den festen
 * Systempfaden bleibt außen vor — sie hinge davon ab, was auf der Maschine
 * installiert ist, auf der der Test läuft.
 */
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { findChromiumExecutable, findChromiumInCache } from '../src/pdf/chromium';

let cacheDir: string;

/** Legt eine Chromium-Attrappe im Aufbau des Zwischenspeichers an. */
function fakeInstall(browser: string, build: string, ...relative: string[]): string {
  const executable = path.join(cacheDir, browser, build, ...relative);
  fs.mkdirSync(path.dirname(executable), { recursive: true });
  fs.writeFileSync(executable, '');
  return executable;
}

beforeEach(() => {
  cacheDir = fs.mkdtempSync(path.join(os.tmpdir(), 'chromium-cache-'));
});

afterEach(() => {
  fs.rmSync(cacheDir, { recursive: true, force: true });
});

describe('Chromium im Zwischenspeicher', () => {
  it('meldet nichts, solange nichts geladen wurde', () => {
    expect(findChromiumInCache(cacheDir)).toBeNull();
  });

  it('findet eine geladene Linux-Version', () => {
    const executable = fakeInstall('chrome', 'linux64-140.0.7339.82', 'chrome-linux64', 'chrome');

    expect(findChromiumInCache(cacheDir)).toBe(executable);
  });

  it('findet eine geladene Windows-Version', () => {
    const executable = fakeInstall('chrome', 'win64-140.0.7339.82', 'chrome-win64', 'chrome.exe');

    expect(findChromiumInCache(cacheDir)).toBe(executable);
  });

  it('findet eine geladene macOS-Version', () => {
    const executable = fakeInstall(
      'chrome',
      'mac_arm-140.0.7339.82',
      'chrome-mac-arm64',
      'Google Chrome for Testing.app',
      'Contents',
      'MacOS',
      'Google Chrome for Testing',
    );

    expect(findChromiumInCache(cacheDir)).toBe(executable);
  });

  it('nimmt die neueste Version, auch wenn ihre Nummer kürzer sortiert', () => {
    fakeInstall('chrome', 'linux64-99.0.4844.51', 'chrome-linux64', 'chrome');
    const newer = fakeInstall('chrome', 'linux64-140.0.7339.82', 'chrome-linux64', 'chrome');

    expect(findChromiumInCache(cacheDir)).toBe(newer);
  });

  it('übergeht ein Verzeichnis ohne ausführbare Datei', () => {
    fs.mkdirSync(path.join(cacheDir, 'chrome', 'linux64-141.0.0.0'), { recursive: true });
    const usable = fakeInstall('chrome', 'linux64-140.0.7339.82', 'chrome-linux64', 'chrome');

    expect(findChromiumInCache(cacheDir)).toBe(usable);
  });
});

describe('Gesetzter Pfad', () => {
  it('nimmt PUPPETEER_EXECUTABLE_PATH, wenn die Datei existiert', () => {
    const executable = fakeInstall('chrome', 'linux64-140.0.7339.82', 'chrome-linux64', 'chrome');

    expect(findChromiumExecutable(executable)).toBe(executable);
  });

  it('sucht nicht weiter, wenn der gesetzte Pfad ins Leere zeigt', () => {
    // Ein falsch gesetzter Pfad soll auffallen und nicht dadurch verdeckt
    // werden, dass zufällig ein anderes Chromium auf der Maschine liegt.
    expect(findChromiumExecutable(path.join(cacheDir, 'gibt-es-nicht'))).toBeNull();
  });
});
