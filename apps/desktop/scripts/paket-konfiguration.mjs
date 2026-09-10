const NODE_TO_ELECTRON_PLATFORM = {
  darwin: 'darwin',
  linux: 'linux',
  win32: 'win32',
};

export function parsePackageArguments(args) {
  const supported = new Set(['--nur-baum', '--release']);
  const unknown = args.filter((argument) => !supported.has(argument));

  if (unknown.length > 0) {
    throw new Error(`Unbekannte Paketoption: ${unknown.join(', ')}`);
  }

  const onlyTree = args.includes('--nur-baum');
  const release = args.includes('--release');

  if (onlyTree && release) {
    throw new Error('--nur-baum und --release können nicht zusammen verwendet werden.');
  }

  return { onlyTree, release };
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

export function requiredReleaseEnvironment(platform) {
  if (platform === 'darwin') {
    return [
      'CSC_LINK',
      'CSC_KEY_PASSWORD',
      'APPLE_ID',
      'APPLE_APP_SPECIFIC_PASSWORD',
      'APPLE_TEAM_ID',
    ];
  }

  if (platform === 'win32') {
    return ['CSC_LINK', 'CSC_KEY_PASSWORD'];
  }

  throw new Error(`Release-Pakete werden auf ${platform} nicht unterstützt.`);
}

export function missingReleaseEnvironment(platform, env = process.env) {
  return requiredReleaseEnvironment(platform).filter((name) => {
    const value = env[name];
    return value === undefined || value.trim() === '';
  });
}
