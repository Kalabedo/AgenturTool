-- CreateTable
CREATE TABLE "Company" (
    "id" INTEGER NOT NULL PRIMARY KEY AUTOINCREMENT DEFAULT 1,
    "companyName" TEXT NOT NULL DEFAULT '',
    "street" TEXT NOT NULL DEFAULT '',
    "postalCode" TEXT NOT NULL DEFAULT '',
    "city" TEXT NOT NULL DEFAULT '',
    "country" TEXT NOT NULL DEFAULT 'DE',
    "email" TEXT,
    "website" TEXT,
    "phone" TEXT,
    "vatId" TEXT,
    "taxNumber" TEXT,
    "bankAccountHolder" TEXT,
    "iban" TEXT,
    "bic" TEXT,
    "bankName" TEXT,
    "logoAssetId" INTEGER,
    "defaultPaymentTermDays" INTEGER NOT NULL DEFAULT 14,
    "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" DATETIME NOT NULL,
    CONSTRAINT "Company_logoAssetId_fkey" FOREIGN KEY ("logoAssetId") REFERENCES "Asset" ("id") ON DELETE SET NULL ON UPDATE CASCADE,
    CONSTRAINT "Company_singleton_check" CHECK ("id" = 1)
);

-- CreateTable
CREATE TABLE "Asset" (
    "id" INTEGER NOT NULL PRIMARY KEY AUTOINCREMENT,
    "path" TEXT NOT NULL,
    "mimeType" TEXT NOT NULL,
    "sizeBytes" INTEGER NOT NULL,
    "sha256" TEXT NOT NULL,
    "originalFilename" TEXT,
    "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP
);

-- CreateTable
CREATE TABLE "Customer" (
    "id" INTEGER NOT NULL PRIMARY KEY AUTOINCREMENT,
    "customerNumber" TEXT,
    "companyName" TEXT NOT NULL,
    "contactName" TEXT,
    "addressLine" TEXT,
    "street" TEXT NOT NULL DEFAULT '',
    "postalCode" TEXT NOT NULL DEFAULT '',
    "city" TEXT NOT NULL DEFAULT '',
    "country" TEXT NOT NULL DEFAULT 'DE',
    "email" TEXT,
    "vatId" TEXT,
    "notes" TEXT,
    "defaultTaxProfileId" INTEGER,
    "defaultPaymentTermDays" INTEGER,
    "archivedAt" DATETIME,
    "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" DATETIME NOT NULL,
    CONSTRAINT "Customer_defaultTaxProfileId_fkey" FOREIGN KEY ("defaultTaxProfileId") REFERENCES "TaxProfile" ("id") ON DELETE SET NULL ON UPDATE CASCADE
);

-- CreateTable
CREATE TABLE "TaxProfile" (
    "id" INTEGER NOT NULL PRIMARY KEY AUTOINCREMENT,
    "name" TEXT NOT NULL,
    "kind" TEXT NOT NULL,
    "defaultRateBasisPoints" INTEGER NOT NULL DEFAULT 0,
    "noteText" TEXT,
    "showTaxColumn" BOOLEAN NOT NULL DEFAULT true,
    "isDefault" BOOLEAN NOT NULL DEFAULT false,
    "sortOrder" INTEGER NOT NULL DEFAULT 0,
    "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" DATETIME NOT NULL,
    CONSTRAINT "TaxProfile_kind_check" CHECK ("kind" IN ('STANDARD','ZERO_RATED','REVERSE_CHARGE','SMALL_BUSINESS'))
);

-- CreateTable
CREATE TABLE "TemplateSettings" (
    "id" INTEGER NOT NULL PRIMARY KEY AUTOINCREMENT DEFAULT 1,
    "templateKey" TEXT NOT NULL DEFAULT 'classic',
    "accentColor" TEXT NOT NULL DEFAULT '#1e293b',
    "fontFamily" TEXT NOT NULL DEFAULT 'Inter',
    "logoWidthMm" REAL NOT NULL DEFAULT 40,
    "footerText" TEXT,
    "paymentNote" TEXT,
    "closingNote" TEXT,
    "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" DATETIME NOT NULL,
    CONSTRAINT "TemplateSettings_singleton_check" CHECK ("id" = 1)
);

