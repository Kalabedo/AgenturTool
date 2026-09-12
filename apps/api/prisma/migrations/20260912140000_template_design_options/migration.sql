-- Die Regler des Rechnungsdesigners.
--
-- ---------------------------------------------------------------------------
-- HANDGESCHRIEBEN. Bitte vor dem Ändern lesen.
-- ---------------------------------------------------------------------------
--
-- Prisma hatte auch hier `RedefineTables` erzeugt — den vollständigen
-- Neuaufbau von "TemplateSettings" über eine Kopie. Dabei wäre
-- TemplateSettings_singleton_check verschwunden, also die Regel, die diese
-- Tabelle auf genau eine Zeile mit id = 1 festnagelt.
--
-- Das ist nicht theoretisch: 20260908101102_template_settings_default_font
-- hat genau das getan, für nichts weiter als einen geänderten Vorgabewert,
-- und `pnpm db:verify` hat den Verlust gefunden.
--
-- Der Entwurf wurde deshalb verworfen. SQLite fügt Spalten an, ohne die
-- Tabelle neu zu bauen, solange eine NOT-NULL-Spalte einen konstanten
-- Vorgabewert mitbringt — Trigger, CHECKs und Indizes bleiben dabei in Ruhe.
--
-- Die Vorgabewerte sind nicht frei gewählt: Es sind exakt die Werte, die
-- „classic" bisher fest in seinem CSS stehen hatte. Eine bestehende
-- Installation sieht nach dieser Migration deshalb unverändert aus, und eine
-- vorher ausgestellte Rechnung rendert weiterhin gleich.
--
-- `density` bekommt keinen CHECK, aus demselben Grund wie die Felder der
-- E-Rechnung: SQLite könnte ihn nur über einen Tabellenneubau anfügen, und
-- der verwürfe genau die Regel, die hier geschützt werden soll. Geprüft wird
-- gegen TEMPLATE_DENSITY_VALUES im Eingabeschema.

ALTER TABLE "TemplateSettings" ADD COLUMN "inkColor" TEXT NOT NULL DEFAULT '#1f2328';
ALTER TABLE "TemplateSettings" ADD COLUMN "inkSoftColor" TEXT NOT NULL DEFAULT '#4b5563';
ALTER TABLE "TemplateSettings" ADD COLUMN "ruleColor" TEXT NOT NULL DEFAULT '#e3e6ea';
ALTER TABLE "TemplateSettings" ADD COLUMN "bandColor" TEXT NOT NULL DEFAULT '#f4f5f7';
ALTER TABLE "TemplateSettings" ADD COLUMN "density" TEXT NOT NULL DEFAULT 'normal';
ALTER TABLE "TemplateSettings" ADD COLUMN "showLogo" BOOLEAN NOT NULL DEFAULT true;
ALTER TABLE "TemplateSettings" ADD COLUMN "showPaymentBlock" BOOLEAN NOT NULL DEFAULT true;
ALTER TABLE "TemplateSettings" ADD COLUMN "showFooterRule" BOOLEAN NOT NULL DEFAULT true;
