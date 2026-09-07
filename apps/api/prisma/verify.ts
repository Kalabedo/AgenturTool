import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { config as loadEnv } from 'dotenv';
import { PrismaClient } from '@prisma/client';
import { verifyConstraints } from './verify-constraints.js';

const here = path.dirname(fileURLToPath(import.meta.url));
loadEnv({ path: path.resolve(here, '../../../.env'), quiet: true });

const prisma = new PrismaClient();

async function main(): Promise<void> {
  const result = await verifyConstraints(prisma);

  if (result.ok) {
    console.log('Alle erwarteten Constraints, Trigger und Unique-Indizes sind vorhanden.');
    return;
  }

  console.error('Fehlende Integritätsregeln in der Datenbank:\n');
  if (result.missingTriggers.length > 0) {
    console.error('  Trigger:', result.missingTriggers.join(', '));
  }
  if (result.missingChecks.length > 0) {
    console.error('  CHECK-Constraints:', result.missingChecks.join(', '));
  }
  if (result.missingIndexes.length > 0) {
    console.error('  Unique-Indizes:', result.missingIndexes.join(', '));
  }
  console.error(
    '\nWahrscheinliche Ursache: Eine Migration hat die Tabelle neu aufgebaut und die\n' +
      'handgeschriebenen Regeln dabei verworfen. Sie gehören in dieselbe Migration\n' +
      'erneut hinein — siehe apps/api/prisma/expected-constraints.ts.',
  );
  process.exitCode = 1;
}

main()
  .catch((error: unknown) => {
    console.error('Prüfung fehlgeschlagen:', error);
    process.exitCode = 1;
  })
  .finally(() => {
    void prisma.$disconnect();
  });