-- CreateTable
CREATE TABLE "NumberSequence" (
    "id" INTEGER NOT NULL PRIMARY KEY AUTOINCREMENT,
    "scope" TEXT NOT NULL,
    "year" INTEGER NOT NULL,
    "nextValue" INTEGER NOT NULL DEFAULT 1,
    "updatedAt" DATETIME NOT NULL,
    CONSTRAINT "NumberSequence_scope_check" CHECK ("scope" IN ('INVOICE')),
    CONSTRAINT "NumberSequence_year_check" CHECK ("year" BETWEEN 1900 AND 9999),
    CONSTRAINT "NumberSequence_nextValue_check" CHECK ("nextValue" >= 1)
);

-- CreateTable
CREATE TABLE "Invoice" (
    "id" INTEGER NOT NULL PRIMARY KEY AUTOINCREMENT,
    "documentType" TEXT NOT NULL DEFAULT 'INVOICE',
    "status" TEXT NOT NULL DEFAULT 'DRAFT',
    "number" TEXT,
    "numberYear" INTEGER,
    "numberSeq" INTEGER,
    "currency" TEXT NOT NULL DEFAULT 'EUR',
    "customerId" INTEGER,
    "taxProfileId" INTEGER,
    "invoiceDate" TEXT NOT NULL,
    "serviceDate" TEXT NOT NULL,
    "serviceDateTo" TEXT,
    "dueDate" TEXT NOT NULL,
    "notes" TEXT,
    "footerNote" TEXT,
    "internalNotes" TEXT,
    "buyerData" TEXT,
    "sellerSnapshot" TEXT,
    "taxSnapshot" TEXT,
    "templateSnapshot" TEXT,
    "totalsSnapshot" TEXT,
    "snapshotVersion" INTEGER,
    "issuedAt" DATETIME,
    "sentAt" DATETIME,
    "paidAt" TEXT,
    "cancelledAt" DATETIME,
    "cancelsInvoiceId" INTEGER,
    "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" DATETIME NOT NULL,
    CONSTRAINT "Invoice_customerId_fkey" FOREIGN KEY ("customerId") REFERENCES "Customer" ("id") ON DELETE SET NULL ON UPDATE CASCADE,
    CONSTRAINT "Invoice_taxProfileId_fkey" FOREIGN KEY ("taxProfileId") REFERENCES "TaxProfile" ("id") ON DELETE SET NULL ON UPDATE CASCADE,
    CONSTRAINT "Invoice_cancelsInvoiceId_fkey" FOREIGN KEY ("cancelsInvoiceId") REFERENCES "Invoice" ("id") ON DELETE RESTRICT ON UPDATE CASCADE,
    CONSTRAINT "Invoice_documentType_check" CHECK ("documentType" IN ('INVOICE','CANCELLATION')),
    CONSTRAINT "Invoice_status_check" CHECK ("status" IN ('DRAFT','ISSUED','PAID','CANCELLED')),
    CONSTRAINT "Invoice_number_draft_check" CHECK (
        ("status" = 'DRAFT' AND "number" IS NULL AND "numberYear" IS NULL AND "numberSeq" IS NULL)
        OR ("status" <> 'DRAFT' AND "number" IS NOT NULL AND "numberYear" IS NOT NULL AND "numberSeq" IS NOT NULL)
    ),
    CONSTRAINT "Invoice_invoiceDate_isodate_check" CHECK ("invoiceDate" GLOB '[0-9][0-9][0-9][0-9]-[0-9][0-9]-[0-9][0-9]'),
    CONSTRAINT "Invoice_serviceDate_isodate_check" CHECK ("serviceDate" GLOB '[0-9][0-9][0-9][0-9]-[0-9][0-9]-[0-9][0-9]'),
    CONSTRAINT "Invoice_serviceDateTo_isodate_check" CHECK ("serviceDateTo" IS NULL OR "serviceDateTo" GLOB '[0-9][0-9][0-9][0-9]-[0-9][0-9]-[0-9][0-9]'),
    CONSTRAINT "Invoice_dueDate_isodate_check" CHECK ("dueDate" GLOB '[0-9][0-9][0-9][0-9]-[0-9][0-9]-[0-9][0-9]'),
    CONSTRAINT "Invoice_paidAt_isodate_check" CHECK ("paidAt" IS NULL OR "paidAt" GLOB '[0-9][0-9][0-9][0-9]-[0-9][0-9]-[0-9][0-9]')
);

