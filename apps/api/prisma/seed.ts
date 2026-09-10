/**
 * Der Seed auf der Kommandozeile (`pnpm db:seed`).
 *
 * Die Grunddaten selbst stehen in `src/common/seed.ts`: Der Electron-
 * Hauptprozess ruft dieselbe Funktion beim ersten Start auf, und in einer
 * gepackten Anwendung gäbe es kein `tsx` für ein TypeScript-Skript.
 */
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { config as loadEnv } from 'dotenv';
import { PrismaClient } from '@prisma/client';
import { seed } from '../src/common/seed.js';

const here = path.dirname(fileURLToPath(import.meta.url));
loadEnv({ path: path.resolve(here, '../../../.env'), quiet: true });

const prisma = new PrismaClient();

seed(prisma)
  .then((counts) => {
    console.log('Seed abgeschlossen:', counts);
  })
  .catch((error: unknown) => {
    console.error('Seed fehlgeschlagen:', error);
    process.exitCode = 1;
  })
  .finally(() => {
    void prisma.$disconnect();
  });
