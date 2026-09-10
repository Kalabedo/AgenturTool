import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const scriptPath = fileURLToPath(import.meta.url);
const desktopDir = path.resolve(path.dirname(scriptPath), '..');

export function validateReleaseTag(tag, version) {
  if (!/^v(?:0|[1-9]\d*)\.(?:0|[1-9]\d*)\.(?:0|[1-9]\d*)$/u.test(tag)) {
    throw new Error(`Release-Tag muss stabiles SemVer sein (vMAJOR.MINOR.PATCH): ${tag}`);
  }

  const expected = `v${version}`;
  if (tag !== expected) {
    throw new Error(`Release-Tag ${tag} passt nicht zur Desktop-Version ${version} (${expected}).`);
  }
}

export function desktopVersion() {
  const manifest = JSON.parse(fs.readFileSync(path.join(desktopDir, 'package.json'), 'utf8'));
  if (typeof manifest.version !== 'string') {
    throw new Error('apps/desktop/package.json enthält keine gültige Version.');
  }
  return manifest.version;
}

if (path.resolve(process.argv[1] ?? '') === scriptPath) {
  const tag = process.env.GITHUB_REF_NAME ?? process.argv[2];
  if (tag === undefined || tag.trim() === '') {
    throw new Error('GITHUB_REF_NAME beziehungsweise ein Tag-Argument fehlt.');
  }

  const version = desktopVersion();
  validateReleaseTag(tag, version);
  process.stdout.write(`Release ${tag} entspricht Desktop-Version ${version}.\n`);
}
