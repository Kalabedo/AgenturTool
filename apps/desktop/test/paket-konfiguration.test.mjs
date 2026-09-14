import { describe, expect, it } from 'vitest';
import {
  assertNativeBuildTarget,
  missingReleaseEnvironment,
  parsePackageArguments,
  unreadableReleaseFiles,
} from '../scripts/paket-konfiguration.mjs';
import { validateReleaseTag } from '../scripts/release-preflight.mjs';

describe('Paket-Konfiguration', () => {
  it('akzeptiert nur die zwei dokumentierten Optionen', () => {
    expect(parsePackageArguments([])).toEqual({ onlyTree: false, release: false });
    expect(parsePackageArguments(['--nur-baum'])).toEqual({ onlyTree: true, release: false });
    expect(parsePackageArguments(['--release'])).toEqual({ onlyTree: false, release: true });
    expect(() => parsePackageArguments(['--x64'])).toThrow('Unbekannte Paketoption');
    expect(() => parsePackageArguments(['--nur-baum', '--release'])).toThrow(
      'können nicht zusammen',
    );
  });

  it('verhindert plattform- und architekturfremde Builds', () => {
    expect(() =>
      assertNativeBuildTarget(
        { platform: 'darwin', arch: 'arm64' },
        { platform: 'darwin', arch: 'arm64' },
      ),
    ).not.toThrow();
    expect(() =>
      assertNativeBuildTarget(
        { platform: 'darwin', arch: 'x64' },
        { platform: 'darwin', arch: 'arm64' },
      ),
    ).toThrow('Cross-Build abgewiesen');
    expect(() =>
      assertNativeBuildTarget(
        { platform: 'win32', arch: 'x64' },
        { platform: 'darwin', arch: 'x64' },
      ),
    ).toThrow('Cross-Build abgewiesen');
  });

  it('nennt fehlende Release-Geheimnisse, ohne Werte zu benötigen', () => {
    expect(
      missingReleaseEnvironment('win32', {
        CSC_LINK: 'certificate',
        CSC_KEY_PASSWORD: ' ',
      }),
    ).toEqual(['CSC_KEY_PASSWORD']);
    expect(missingReleaseEnvironment('darwin', {})).toEqual([
      'CSC_LINK',
      'CSC_KEY_PASSWORD',
      'APPLE_API_KEY',
      'APPLE_API_KEY_ID',
      'APPLE_API_ISSUER',
    ]);
  });

  it('erkennt einen Notarisierungsschlüssel, der auf keine Datei zeigt', () => {
    const vorhanden = (pfad) => pfad === '/tmp/AuthKey.p8';

    expect(
      unreadableReleaseFiles('darwin', { APPLE_API_KEY: '/tmp/AuthKey.p8' }, vorhanden),
    ).toEqual([]);
    expect(unreadableReleaseFiles('darwin', { APPLE_API_KEY: '/tmp/weg.p8' }, vorhanden)).toEqual([
      'APPLE_API_KEY',
    ]);
    // Ein leerer Wert ist Sache von missingReleaseEnvironment; hier wäre er
    // sonst zweimal gemeldet.
    expect(unreadableReleaseFiles('darwin', { APPLE_API_KEY: ' ' }, vorhanden)).toEqual([]);
    expect(unreadableReleaseFiles('win32', {}, vorhanden)).toEqual([]);
  });
});

describe('Release-Tag', () => {
  it('verlangt stabiles SemVer passend zur Desktop-Version', () => {
    expect(() => validateReleaseTag('v1.2.3', '1.2.3')).not.toThrow();
    expect(() => validateReleaseTag('v1.2.4', '1.2.3')).toThrow('passt nicht');
    expect(() => validateReleaseTag('v1.2.3-beta.1', '1.2.3')).toThrow('stabiles SemVer');
    expect(() => validateReleaseTag('v01.2.3', '01.2.3')).toThrow('stabiles SemVer');
  });
});
