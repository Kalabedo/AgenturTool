import { describe, expect, it } from 'vitest';
import { createRequire } from 'node:module';
import { fileURLToPath } from 'node:url';
import {
  assertNativeBuildTarget,
  missingReleaseEnvironment,
  parsePackageArguments,
  unreadableReleaseFiles,
  storePackageArguments,
} from '../scripts/paket-konfiguration.mjs';
import { validateReleaseTag } from '../scripts/release-preflight.mjs';

describe('Paket-Konfiguration', () => {
  it('akzeptiert nur die dokumentierten Paketoptionen', () => {
    expect(parsePackageArguments([])).toEqual({
      onlyTree: false,
      release: false,
      store: false,
      keychain: false,
    });
    expect(parsePackageArguments(['--nur-baum'])).toEqual({
      onlyTree: true,
      release: false,
      store: false,
      keychain: false,
    });
    expect(parsePackageArguments(['--release'])).toEqual({
      onlyTree: false,
      release: true,
      store: false,
      keychain: false,
    });
    expect(parsePackageArguments(['--store', '--release'])).toEqual({
      onlyTree: false,
      release: true,
      store: true,
      keychain: false,
    });
    expect(parsePackageArguments(['--release', '--keychain'])).toEqual({
      onlyTree: false,
      release: true,
      store: false,
      keychain: true,
    });
    expect(() => parsePackageArguments(['--keychain'])).toThrow('nur zusammen mit --release');
    expect(() => parsePackageArguments(['--release', '--store', '--keychain'])).toThrow(
      'können nicht zusammen',
    );
    expect(() => parsePackageArguments(['--store', '--nur-baum'])).toThrow('können nicht zusammen');
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
    expect(missingReleaseEnvironment('darwin', {}, { keychain: true })).toEqual([
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

describe('Store-Identität', () => {
  const identity = {
    WINDOWS_STORE_IDENTITY_NAME: '12345.TomWenczelPrivatura',
    WINDOWS_STORE_PUBLISHER: 'CN=12345678-1234-1234-1234-123456789012',
    WINDOWS_STORE_PUBLISHER_DISPLAY_NAME: 'Tom Wenczel',
  };

  it('fordert Partner-Center-Angaben statt eines Windows-Zertifikats', () => {
    expect(() => storePackageArguments('win32', {})).toThrow('Partner-Center-Konfiguration fehlt');
    expect(storePackageArguments('win32', identity)).toEqual([
      '--config.appx.identityName=12345.TomWenczelPrivatura',
      '--config.appx.publisher=CN=12345678-1234-1234-1234-123456789012',
      '--config.appx.publisherDisplayName=Tom Wenczel',
    ]);
    expect(() => storePackageArguments('darwin', identity)).toThrow('nativ auf Windows');
  });

  it('weist falsche Identitäten und unsicheres Manifest-XML vor dem Bau ab', () => {
    expect(() =>
      storePackageArguments('win32', {
        ...identity,
        WINDOWS_STORE_IDENTITY_NAME: '@privatura/desktop',
      }),
    ).toThrow('Paketidentität');
    expect(() =>
      storePackageArguments('win32', { ...identity, WINDOWS_STORE_PUBLISHER: 'Tom' }),
    ).toThrow('Publisher-DN');
    expect(() =>
      storePackageArguments('win32', {
        ...identity,
        WINDOWS_STORE_PUBLISHER_DISPLAY_NAME: 'Tom & Co',
      }),
    ).toThrow('XML-Sonderzeichen');
  });
});

it('ersetzt beim Vererben der Store-Konfiguration NSIS vollständig', async () => {
  const require = createRequire(import.meta.url);
  const builderRequire = createRequire(require.resolve('electron-builder'));
  const { getConfig, validateConfiguration } = builderRequire(
    'app-builder-lib/out/util/config/config',
  );
  const { DebugLogger } = builderRequire('builder-util');
  const config = await getConfig(
    fileURLToPath(new URL('../', import.meta.url)),
    'electron-builder.store.yml',
    null,
  );
  await validateConfiguration(config, new DebugLogger(false));
  expect(config.win.target).toBe('appx');
  expect(config.forceCodeSigning).toBe(false);
  expect(config.mac.notarize).toBe(true);
  expect(config.mac.hardenedRuntime).toBe(true);
});

describe('Release-Tag', () => {
  it('verlangt stabiles SemVer passend zur Desktop-Version', () => {
    expect(() => validateReleaseTag('v1.2.3', '1.2.3')).not.toThrow();
    expect(() => validateReleaseTag('v1.2.4', '1.2.3')).toThrow('passt nicht');
    expect(() => validateReleaseTag('v1.2.3-beta.1', '1.2.3')).toThrow('stabiles SemVer');
    expect(() => validateReleaseTag('v01.2.3', '01.2.3')).toThrow('stabiles SemVer');
  });
});
