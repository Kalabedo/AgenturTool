import type { PrismaClient } from '@prisma/client';
import {
  EXPECTED_CHECK_CONSTRAINTS,
  EXPECTED_TRIGGERS,
  EXPECTED_UNIQUE_INDEXES,
  type VerificationResult,
} from './expected-constraints.js';

interface SqliteObject {
  name: string;
  sql: string | null;
}

/**
 * Vergleicht die tatsächliche Datenbankstruktur mit den erwarteten
 * Integritätsregeln. Wird sowohl von `pnpm db:verify` als auch vom
 * Integrationstest benutzt.
 */
export async function verifyConstraints(prisma: PrismaClient): Promise<VerificationResult> {
  const triggers = await prisma.$queryRawUnsafe<SqliteObject[]>(
    "SELECT name, sql FROM sqlite_master WHERE type = 'trigger'",
  );
  const tables = await prisma.$queryRawUnsafe<SqliteObject[]>(
    "SELECT name, sql FROM sqlite_master WHERE type = 'table'",
  );
  const indexes = await prisma.$queryRawUnsafe<SqliteObject[]>(
    "SELECT name, sql FROM sqlite_master WHERE type = 'index'",
  );

  const triggerNames = new Set(triggers.map((row) => row.name));
  const indexNames = new Set(indexes.map((row) => row.name));
  const tableSql = new Map(tables.map((row) => [row.name, row.sql ?? '']));

  const missingTriggers = EXPECTED_TRIGGERS.filter((name) => !triggerNames.has(name));
  const missingIndexes = EXPECTED_UNIQUE_INDEXES.filter((name) => !indexNames.has(name));

  const missingChecks: string[] = [];
  for (const [table, constraints] of Object.entries(EXPECTED_CHECK_CONSTRAINTS)) {
    const sql = tableSql.get(table);
    if (sql === undefined) {
      missingChecks.push(`${table} (Tabelle fehlt)`);
      continue;
    }
    for (const constraint of constraints) {
      if (!sql.includes(constraint)) {
        missingChecks.push(`${table}.${constraint}`);
      }
    }
  }

  return {
    ok: missingTriggers.length === 0 && missingChecks.length === 0 && missingIndexes.length === 0,
    missingTriggers: [...missingTriggers],
    missingChecks,
    missingIndexes: [...missingIndexes],
  };
}