-- CreateTable
CREATE TABLE "InvoiceItem" (
    "id" INTEGER NOT NULL PRIMARY KEY AUTOINCREMENT,
    "invoiceId" INTEGER NOT NULL,
    "position" INTEGER NOT NULL,
    "description" TEXT NOT NULL,
    "quantity" INTEGER NOT NULL DEFAULT 1000,
    "unit" TEXT,
    "unitPriceCents" INTEGER NOT NULL DEFAULT 0,
    "discountType" TEXT NOT NULL DEFAULT 'PERCENT',
    "discountValue" INTEGER NOT NULL DEFAULT 0,
    "taxRateBasisPoints" INTEGER NOT NULL DEFAULT 0,
    "lineDiscountCents" INTEGER NOT NULL DEFAULT 0,
    "lineNetCents" INTEGER NOT NULL DEFAULT 0,
    CONSTRAINT "InvoiceItem_invoiceId_fkey" FOREIGN KEY ("invoiceId") REFERENCES "Invoice" ("id") ON DELETE CASCADE ON UPDATE CASCADE,
    CONSTRAINT "InvoiceItem_discountType_check" CHECK ("discountType" IN ('PERCENT','AMOUNT'))
);

-- CreateTable
CREATE TABLE "InvoiceDocument" (
    "id" INTEGER NOT NULL PRIMARY KEY AUTOINCREMENT,
    "invoiceId" INTEGER NOT NULL,
    "path" TEXT NOT NULL,
    "sha256" TEXT NOT NULL,
    "sizeBytes" INTEGER NOT NULL,
    "generatedAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT "InvoiceDocument_invoiceId_fkey" FOREIGN KEY ("invoiceId") REFERENCES "Invoice" ("id") ON DELETE CASCADE ON UPDATE CASCADE
);

-- CreateTable
CREATE TABLE "InvoiceEvent" (
    "id" INTEGER NOT NULL PRIMARY KEY AUTOINCREMENT,
    "invoiceId" INTEGER NOT NULL,
    "type" TEXT NOT NULL,
    "metadata" TEXT,
    "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT "InvoiceEvent_invoiceId_fkey" FOREIGN KEY ("invoiceId") REFERENCES "Invoice" ("id") ON DELETE CASCADE ON UPDATE CASCADE,
    CONSTRAINT "InvoiceEvent_type_check" CHECK ("type" IN ('CREATED','UPDATED','FINALIZED','UNFINALIZED','CANCELLED','PAYMENT_SET','PAYMENT_CLEARED','SENT_MARKED','PDF_REGENERATED'))
);

-- CreateTable
CREATE TABLE "AppSetting" (
    "key" TEXT NOT NULL PRIMARY KEY,
    "value" TEXT NOT NULL,
    "updatedAt" DATETIME NOT NULL
);

-- CreateTable
CREATE TABLE "User" (
    "id" INTEGER NOT NULL PRIMARY KEY AUTOINCREMENT,
    "email" TEXT NOT NULL,
    "passwordHash" TEXT NOT NULL,
    "displayName" TEXT,
    "lastLoginAt" DATETIME,
    "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" DATETIME NOT NULL
);

-- CreateTable
CREATE TABLE "Session" (
    "id" INTEGER NOT NULL PRIMARY KEY AUTOINCREMENT,
    "tokenHash" TEXT NOT NULL,
    "userId" INTEGER NOT NULL,
    "expiresAt" DATETIME NOT NULL,
    "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT "Session_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User" ("id") ON DELETE CASCADE ON UPDATE CASCADE
);

-- CreateIndex
CREATE UNIQUE INDEX "Company_logoAssetId_key" ON "Company"("logoAssetId");

-- CreateIndex
CREATE UNIQUE INDEX "Asset_path_key" ON "Asset"("path");

-- CreateIndex
CREATE UNIQUE INDEX "Customer_customerNumber_key" ON "Customer"("customerNumber");

-- CreateIndex
CREATE INDEX "Customer_companyName_idx" ON "Customer"("companyName");

-- CreateIndex
CREATE INDEX "Customer_archivedAt_idx" ON "Customer"("archivedAt");

-- CreateIndex
CREATE UNIQUE INDEX "TaxProfile_name_key" ON "TaxProfile"("name");

-- CreateIndex
CREATE UNIQUE INDEX "NumberSequence_scope_year_key" ON "NumberSequence"("scope", "year");

-- CreateIndex
CREATE UNIQUE INDEX "Invoice_number_key" ON "Invoice"("number");

-- CreateIndex
CREATE UNIQUE INDEX "Invoice_cancelsInvoiceId_key" ON "Invoice"("cancelsInvoiceId");

-- CreateIndex
CREATE INDEX "Invoice_status_idx" ON "Invoice"("status");

-- CreateIndex
CREATE INDEX "Invoice_invoiceDate_idx" ON "Invoice"("invoiceDate");

-- CreateIndex
CREATE INDEX "Invoice_customerId_idx" ON "Invoice"("customerId");

