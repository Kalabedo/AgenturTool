-- AlterTable
--
-- Handgeschrieben statt von Prisma erzeugt, aus demselben Grund wie beim
-- Anlegen der Tabelle: Prisma baut SQLite-Tabellen bei Änderungen gern neu
-- auf und erzeugt das CREATE TABLE dabei aus dem Prisma-Schema — die
-- handgeschriebenen CHECK-Constraints des Viertelstundenrasters wären danach
-- weg. Ein "ADD COLUMN" fasst die Tabellendefinition nicht an und lässt sie
-- alle stehen; `prisma/verify.ts` prüft das anschließend nach.
--
-- Bestehende Einträge bekommen NULL und gelten damit als offen. Sie
-- vorsorglich als abgerechnet zu markieren wäre der gefährlichere Weg: Ein
-- Eintrag, der nie abgerechnet wurde, aber als erledigt gilt, verschwindet
-- lautlos aus der Liste und wird nie bezahlt.
ALTER TABLE "TimeEntry" ADD COLUMN "billedAt" DATETIME;

-- CreateIndex
--
-- Die Abfrage des Normalbetriebs: die offenen Einträge eines Kunden,
-- chronologisch. Ohne diesen Index wäre das ein Tabellenscan bei jedem
-- Öffnen der Seite.
CREATE INDEX "TimeEntry_customerId_billedAt_date_idx" ON "TimeEntry"("customerId", "billedAt", "date");

-- CreateIndex
--
-- Für die Kundenreiter: welche Kunden haben überhaupt offene Zeiten.
CREATE INDEX "TimeEntry_billedAt_idx" ON "TimeEntry"("billedAt");
