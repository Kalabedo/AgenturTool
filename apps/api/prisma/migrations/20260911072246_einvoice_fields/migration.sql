-- Felder für die E-Rechnung nach EN 16931 (Abschnitt 24 der Architektur).
--
-- ---------------------------------------------------------------------------
-- HANDGESCHRIEBEN. Bitte vor dem Ändern lesen.
-- ---------------------------------------------------------------------------
--
-- Prisma hatte für diese Migration `RedefineTables` erzeugt — also den
-- vollständigen Neuaufbau von "InvoiceItem", "TaxProfile" und
-- "InvoiceDocument" über eine Kopie. Dabei wären klanglos verschwunden:
--
--   * die drei Trigger InvoiceItem_no_insert/update/delete_when_issued,
--     also die Sperre der Positionen finalisierter Rechnungen,
--   * die CHECK-Constraints InvoiceItem_discountType_check und
--     TaxProfile_kind_check,
--   * der partielle Unique-Index TaxProfile_single_default.
--
-- Genau davor warnt der Abschnitt „Warum es db:verify gibt" in der README.
-- Der erzeugte Entwurf wurde deshalb verworfen und durch reine
-- ALTER-TABLE-Anweisungen ersetzt: SQLite kann Spalten anfügen, ohne die
-- Tabelle neu zu bauen, und lässt dabei Trigger, CHECKs und Indizes in Ruhe.
-- `pnpm db:verify` prüft im Anschluss, dass das auch stimmt.
--
-- Eine NOT-NULL-Spalte darf per ALTER TABLE angefügt werden, solange sie
-- einen konstanten Vorgabewert mitbringt. Deshalb tragen `unitCode`,
-- `taxCategoryCode` und `kind` einen DEFAULT.

-- ---------------------------------------------------------------------------
-- Eigene Firmendaten: elektronische Adresse des Verkäufers (BT-34).
-- ---------------------------------------------------------------------------
ALTER TABLE "Company" ADD COLUMN "electronicAddress" TEXT;
ALTER TABLE "Company" ADD COLUMN "electronicAddressScheme" TEXT;

-- Die eigene E-Mail-Adresse ist der naheliegende Startwert: Wer eine
-- Rechnung per E-Mail verschickt, hat sie ohnehin schon eingetragen. `EM`
-- ist das zugehörige Schema der EAS-Codeliste.
UPDATE "Company"
SET "electronicAddress" = "email",
    "electronicAddressScheme" = 'EM'
WHERE "email" IS NOT NULL AND trim("email") <> '';

-- ---------------------------------------------------------------------------
-- Kunden: Referenz des Käufers (BT-10) und seine elektronische Adresse
-- (BT-49).
-- ---------------------------------------------------------------------------
ALTER TABLE "Customer" ADD COLUMN "buyerReference" TEXT;
ALTER TABLE "Customer" ADD COLUMN "electronicAddress" TEXT;
ALTER TABLE "Customer" ADD COLUMN "electronicAddressScheme" TEXT;

UPDATE "Customer"
SET "electronicAddress" = "email",
    "electronicAddressScheme" = 'EM'
WHERE "email" IS NOT NULL AND trim("email") <> '';

-- `buyerReference` bleibt bewusst leer. Die Leitweg-ID vergibt der
-- Auftraggeber; sie lässt sich nicht erraten, und ein erfundener Wert wäre
-- schlimmer als ein leerer — er käme durch jede Prüfung und landete beim
-- falschen Empfänger.

-- ---------------------------------------------------------------------------
-- Steuerprofile: Kategorie (BT-118) und Befreiungsgrund (BT-120/121).
-- ---------------------------------------------------------------------------
ALTER TABLE "TaxProfile" ADD COLUMN "taxCategoryCode" TEXT NOT NULL DEFAULT 'S';
ALTER TABLE "TaxProfile" ADD COLUMN "exemptionReasonCode" TEXT;
ALTER TABLE "TaxProfile" ADD COLUMN "exemptionReasonText" TEXT;