-- CreateIndex
CREATE INDEX "Invoice_numberYear_numberSeq_idx" ON "Invoice"("numberYear", "numberSeq");

-- CreateIndex
CREATE INDEX "InvoiceItem_invoiceId_idx" ON "InvoiceItem"("invoiceId");

-- CreateIndex
CREATE UNIQUE INDEX "InvoiceItem_invoiceId_position_key" ON "InvoiceItem"("invoiceId", "position");

-- CreateIndex
CREATE UNIQUE INDEX "InvoiceDocument_path_key" ON "InvoiceDocument"("path");

-- CreateIndex
CREATE INDEX "InvoiceDocument_invoiceId_idx" ON "InvoiceDocument"("invoiceId");

-- CreateIndex
CREATE INDEX "InvoiceEvent_invoiceId_createdAt_idx" ON "InvoiceEvent"("invoiceId", "createdAt");

-- CreateIndex
CREATE UNIQUE INDEX "User_email_key" ON "User"("email");

-- CreateIndex
CREATE UNIQUE INDEX "Session_tokenHash_key" ON "Session"("tokenHash");

-- CreateIndex
CREATE INDEX "Session_userId_idx" ON "Session"("userId");


-- ---------------------------------------------------------------------------
-- Integritätsregeln, die Prisma auf SQLite nicht ausdrücken kann.
--
-- ACHTUNG: Prisma baut SQLite-Tabellen bei manchen Migrationen neu auf und
-- erzeugt das CREATE TABLE dabei aus dem Prisma-Schema. CHECK-Constraints und
-- Trigger gehen dabei still verloren. Jede künftige Migration, die eine der
-- betroffenen Tabellen anfasst, muss sie erneut anlegen.
-- `pnpm db:verify` prüft, dass sie vorhanden sind, und läuft als Test mit.
-- ---------------------------------------------------------------------------

-- Eine finalisierte Rechnung ist ein Dokument, keine bearbeitbare Zeile.
-- Der Service verhindert Änderungen bereits; dieser Trigger ist die letzte
-- Verteidigungslinie gegen einen direkten UPDATE an ihm vorbei.
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
    )
BEGIN
    SELECT RAISE(ABORT, 'INVOICE_IMMUTABLE: finalisierte Rechnungen dürfen nicht geändert werden');
END;

-- Eine ausgestellte Rechnung wird nie gelöscht, sondern storniert.
CREATE TRIGGER "Invoice_no_delete_after_issue"
BEFORE DELETE ON "Invoice"
FOR EACH ROW
WHEN OLD."status" <> 'DRAFT'
BEGIN
    SELECT RAISE(ABORT, 'INVOICE_IMMUTABLE: finalisierte Rechnungen dürfen nicht gelöscht werden');
END;

-- Ohne diese drei Trigger könnte man die Positionen einer ausgestellten
-- Rechnung ändern, ohne den Invoice-Trigger auszulösen.
CREATE TRIGGER "InvoiceItem_no_insert_when_issued"
BEFORE INSERT ON "InvoiceItem"
FOR EACH ROW
WHEN (SELECT "status" FROM "Invoice" WHERE "id" = NEW."invoiceId") <> 'DRAFT'
BEGIN
    SELECT RAISE(ABORT, 'INVOICE_IMMUTABLE: Positionen einer finalisierten Rechnung sind gesperrt');
END;

CREATE TRIGGER "InvoiceItem_no_update_when_issued"
BEFORE UPDATE ON "InvoiceItem"
FOR EACH ROW
WHEN (SELECT "status" FROM "Invoice" WHERE "id" = OLD."invoiceId") <> 'DRAFT'
BEGIN
    SELECT RAISE(ABORT, 'INVOICE_IMMUTABLE: Positionen einer finalisierten Rechnung sind gesperrt');
END;

-- Beim Löschen einer Entwurfs-Rechnung greift ON DELETE CASCADE. Die
-- Unterabfrage liefert dann NULL, der WHEN-Ausdruck ist damit nicht wahr und
-- der Trigger blockiert die Kaskade nicht.
CREATE TRIGGER "InvoiceItem_no_delete_when_issued"
BEFORE DELETE ON "InvoiceItem"
FOR EACH ROW
WHEN (SELECT "status" FROM "Invoice" WHERE "id" = OLD."invoiceId") <> 'DRAFT'
BEGIN
    SELECT RAISE(ABORT, 'INVOICE_IMMUTABLE: Positionen einer finalisierten Rechnung sind gesperrt');
END;
