-- AlterTable
ALTER TABLE "TaxProfile" ADD COLUMN "archivedAt" DATETIME;

-- CreateIndex
CREATE INDEX "TaxProfile_archivedAt_idx" ON "TaxProfile"("archivedAt");

-- ---------------------------------------------------------------------------
-- Handgeschrieben: höchstens ein Steuerprofil darf Standard sein.
--
-- Ein partieller Unique-Index greift nur für die Zeilen mit isDefault = 1 und
-- lässt beliebig viele Nicht-Standardprofile zu. Die Anwendung setzt den alten
-- Standard in derselben Transaktion zurück; dieser Index ist die Absicherung,
-- falls das einmal unterbleibt — sonst schlüge das Rechnungsformular je nach
-- Sortierreihenfolge mal das eine, mal das andere Profil vor.
--
-- Hinweis: Prisma hat diese Migration als ALTER TABLE erzeugt, weshalb die
-- CHECK-Constraints der Tabelle erhalten bleiben. Bei Änderungen, die SQLite
-- nicht per ALTER ausdrücken kann, baut Prisma die Tabelle neu auf und
-- verwirft sie — `pnpm db:verify` schlägt dann fehl.
CREATE UNIQUE INDEX "TaxProfile_single_default" ON "TaxProfile"("isDefault") WHERE "isDefault" = 1;
