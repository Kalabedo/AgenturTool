-- Die Grundfarbe gehört zum eingefrorenen Rechnungsdesign. Weiß als Vorgabe
-- hält bestehende Einstellungen und noch nicht finalisierte Rechnungen optisch
-- unverändert.
ALTER TABLE "TemplateSettings" ADD COLUMN "pageColor" TEXT NOT NULL DEFAULT '#ffffff';
