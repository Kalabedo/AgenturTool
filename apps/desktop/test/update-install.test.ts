import { describe, expect, it } from 'vitest';
import {
  bundleVersion,
  canInstall,
  macBundlePath,
  macInstallCommands,
  windowsInstallCommand,
} from '../src/update/install';

/**
 * Die Installation.
 *
 * Der Austausch selbst braucht ein echtes macOS und ein signiertes Paket;
 * geprüft wird hier, was sich ohne beides prüfen lässt und trotzdem
 * entscheidet: welche Aufrufe abgehen, wo überhaupt ausgetauscht werden
 * darf, und ob das Paket die Fassung enthält, die es verspricht.
 */

describe('canInstall', () => {
  it('kennt die zwei Systeme mit einem Paket', () => {
    expect(canInstall('darwin')).toBe(true);
    expect(canInstall('win32')).toBe(true);
    expect(canInstall('linux')).toBe(false);
  });
});

describe('windowsInstallCommand', () => {
  it('startet den Installer still und lässt ihn die Anwendung wieder öffnen', () => {
    const command = windowsInstallCommand('C:\\Users\\tom\\AppData\\AgenturTool-1.4.0-x64.exe');

    expect(command.command).toBe('C:\\Users\\tom\\AppData\\AgenturTool-1.4.0-x64.exe');
    // `/S` ohne Rückfragen, `--force-run` startet danach neu — beides
    // versteht der NSIS-Installer von electron-builder.
    expect(command.args).toEqual(['/S', '--force-run']);
  });
});

describe('macBundlePath', () => {
  it('findet das Bundle, in dem die Anwendung läuft', () => {
    expect(macBundlePath('/Applications/AgenturTool.app/Contents/MacOS/AgenturTool')).toBe(
      '/Applications/AgenturTool.app',
    );
    expect(macBundlePath('/Users/tom/Programme/AgenturTool.app/Contents/MacOS/AgenturTool')).toBe(
      '/Users/tom/Programme/AgenturTool.app',
    );
  });

  it('tauscht nichts aus, was Gatekeeper verschoben hat', () => {
    // Läuft die Anwendung noch im DMG oder im Downloadordner, legt macOS sie
    // in ein schreibgeschütztes Abbild. Ein Austausch träfe dort eine Kopie,
    // die es beim nächsten Start nicht mehr gibt.
    expect(
      macBundlePath(
        '/private/var/folders/x/AppTranslocation/1234/d/AgenturTool.app/Contents/MacOS/AgenturTool',
      ),
    ).toBeNull();
  });

  it('tauscht nichts aus, was kein Bundle ist', () => {
    // Der Entwicklungsbetrieb: Electron aus node_modules.
    expect(macBundlePath('/repo/node_modules/electron/dist/electron')).toBeNull();
  });
});

describe('macInstallCommands', () => {
  const commands = macInstallCommands({
    dmg: '/Users/tom/Library/Application Support/AgenturTool/Updates/AgenturTool-1.4.0-arm64.dmg',
    mountPoint: '/Applications/.agentur-tool-update-ab12/abbild',
    appInDmg: '/Applications/.agentur-tool-update-ab12/abbild/AgenturTool.app',
    staged: '/Applications/.agentur-tool-update-ab12/AgenturTool.app',
  });

  it('hängt das Abbild ohne Fenster und nur lesend ein', () => {
    expect(commands.attach.command).toBe('hdiutil');
    expect(commands.attach.args).toEqual([
      'attach',
      '/Users/tom/Library/Application Support/AgenturTool/Updates/AgenturTool-1.4.0-arm64.dmg',
      '-nobrowse',
      '-readonly',
      '-mountpoint',
      '/Applications/.agentur-tool-update-ab12/abbild',
    ]);
  });

  it('prüft Signatur und Gatekeeper, bevor etwas kopiert wird', () => {
    expect(commands.verify.command).toBe('codesign');
    expect(commands.verify.args.slice(0, 3)).toEqual(['--verify', '--deep', '--strict']);
    expect(commands.assess.command).toBe('spctl');
    expect(commands.assess.args.slice(0, 3)).toEqual(['--assess', '--type', 'execute']);
  });

  it('kopiert mit ditto, damit die Signatur die Kopie übersteht', () => {
    expect(commands.copy.command).toBe('ditto');
    expect(commands.copy.args).toHaveLength(2);
  });

  it('gibt jedem Pfad ein eigenes Argument', () => {
    /*
     * Kein `sh -c`, sondern Programm und Argumente getrennt. Der Pfad zum
     * Datenordner enthält auf einem Mac ein Leerzeichen („Application
     * Support"); über die Shell wäre der Aufruf damit sofort falsch — im
     * besten Fall. Der Pfad mit Leerzeichen muss deshalb als *ein*
     * Argument ankommen, unverändert.
     */
    expect(commands.attach.command).toBe('hdiutil');
    expect(commands.attach.args).toContain(
      '/Users/tom/Library/Application Support/AgenturTool/Updates/AgenturTool-1.4.0-arm64.dmg',
    );

    for (const command of Object.values(commands)) {
      // Der Programmname selbst ist immer ein nackter Befehl aus dem Pfad.
      expect(command.command).toMatch(/^[a-z]+$/u);
    }
  });
});

describe('bundleVersion', () => {
  it('liest die Fassung aus dem Info.plist', () => {
    const plist = `<?xml version="1.0" encoding="UTF-8"?>
<plist version="1.0"><dict>
  <key>CFBundleName</key><string>AgenturTool</string>
  <key>CFBundleShortVersionString</key><string>1.4.0</string>
  <key>CFBundleVersion</key><string>1.4.0</string>
</dict></plist>`;

    expect(bundleVersion(plist)).toBe('1.4.0');
  });

  it('meldet nichts, wenn die Fassung fehlt', () => {
    expect(bundleVersion('<plist><dict></dict></plist>')).toBeNull();
  });
});
