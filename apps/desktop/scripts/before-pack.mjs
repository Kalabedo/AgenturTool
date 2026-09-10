import { Arch } from 'electron-builder';
import { assertNativeBuildTarget } from './paket-konfiguration.mjs';

export default function beforePack(context) {
  const arch = Arch[context.arch];

  if (typeof arch !== 'string') {
    throw new Error(`Unbekannte electron-builder-Architektur: ${String(context.arch)}`);
  }

  assertNativeBuildTarget({ platform: context.electronPlatformName, arch });
}
