-- Zeiterfassung und Rechnung verbinden (Abschnitt 25 der Architektur).
--
-- ---------------------------------------------------------------------------
-- HANDGESCHRIEBEN. Bitte vor dem Ändern lesen.
-- ---------------------------------------------------------------------------
--
-- Prisma hatte für diese Migration `RedefineTables` erzeugt — den
-- vollständigen Neuaufbau von "Customer" und "TimeEntry" über eine Kopie.
-- Dabei wären **alle fünf** CHECK-Constraints auf "TimeEntry" lautlos
-- verschwunden:
--
--   TimeEntry_date_isodate_check      das ISO-Datum
--   TimeEntry_startMinutes_check      das Viertelstundenraster
--   TimeEntry_endMinutes_check        dito
--   TimeEntry_range_check             Ende nach Beginn
--   TimeEntry_breakMinutes_check      Pause auf dem Raster
--
-- Das Raster ist nicht Kosmetik: Die gesamte Abrechnung beruht darauf, dass
-- jede Dauer ein Vielfaches von 15 Minuten ist — nur deshalb sind Stunden
-- ohne Rundungsrest in Rechnungspositionen umzurechnen
-- (packages/shared/src/time-billing.ts). Fällt der CHECK weg, bringt ein
-- Import an der Anwendung vorbei 12:13-Einträge herein, und die Beträge
-- gehen nicht mehr auf.
--
-- Der erzeugte Entwurf wurde deshalb verworfen und durch reine
-- ALTER-TABLE-Anweisungen ersetzt. `pnpm db:verify` prüft im Anschluss, dass
-- alle Regeln noch stehen. Dieselbe Falle wie bei
-- 20260911072246_einvoice_fields.

-- ---------------------------------------------------------------------------
-- Stundensätze.
-- ---------------------------------------------------------------------------
--
-- In Cent wie jeder andere Geldbetrag (Abschnitt 7). Beide optional: Wer
-- nach Pauschale abrechnet, braucht keinen Stundensatz, und das Ausstellen
-- einer Rechnung darf nicht daran hängen.
ALTER TABLE "Company" ADD COLUMN "defaultHourlyRateCents" INTEGER;
ALTER TABLE "Customer" ADD COLUMN "hourlyRateCents" INTEGER;

-- ---------------------------------------------------------------------------
-- Abrechnungsart je Kunde.
-- ---------------------------------------------------------------------------
--
-- Vorgabe `SAMMEL`: eine Position über alle Stunden. Das ist der Normalfall
-- — vierzig Einzeltermine auf einer Rechnung laden zur Diskussion über
-- einzelne Stunden ein, und die Aufschlüsselung steht ohnehin auf dem
-- Zeitnachweis.
--
-- Bewusst ohne CHECK: SQLite kann einer bestehenden Tabelle keinen anfügen,
-- das ginge nur über genau den Neuaufbau, den diese Migration vermeidet.
-- Validiert wird über Zod (`BILLING_MODE` in
-- packages/shared/src/time-billing.ts); die Begründung steht in
-- apps/api/prisma/expected-constraints.ts.
ALTER TABLE "Customer" ADD COLUMN "billingMode" TEXT NOT NULL DEFAULT 'SAMMEL';

-- ---------------------------------------------------------------------------
-- Die Verbindung: welche Rechnung hat diese Zeit abgerechnet?
-- ---------------------------------------------------------------------------
--
-- Bisher sagte `billedAt` nur *dass* abgerechnet wurde, nicht *wo*. Damit
-- war eine abgerechnete Zeit ohne zugehörige Rechnung nicht erkennbar —
-- verlorenes Geld, das niemand bemerkt.
--
-- SQLite erlaubt eine REFERENCES-Klausel beim Anfügen einer Spalte, solange
-- deren Vorgabewert NULL ist. Genau das ist hier der Fall, weshalb der
-- Fremdschlüssel ohne Tabellenneuaufbau entsteht.
--
-- `ON DELETE SET NULL` ist nur das Netz. Freigegeben werden die Zeiten
-- ausdrücklich im Dienst, wenn ein Entwurf gelöscht wird: `billedAt` **und**
-- `invoiceId` zusammen, in einer Transaktion. Eine Zeile mit `billedAt` und
-- ohne `invoiceId` wäre wieder genau der Zustand, den niemand bemerkt.
ALTER TABLE "TimeEntry" ADD COLUMN "invoiceId" INTEGER REFERENCES "Invoice" ("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- Die Abfrage des Löschwegs: alle Zeiten einer Rechnung.
CREATE INDEX "TimeEntry_invoiceId_idx" ON "TimeEntry" ("invoiceId");

-- Bestehende abgerechnete Zeiten bleiben ohne `invoiceId`. Das ist richtig
-- und nicht nachzuholen: Sie wurden von Hand abgerechnet, und welche
-- Rechnung dazugehört, weiß die Datenbank nicht. Ein geratener Verweis wäre
-- schlimmer als keiner.
