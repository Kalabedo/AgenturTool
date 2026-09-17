-- Auswertbare Spalten auf "Invoice" (Abschnitt 30 der Architektur).
--
-- ---------------------------------------------------------------------------
-- HANDGESCHRIEBEN. Bitte vor dem Ändern lesen.
-- ---------------------------------------------------------------------------
--
-- Warum es diese Spalten gibt: Netto, Steuer und Brutto stehen als JSON in
-- "totalsSnapshot", die Steuerart in "taxSnapshot", Land und USt-IdNr. des
-- Kunden in "buyerData". SQLite kann in einem TEXT-Feld weder summieren noch
-- filtern. Jede Auswertung — Statistik, Kleinunternehmer-Grenze,
-- Zusammenfassende Meldung — müsste sonst alle Zeilen des Zeitraums laden und
-- selbst durch den JSON-Parser schicken.
--
-- Die Spalten sind eine **Kopie fürs Rechnen**, nicht die Wahrheit. Die
-- Wahrheit bleibt der Snapshot; geschrieben werden beide in derselben
-- Transaktion beim Finalisieren, abgeleitet von `invoiceTotalsColumns` im
-- geteilten Paket. Keine Auswertung darf die Spalten fortschreiben.
--
-- Wie bei jeder Spaltenerweiterung dieses Schemas: reines ALTER TABLE statt
-- des von Prisma erzeugten `RedefineTables`. Ein Neuaufbau von "Invoice"
-- verwürfe klanglos die beiden Trigger Invoice_immutable_after_issue und
-- Invoice_no_delete_after_issue sowie die CHECK-Constraints — und damit die
-- Sperre, die eine ausgestellte Rechnung unveränderlich macht. SQLite fügt
-- eine Spalte dagegen an, ohne die Tabelle anzufassen. `pnpm db:verify`
-- prüft das im Anschluss nach.
--
-- Alle sechs Spalten sind NULL-fähig, und das ist die Aussage: Ein Entwurf
-- hat keine eingefrorenen Summen. "Noch nicht ausgestellt" ist ein anderer
-- Zustand als "null Euro" — ein DEFAULT 0 hätte beide verschmolzen und jeden
-- Entwurf mit Umsatz null in die Auswertungen gestellt.

ALTER TABLE "Invoice" ADD COLUMN "totalNetCents"   INTEGER;
ALTER TABLE "Invoice" ADD COLUMN "totalTaxCents"   INTEGER;
ALTER TABLE "Invoice" ADD COLUMN "totalGrossCents" INTEGER;
ALTER TABLE "Invoice" ADD COLUMN "taxProfileKind"  TEXT;
ALTER TABLE "Invoice" ADD COLUMN "buyerCountry"    TEXT;
ALTER TABLE "Invoice" ADD COLUMN "buyerVatId"      TEXT;

-- ---------------------------------------------------------------------------
-- Bestand nachziehen. MUSS vor dem neuen Trigger stehen.
-- ---------------------------------------------------------------------------
--
-- Die Snapshots sind gültiges JSON, deshalb genügt json_extract und es
-- braucht keinen Anwendungscode, der einmalig über alle Rechnungen läuft.
--
-- Bedingung ist "totalsSnapshot IS NOT NULL", also genau der Zustand
-- "ausgestellt": Der Trigger unten schützt anschließend dieselbe Menge.
-- Entwürfe bleiben auf NULL.
--
-- **Die Reihenfolge ist keine Stilfrage.** Dieses UPDATE trifft ausgestellte
-- Rechnungen. Stünde es nach dem erweiterten Trigger, schlüge es mit
-- INVOICE_IMMUTABLE fehl — die Migration würde auf jeder Datenbank abbrechen,
-- in der schon eine Rechnung ausgestellt wurde, und nur auf einer leeren
-- durchlaufen. Erst füllen, dann verriegeln.
--
-- `buyerData.country` liegt eine Ebene tiefer, im Adressobjekt — anders als
-- die USt-IdNr., die direkt am Käufer hängt.

UPDATE "Invoice"
SET "totalNetCents"   = json_extract("totalsSnapshot", '$.netCents'),
    "totalTaxCents"   = json_extract("totalsSnapshot", '$.taxCents'),
    "totalGrossCents" = json_extract("totalsSnapshot", '$.grossCents'),
    "taxProfileKind"  = json_extract("taxSnapshot",    '$.kind'),
    "buyerCountry"    = json_extract("buyerData",      '$.address.country'),
    "buyerVatId"      = json_extract("buyerData",      '$.vatId')
