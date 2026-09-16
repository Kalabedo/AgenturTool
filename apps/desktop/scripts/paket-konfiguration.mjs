import fs from 'node:fs';

const defaultExists = (candidate) => fs.existsSync(candidate);

const NODE_TO_ELECTRON_PLATFORM = {
  darwin: 'darwin',
  linux: 'linux',
  win32: 'win32',
};

export function parsePackageArguments(args) {
  const supported = new Set(['--nur-baum', '--release', '--store', '--keychain']);
  const unknown = args.filter((argument) => !supported.has(argument));

  if (unknown.length > 0) {
    throw new Error(`Unbekannte Paketoption: ${unknown.join(', ')}`);
  }

  const onlyTree = args.includes('--nur-baum');
  const release = args.includes('--release');
  const store = args.includes('--store');
  const keychain = args.includes('--keychain');

  if (onlyTree && release) {
    throw new Error('--nur-baum und --release können nicht zusammen verwendet werden.');
  }
  if (onlyTree && store)
    throw new Error('--nur-baum und --store können nicht zusammen verwendet werden.');
  if (keychain && !release) {
    throw new Error('--keychain kann nur zusammen mit --release verwendet werden.');
  }
  if (keychain && store) {
    throw new Error('--keychain und --store können nicht zusammen verwendet werden.');
  }

  return { onlyTree, release, store, keychain };
}

/** Nur echte Partner-Center-Identitäten dürfen in ein Store-Uploadpaket. */
export function storePackageArguments(platform, env = process.env) {
  if (platform !== 'win32') throw new Error('Store-Pakete werden nativ auf Windows gebaut.');
  const fields = {
    WINDOWS_STORE_IDENTITY_NAME: 'identityName',
    WINDOWS_STORE_PUBLISHER: 'publisher',
    WINDOWS_STORE_PUBLISHER_DISPLAY_NAME: 'publisherDisplayName',
  };
  const missing = Object.keys(fields).filter((key) => !env[key]?.trim());
  if (missing.length > 0)
    throw new Error(`Partner-Center-Konfiguration fehlt: ${missing.join(', ')}`);
  if (!/^[A-Za-z0-9.-]{3,50}$/u.test(env.WINDOWS_STORE_IDENTITY_NAME)) {
    throw new Error('WINDOWS_STORE_IDENTITY_NAME ist keine gültige Paketidentität.');
  }
  if (!env.WINDOWS_STORE_PUBLISHER.startsWith('CN=')) {
    throw new Error(
      'WINDOWS_STORE_PUBLISHER muss der Publisher-DN aus Partner Center sein (CN=…).',
    );
  }
  // Der Builder setzt diese Angaben unmittelbar in XML ein.
  if (Object.keys(fields).some((key) => /[<>&"'\r\n]/u.test(env[key]))) {
    throw new Error(
      'Partner-Center-Angaben enthalten XML-Sonderzeichen; Manifest-Escaping ist erforderlich.',
    );
  }
  return Object.entries(fields).map(([key, field]) => `--config.appx.${field}=${env[key]}`);
}

export function assertNativeBuildTarget(
  target,
  host = { platform: process.platform, arch: process.arch },
) {
  const hostPlatform = NODE_TO_ELECTRON_PLATFORM[host.platform];

  if (hostPlatform === undefined) {
    throw new Error(`Nicht unterstütztes Wirtssystem: ${host.platform}`);
  }

  if (target.platform !== hostPlatform || target.arch !== host.arch) {
    throw new Error(
      `Cross-Build abgewiesen: ${target.platform}/${target.arch} wurde auf ` +
        `${hostPlatform}/${host.arch} angefordert. Prisma und argon2 müssen nativ gebaut werden.`,
    );
  }
}

export function requiredReleaseEnvironment(platform, options = {}) {
  if (platform === 'darwin') {
    // Notarisiert wird mit einem App-Store-Connect-Schlüssel, nicht mit
    // Apple-ID und app-spezifischem Passwort. Der Schlüssel hängt an keinem
    // persönlichen Konto, überlebt einen Passwortwechsel und lässt sich
    // einzeln widerrufen.
    //
    // Die Reihenfolge ist nicht beliebig: electron-builder prüft zuerst
    // `APPLE_ID` und `APPLE_APP_SPECIFIC_PASSWORD` und bricht ab, sobald
    // eine der beiden gesetzt ist, ohne dass die andere danebensteht. In
    // der Umgebung eines Release-Laufs darf deshalb keine von beiden
    // stehen — auch nicht aus Gewohnheit von einem früheren Weg.
    return [
      ...(options.keychain ? [] : ['CSC_LINK', 'CSC_KEY_PASSWORD']),
      'APPLE_API_KEY',
      'APPLE_API_KEY_ID',
      'APPLE_API_ISSUER',
    ];
  }

  if (platform === 'win32') {
    return ['CSC_LINK', 'CSC_KEY_PASSWORD'];
  }

  throw new Error(`Release-Pakete werden auf ${platform} nicht unterstützt.`);
}

// Variablen, deren Wert ein Dateipfad ist und keine Zeichenkette, die für
// sich steht. `notarytool` bekommt den Schlüssel als Datei (`--key`), und
// electron-builder reicht `APPLE_API_KEY` unverändert dorthin weiter.
const RELEASE_FILE_ENVIRONMENT = {
  darwin: ['APPLE_API_KEY'],
  win32: [],
};

export function missingReleaseEnvironment(platform, env = process.env, options = {}) {
  return requiredReleaseEnvironment(platform, options).filter((name) => {
    const value = env[name];
    return value === undefined || value.trim() === '';
  });
}

/**
 * Pfadvariablen, die auf nichts zeigen.
 *
 * Ohne diese Prüfung fiele der fehlende Schlüssel erst nach dem vollständigen
 * Bau auf, beim Aufruf von `notarytool` — also nach einer halben Stunde.
 * Genannt wird wie überall nur der Variablenname.
 */
export function unreadableReleaseFiles(platform, env = process.env, exists = defaultExists) {
  const names = RELEASE_FILE_ENVIRONMENT[platform] ?? [];

  return names.filter((name) => {
    const value = env[name];
    return value !== undefined && value.trim() !== '' && !exists(value);
  });
}
