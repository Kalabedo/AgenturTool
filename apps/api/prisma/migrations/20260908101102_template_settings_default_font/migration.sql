-- Voreingestellte Schriftart auf "Open Sans" umgestellt.
--
-- Prisma kann eine geänderte Spaltenvoreinstellung auf SQLite nur über einen
-- Tabellenneuaufbau abbilden. Dabei entsteht das CREATE TABLE neu aus dem
-- Prisma-Schema — der handgeschriebene CHECK-Constraint war danach weg.
-- `pnpm db:verify` hat das gemeldet, deshalb steht er unten wieder drin.
-- Genau dafür gibt es die Prüfung (docs/ARCHITEKTUR.md, Abschnitt 8).

-- RedefineTables
PRAGMA defer_foreign_keys=ON;
PRAGMA foreign_keys=OFF;
CREATE TABLE "new_TemplateSettings" (
    "id" INTEGER NOT NULL PRIMARY KEY AUTOINCREMENT DEFAULT 1,
    "templateKey" TEXT NOT NULL DEFAULT 'classic',
    "accentColor" TEXT NOT NULL DEFAULT '#1e293b',
    "fontFamily" TEXT NOT NULL DEFAULT 'Open Sans',
    "logoWidthMm" REAL NOT NULL DEFAULT 40,
    "footerText" TEXT,
    "paymentNote" TEXT,
    "closingNote" TEXT,
    "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" DATETIME NOT NULL,
    CONSTRAINT "TemplateSettings_singleton_check" CHECK ("id" = 1)
);
INSERT INTO "new_TemplateSettings" ("accentColor", "closingNote", "createdAt", "fontFamily", "footerText", "id", "logoWidthMm", "paymentNote", "templateKey", "updatedAt") SELECT "accentColor", "closingNote", "createdAt", "fontFamily", "footerText", "id", "logoWidthMm", "paymentNote", "templateKey", "updatedAt" FROM "TemplateSettings";
DROP TABLE "TemplateSettings";
ALTER TABLE "new_TemplateSettings" RENAME TO "TemplateSettings";
PRAGMA foreign_keys=ON;
PRAGMA defer_foreign_keys=OFF;
