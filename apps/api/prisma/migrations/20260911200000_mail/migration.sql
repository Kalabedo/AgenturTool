-- Direkter E-Mail-Versand (Abschnitt 27 der Architektur).
--
-- ---------------------------------------------------------------------------
-- HANDGESCHRIEBEN. Bitte vor dem Ändern lesen.
-- ---------------------------------------------------------------------------
--
-- Drei neue Tabellen und eine erweiterte Werteliste. Die neuen Tabellen
-- entstehen von Hand, weil ihre CHECK-Constraints am Ende des CREATE TABLE
-- stehen müssen — SQLite kennt kein nachträgliches "ADD CONSTRAINT".
--
-- Der heikle Teil ist die Werteliste in "InvoiceEvent": Der Verlauf kennt
-- künftig MAIL_SENT und MAIL_PREPARED, und ein CHECK lässt sich nur über
-- einen Neuaufbau der Tabelle ändern. Genau diesen Neuaufbau vermeiden die
-- vorangegangenen Migrationen sonst — dort hätte er Trigger und
-- Constraints anderer Tabellen verschluckt. Hier ist er vertretbar, und der
-- Unterschied ist der Grund:
--
--   * Auf "InvoiceEvent" liegt kein Trigger.
--   * Die Tabelle hat genau einen CHECK, einen Fremdschlüssel und einen
--     Index — alle drei stehen unten wieder da.
--   * Keine andere Tabelle verweist auf sie; sie ist reine Historie.
--
-- `pnpm db:verify` prüft danach, dass CHECK, Trigger und Unique-Indizes des
-- gesamten Schemas noch stehen.

-- ---------------------------------------------------------------------------
-- Einrichtung des Versandwegs. Singleton wie Company und TemplateSettings.
-- ---------------------------------------------------------------------------
CREATE TABLE "MailSettings" (
    "id" INTEGER NOT NULL PRIMARY KEY DEFAULT 1,
    "transport" TEXT NOT NULL DEFAULT 'NONE',
    "fromName" TEXT,
    "fromAddress" TEXT,
    "replyTo" TEXT,
    "bccSelf" BOOLEAN NOT NULL DEFAULT false,
    "host" TEXT,
    "port" INTEGER,
    "security" TEXT NOT NULL DEFAULT 'STARTTLS',
    "username" TEXT,
    "passwordSecret" TEXT,
    "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" DATETIME NOT NULL,
    CONSTRAINT "MailSettings_singleton_check" CHECK ("id" = 1),
    CONSTRAINT "MailSettings_transport_check" CHECK ("transport" IN ('NONE','SMTP','MAIL_APP')),
    CONSTRAINT "MailSettings_security_check" CHECK ("security" IN ('STARTTLS','TLS','NONE')),
    -- Ein Port außerhalb des gültigen Bereichs ist keine Einrichtung, die
    -- irgendwann noch funktioniert — er ist ein Tippfehler.
    CONSTRAINT "MailSettings_port_check" CHECK ("port" IS NULL OR ("port" >= 1 AND "port" <= 65535))
);

-- ---------------------------------------------------------------------------
-- Textvorlagen. Fester Satz von drei Schlüsseln, beim Seed angelegt.
-- ---------------------------------------------------------------------------
CREATE TABLE "MailTemplate" (
    "id" INTEGER NOT NULL PRIMARY KEY AUTOINCREMENT,
    "key" TEXT NOT NULL,
    "subject" TEXT NOT NULL,
    "body" TEXT NOT NULL,
    "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" DATETIME NOT NULL,
    CONSTRAINT "MailTemplate_key_check" CHECK ("key" IN ('INVOICE','CANCELLATION','TIME_REPORT'))
);

-- Der Unique-Index ist hier fachlich und nicht bloß technisch: Zwei
-- Vorlagen unter demselben Schlüssel hieße, dass der Versand mal die eine
-- und mal die andere erwischt.
CREATE UNIQUE INDEX "MailTemplate_key_key" ON "MailTemplate"("key");

-- ---------------------------------------------------------------------------
-- Versandprotokoll.
-- ---------------------------------------------------------------------------
CREATE TABLE "MailMessage" (
    "id" INTEGER NOT NULL PRIMARY KEY AUTOINCREMENT,
    "invoiceId" INTEGER,
    "transport" TEXT NOT NULL,
    "status" TEXT NOT NULL,
    "toAddresses" TEXT NOT NULL,
    "ccAddresses" TEXT NOT NULL DEFAULT '[]',
    "bccAddresses" TEXT NOT NULL DEFAULT '[]',
    "subject" TEXT NOT NULL,
    "body" TEXT NOT NULL,
    "attachments" TEXT NOT NULL DEFAULT '[]',
    "error" TEXT,
    "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    -- SetNull und nicht Cascade: Was verschickt wurde, wurde verschickt. Das
    -- Protokoll überlebt das Löschen eines Entwurfs.
    CONSTRAINT "MailMessage_invoiceId_fkey" FOREIGN KEY ("invoiceId") REFERENCES "Invoice" ("id") ON DELETE SET NULL ON UPDATE CASCADE,
    CONSTRAINT "MailMessage_transport_check" CHECK ("transport" IN ('SMTP','MAIL_APP')),
    CONSTRAINT "MailMessage_status_check" CHECK ("status" IN ('SENT','PREPARED','FAILED'))
);

CREATE INDEX "MailMessage_invoiceId_createdAt_idx" ON "MailMessage"("invoiceId", "createdAt");
CREATE INDEX "MailMessage_createdAt_idx" ON "MailMessage"("createdAt");

-- ---------------------------------------------------------------------------
-- Der Verlauf kennt zwei neue Ereignisse.
-- ---------------------------------------------------------------------------
--
-- MAIL_SENT und MAIL_PREPARED stehen nebeneinander, weil sie Verschiedenes
-- behaupten: Das eine heißt, der Mailserver hat die Nachricht angenommen,
-- das andere, ein Entwurf wurde an die Mail-Anwendung übergeben. Beides
-- unter SENT_MARKED zu führen hieße, den Unterschied zu verlieren, auf den
-- es beim Nachweis ankommt.
PRAGMA defer_foreign_keys=ON;
PRAGMA foreign_keys=OFF;

CREATE TABLE "new_InvoiceEvent" (
    "id" INTEGER NOT NULL PRIMARY KEY AUTOINCREMENT,
    "invoiceId" INTEGER NOT NULL,
    "type" TEXT NOT NULL,
    "metadata" TEXT,
    "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT "InvoiceEvent_invoiceId_fkey" FOREIGN KEY ("invoiceId") REFERENCES "Invoice" ("id") ON DELETE CASCADE ON UPDATE CASCADE,
    CONSTRAINT "InvoiceEvent_type_check" CHECK ("type" IN ('CREATED','UPDATED','FINALIZED','UNFINALIZED','CANCELLED','PAYMENT_SET','PAYMENT_CLEARED','SENT_MARKED','PDF_REGENERATED','MAIL_SENT','MAIL_PREPARED'))
);

INSERT INTO "new_InvoiceEvent" ("id", "invoiceId", "type", "metadata", "createdAt")
SELECT "id", "invoiceId", "type", "metadata", "createdAt" FROM "InvoiceEvent";

DROP TABLE "InvoiceEvent";
ALTER TABLE "new_InvoiceEvent" RENAME TO "InvoiceEvent";

CREATE INDEX "InvoiceEvent_invoiceId_createdAt_idx" ON "InvoiceEvent"("invoiceId", "createdAt");

PRAGMA foreign_keys=ON;
PRAGMA defer_foreign_keys=OFF;