-- Dieselbe Abbildung wie `defaultTaxCategoryForKind` im geteilten Paket.
-- Weichen die beiden je voneinander ab, rechnet der Bestand anders als die
-- Neuanlage — deshalb steht die Abbildung dort im Test.
UPDATE "TaxProfile"
SET "taxCategoryCode" = CASE "kind"
    WHEN 'STANDARD' THEN 'S'
    WHEN 'REVERSE_CHARGE' THEN 'AE'
    -- ZERO_RATED und SMALL_BUSINESS beide auf 'E': Ob in Wahrheit eine
    -- innergemeinschaftliche Lieferung (K) oder eine Ausfuhr (G) gemeint
    -- ist, weiß nur der Benutzer. 'E' behauptet am wenigsten.
    ELSE 'E'
END;

-- Der Hinweistext war bei Reverse Charge und Kleinunternehmer schon immer
-- Pflicht und sagt genau das, was BT-120 verlangt.
UPDATE "TaxProfile"
SET "exemptionReasonText" = "noteText"
WHERE "taxCategoryCode" <> 'S'
  AND "noteText" IS NOT NULL
  AND trim("noteText") <> '';

UPDATE "TaxProfile"
SET "exemptionReasonCode" = 'VATEX-EU-AE'
WHERE "taxCategoryCode" = 'AE';

-- ---------------------------------------------------------------------------
-- Rechnungspositionen: Mengeneinheit als Code (BT-130).
-- ---------------------------------------------------------------------------
ALTER TABLE "InvoiceItem" ADD COLUMN "unitCode" TEXT NOT NULL DEFAULT 'C62';

-- Dieselbe Tabelle wie `guessUnitCode`. Was nicht getroffen wird, bleibt
-- 'C62' — ein unbekanntes Etikett darf keine ausgestellte Rechnung
-- unbrauchbar machen.
UPDATE "InvoiceItem"
SET "unitCode" = CASE lower(trim(replace("unit", '.', '')))
    WHEN 'h' THEN 'HUR'
    WHEN 'hr' THEN 'HUR'
    WHEN 'std' THEN 'HUR'
    WHEN 'stunde' THEN 'HUR'
    WHEN 'stunden' THEN 'HUR'
    WHEN 'tag' THEN 'DAY'
    WHEN 'tage' THEN 'DAY'
    WHEN 'pt' THEN 'DAY'
    WHEN 'woche' THEN 'WEE'
    WHEN 'wochen' THEN 'WEE'
    WHEN 'monat' THEN 'MON'
    WHEN 'monate' THEN 'MON'
    WHEN 'jahr' THEN 'ANN'
    WHEN 'jahre' THEN 'ANN'
    WHEN 'pauschal' THEN 'E48'
    WHEN 'pauschale' THEN 'E48'
    WHEN 'km' THEN 'KMT'
    WHEN 'm' THEN 'MTR'
    WHEN 'm2' THEN 'MTK'
    WHEN 'm²' THEN 'MTK'
    WHEN 'qm' THEN 'MTK'
    WHEN 'kg' THEN 'KGM'
    WHEN 'l' THEN 'LTR'
    WHEN 'satz' THEN 'SET'
    ELSE 'C62'
END
WHERE "unit" IS NOT NULL;

-- ---------------------------------------------------------------------------
-- Abgelegte Dokumente: PDF oder XML.
-- ---------------------------------------------------------------------------
--
-- Dieselbe Tabelle trägt künftig beide Ausgaben einer Rechnung. Der
-- Unique-Index auf `path` genügt weiterhin — die Dateiendung unterscheidet
-- sie.
ALTER TABLE "InvoiceDocument" ADD COLUMN "kind" TEXT NOT NULL DEFAULT 'PDF';

-- Alles, was bisher abgelegt wurde, ist ein PDF; der Vorgabewert stimmt für
-- den gesamten Bestand.

-- ---------------------------------------------------------------------------
-- Keine neuen CHECK-Constraints. Bewusst.
-- ---------------------------------------------------------------------------
--
-- SQLite kann einer bestehenden Tabelle keinen CHECK anfügen — das ginge
-- nur über genau den Neuaufbau, den diese Migration vermeidet. Die drei
-- Trigger auf "InvoiceItem" sind das höhere Gut: Sie schützen eine
-- ausgestellte Rechnung vor Veränderung, während ein CHECK auf `unitCode`
-- nur eine Codeliste absichern würde, die ohnehin wächst.
--
-- Die neuen Spalten werden deshalb von Zod validiert
-- (packages/shared/src/einvoice/codes.ts). Für `taxCategoryCode` und
-- `kind` ist das eine echte Lücke gegenüber dem Rest des Schemas; sie ist
-- in Abschnitt 24 als solche benannt.
