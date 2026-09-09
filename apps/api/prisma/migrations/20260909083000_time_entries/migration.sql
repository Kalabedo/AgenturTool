-- CreateTable
--
-- Handgeschrieben statt von Prisma erzeugt, weil die CHECK-Constraints am
-- Ende des CREATE TABLE stehen müssen: SQLite kennt kein nachträgliches
-- "ADD CONSTRAINT". Sie sind hier der eigentliche Punkt — das
-- Viertelstundenraster ist eine fachliche Zusage und darf nicht davon
-- abhängen, dass jeder Schreibweg vorher durch das Zod-Schema gelaufen ist.
CREATE TABLE "TimeEntry" (
    "id" INTEGER NOT NULL PRIMARY KEY AUTOINCREMENT,
    "date" TEXT NOT NULL,
    "customerId" INTEGER NOT NULL,
    "startMinutes" INTEGER NOT NULL,
    "endMinutes" INTEGER NOT NULL,
    "breakMinutes" INTEGER NOT NULL DEFAULT 0,
    "description" TEXT,
    "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" DATETIME NOT NULL,
    CONSTRAINT "TimeEntry_customerId_fkey" FOREIGN KEY ("customerId") REFERENCES "Customer" ("id") ON DELETE RESTRICT ON UPDATE CASCADE,
    CONSTRAINT "TimeEntry_date_isodate_check" CHECK ("date" GLOB '[0-9][0-9][0-9][0-9]-[0-9][0-9]-[0-9][0-9]'),
    -- Beginn: irgendwann am Tag, auf der Viertelstunde. 24:00 wäre ein
    -- Beginn nach Feierabend und ist deshalb ausgeschlossen.
    CONSTRAINT "TimeEntry_startMinutes_check" CHECK (
        "startMinutes" >= 0 AND "startMinutes" < 1440 AND "startMinutes" % 15 = 0
    ),
    -- Ende: bis einschließlich 24:00, ebenfalls auf der Viertelstunde.
    CONSTRAINT "TimeEntry_endMinutes_check" CHECK (
        "endMinutes" > 0 AND "endMinutes" <= 1440 AND "endMinutes" % 15 = 0
    ),
    CONSTRAINT "TimeEntry_range_check" CHECK ("endMinutes" > "startMinutes"),
    -- Die Pause muss kürzer sein als die Spanne; sonst entstünde eine
    -- erfasste Zeit von null oder weniger Minuten.
    CONSTRAINT "TimeEntry_breakMinutes_check" CHECK (
        "breakMinutes" >= 0
        AND "breakMinutes" % 15 = 0
        AND "breakMinutes" < "endMinutes" - "startMinutes"
    )
);

-- CreateIndex
CREATE INDEX "TimeEntry_date_idx" ON "TimeEntry"("date");

-- CreateIndex
CREATE INDEX "TimeEntry_customerId_date_idx" ON "TimeEntry"("customerId", "date");