WHERE "totalsSnapshot" IS NOT NULL;

-- Die Abfrage jeder Auswertung: eine Steuerart über einen Zeitraum.
CREATE INDEX "Invoice_taxProfileKind_invoiceDate_idx"
    ON "Invoice"("taxProfileKind", "invoiceDate");

-- ---------------------------------------------------------------------------
-- Den Immutability-Trigger um die neuen Spalten erweitern.
-- ---------------------------------------------------------------------------
--
-- Der Trigger aus der Init-Migration zählt die geschützten Spalten **einzeln**
-- auf. Eine neu angefügte Spalte steht dort naturgemäß nicht — ein direkter
-- UPDATE auf "totalNetCents" einer ausgestellten Rechnung liefe also am
-- Schutz vorbei, und zwar genau an der Zahl, auf der später jede Auswertung
-- und jede Meldung ans Finanzamt beruht.
--
-- Ein Trigger lässt sich in SQLite gefahrlos ersetzen: DROP und CREATE fassen
-- die Tabelle nicht an. (Ein CHECK ginge nur über einen Tabellenneubau — und
-- der hätte die Trigger verworfen, siehe den Kopf dieser Datei.) Name und
-- Bedingungen bleiben identisch, es kommen nur sechs Zeilen hinzu; die Liste
-- in prisma/expected-constraints.ts bleibt deshalb unverändert gültig.

DROP TRIGGER "Invoice_immutable_after_issue";

CREATE TRIGGER "Invoice_immutable_after_issue"
BEFORE UPDATE ON "Invoice"
FOR EACH ROW
WHEN OLD."status" <> 'DRAFT'
    -- Ausnahme: "Finalisierung zurücknehmen" (D6) setzt die Rechnung bewusst
    -- auf Entwurf zurück und gibt die Nummer frei. Die vier fachlichen
    -- Bedingungen dafür prüft der Service, nicht die Datenbank.
    AND NOT (NEW."status" = 'DRAFT' AND NEW."number" IS NULL AND NEW."issuedAt" IS NULL)
    AND (
        NEW."number" IS NOT OLD."number"
        OR NEW."numberYear" IS NOT OLD."numberYear"
        OR NEW."numberSeq" IS NOT OLD."numberSeq"
        OR NEW."documentType" IS NOT OLD."documentType"
        OR NEW."currency" IS NOT OLD."currency"
        OR NEW."customerId" IS NOT OLD."customerId"
        OR NEW."taxProfileId" IS NOT OLD."taxProfileId"
        OR NEW."invoiceDate" IS NOT OLD."invoiceDate"
        OR NEW."serviceDate" IS NOT OLD."serviceDate"
        OR NEW."serviceDateTo" IS NOT OLD."serviceDateTo"
        OR NEW."dueDate" IS NOT OLD."dueDate"
        OR NEW."notes" IS NOT OLD."notes"
        OR NEW."footerNote" IS NOT OLD."footerNote"
        OR NEW."buyerData" IS NOT OLD."buyerData"
        OR NEW."sellerSnapshot" IS NOT OLD."sellerSnapshot"
        OR NEW."taxSnapshot" IS NOT OLD."taxSnapshot"
        OR NEW."templateSnapshot" IS NOT OLD."templateSnapshot"
        OR NEW."totalsSnapshot" IS NOT OLD."totalsSnapshot"
        OR NEW."snapshotVersion" IS NOT OLD."snapshotVersion"
        OR NEW."issuedAt" IS NOT OLD."issuedAt"
        -- Die abgeleiteten Auswertungsspalten: dieselbe Zusage wie für den
        -- Snapshot, aus dem sie stammen.
        OR NEW."totalNetCents" IS NOT OLD."totalNetCents"
        OR NEW."totalTaxCents" IS NOT OLD."totalTaxCents"
        OR NEW."totalGrossCents" IS NOT OLD."totalGrossCents"
        OR NEW."taxProfileKind" IS NOT OLD."taxProfileKind"
        OR NEW."buyerCountry" IS NOT OLD."buyerCountry"
        OR NEW."buyerVatId" IS NOT OLD."buyerVatId"
    )
BEGIN
    SELECT RAISE(ABORT, 'INVOICE_IMMUTABLE: finalisierte Rechnungen dürfen nicht geändert werden');
END;
