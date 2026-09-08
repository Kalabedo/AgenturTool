# Projektplan: Eigene Rechnungssoftware ("AgenturTool")

**Status:** v1.9 — Schritte 0 bis 9 umgesetzt; Rechnungen lassen sich erfassen,
ausstellen und als PDF ablegen. Die Kernfunktion steht.
**Repository:** `Kalabedo/AgenturTool`

Dieses Dokument ist die verbindliche Architekturgrundlage. Es wird mit dem Code
fortgeschrieben: Wenn eine Entscheidung sich im Lauf der Umsetzung ändert, wird
sie hier korrigiert und nicht nur im Code.

### Getroffene Entscheidungen

| ID  | Thema                | Gewählt                                                                                                               |
| --- | -------------------- | --------------------------------------------------------------------------------------------------------------------- |
| D1  | Betriebsmodell       | **Lokal, aber deploy-fähig gebaut** (Docker-Image, `/data`-Volume, Env-Config, Auth-Modul vorhanden aber deaktiviert) |
| D2  | Datenbank            | **SQLite** (portabel gehalten für späteren Postgres-Wechsel)                                                          |
| D3  | DB-Zugriff           | **Prisma**                                                                                                            |
| D4  | Backend              | **NestJS**                                                                                                            |
| D5  | Rechnungsnummer      | **Erst beim Finalisieren** vergeben                                                                                   |
| D6  | Nach Finalisierung   | **Gesperrt + Storno**, plus eng begrenztes „Finalisierung zurücknehmen"                                               |
| D7  | Zahlungen            | **Nur `paidAt`** (Teilzahlungen später)                                                                               |
| D8  | Historische Daten    | **JSON-Snapshots auf der Rechnung**                                                                                   |
| D9  | Entwurfsdaten        | **Kunde kopiert** (editierbar + Refresh), **eigene Firmendaten live** bis zum Finalisieren                            |
| D10 | Storno-Nummern       | **Dieselbe Sequenz** wie Rechnungen                                                                                   |
| D11 | Rabatt               | **Je Position**, umschaltbar Prozent ⇄ Betrag; kein Gesamtrabatt                                                      |
| D12 | Rundung              | **Steuer je Steuersatzgruppe** auf Summenebene                                                                        |
| D13 | PDF-Ablage           | **Dateisystem** + Metadaten/Hash in der DB                                                                            |
| D14 | Vorschau             | **React-Template im iframe** (eine Implementierung, zwei Konsumenten)                                                 |
| D15 | Template-Optionen V1 | **Mittel**: Logo/-größe, Akzentfarbe, Schrift (2–3), Fußzeile, Standardtexte                                          |
| D16 | Preiseingabe         | **Nur netto**                                                                                                         |
| D17 | Auth in V1           | **Vorhanden, per `AUTH_ENABLED` deaktiviert** (folgt aus D1)                                                          |
| D18 | Späterer Zugriff     | **Tailscale + aktiver Login**                                                                                         |
| D19 | Backup               | Button in der App **und** Skript für Cron; Offsite optional                                                           |
| D20 | Tooling              | pnpm, kein Turborepo, Vitest, ESLint + Prettier                                                                       |
| D21 | Kalenderdaten        | **ISO-String `"YYYY-MM-DD"`**; echte Zeitstempel bleiben `DateTime`                                                   |
| D22 | Kundennummer         | **Freies Feld, optional, eindeutig wenn gesetzt**                                                                     |
| D23 | Primärschlüssel      | `Int @id @default(autoincrement())`                                                                                   |
| D24 | Build der Pakete     | `tsup` → ESM + CJS + `.d.ts` (NestJS läuft CJS, Vite ESM)                                                             |
| D29 | Schrift im Dokument  | **Open Sans, als Base64 im Paket eingebettet** — kein Netzwerkzugriff beim PDF-Rendern                                |
| D30 | Vorschau-Einbindung  | **iframe + React-Portal** (nicht `srcdoc`): dieselbe Komponente wie im PDF, inkrementell aktualisiert                 |
| D31 | Seitenränder         | **`@page`-Ränder im Druck**, Padding nur am Bildschirm — Padding wirkt sonst nur auf der ersten Seite                 |
| D32 | Puppeteer-Paket      | **`puppeteer-core` mit gefundenem Chromium** statt `puppeteer` mit eigenem Download (Abschnitt 13a)                   |

Zu D21: Rechnungs-, Leistungs- und Fälligkeitsdatum sind Kalendertage, keine
Zeitpunkte. Als `DateTime` müsste an jeder Grenze zwischen Browser, API und
Datenbank auf UTC-Mitternacht normalisiert werden; ein einziges `new Date(...)`
in lokaler Zeitzone macht aus dem 31.12. den 30.12. — und zwar genau bei
Rechnungen zum Jahreswechsel. Als ISO-String kann das strukturell nicht
passieren. `paidAt` ist ebenfalls ein Kalenderdatum (du gibst es ein),
`sentAt` ein Zeitstempel (das System schreibt ihn).

---

## Context

Ziel ist der Ersatz von PDF24 / externen Rechnungsdiensten durch ein eigenes,
selbst gehostetes Werkzeug. Motivation: Unabhängigkeit von Drittanbietern,
volle Kontrolle über die eigenen Geschäftsdaten, und ein Layout, das der
bestehenden Referenzrechnung entspricht.

Kritischer Punkt, der die gesamte Architektur prägt: Eine ausgestellte Rechnung
ist ein **Dokument**, keine Datenbankzeile, die man später nochmal anders
rendert. Sie muss Jahre später exakt so reproduzierbar sein, wie sie ausgestellt
wurde — auch wenn sich Kundenadresse, eigene Bankverbindung, Steuersätze,
Template oder der Code der Anwendung längst geändert haben. Alles Weitere
(Snapshots, Immutability, Nummernvergabe, PDF-Ablage) folgt aus diesem einen
Punkt.

Zweiter prägender Punkt: Das Tool ist ein Single-User-Werkzeug mit einigen
hundert bis wenigen tausend Datensätzen. Das erlaubt bewusst einfache
Lösungen. Der MVP soll klein bleiben.

---

## 1. Zielbild

Eine webbasierte, selbst gehostete Rechnungsanwendung:

- Stammdaten (eigenes Unternehmen, Kunden, Steuerprofile) einmal pflegen
- Rechnung als Entwurf anlegen, live in A4-Vorschau sehen
- Finalisieren → Rechnungsnummer, unveränderlicher Snapshot, eingefrorenes PDF
- Übersicht, Suche, Status (offen / bezahlt / storniert)
- Läuft zunächst lokal, später optional auf eigenem VPS mit Zugriff von
  Windows-PC, MacBook und iPhone

Nicht-Ziele: Buchhaltungssoftware, vollständige Steuerlogik,
Drag-and-Drop-Designer, Multi-Tenant-SaaS.

---

## 2. MVP-Funktionsumfang

**Drin (V1):**

1. Unternehmensdaten (Singleton) inkl. Logo-Upload und Bankverbindung
2. Kundenverwaltung (CRUD, Suche)
3. Steuerprofile (CRUD, konfigurierbar)
4. Template-Einstellungen (ein Template, wenige Optionen)
5. Rechnung als Entwurf anlegen/bearbeiten/löschen, dynamische Positionen
6. Automatische Summenberechnung (Netto / Steuer je Satz / Brutto)
7. Live-A4-Vorschau im Browser
8. Finalisieren: Nummernvergabe + Snapshot + PDF-Erzeugung + Sperre
9. PDF-Download
10. Stornieren (Storno-Dokument), Duplizieren
11. Zahlungsstatus setzen (bezahlt am / offen)
12. Rechnungsübersicht mit Filter + Suche
13. Einfaches Dashboard
14. Backup-Export / Restore

**Raus (später):** Angebote, Mahnungen, E-Mail-Versand, wiederkehrende
Rechnungen, Produktkatalog, CSV/DATEV-Export, Statistiken, mehrere Templates,
mehrere Mandanten, mehrere Benutzer, ZUGFeRD/XRechnung.

---

## 3. Gesamtarchitektur

```
┌──────────────── Browser ────────────────┐
│  React SPA (Vite + TS + Tailwind)       │
│   ├─ Formular (react-hook-form + Zod)   │
│   └─ Live-Vorschau (iframe, A4)  ───────┼──┐  gleiches Template,
└────────────────┬────────────────────────┘  │  gleiche Berechnung
                 │ REST/JSON (Zod-validiert) │
┌────────────────▼────────────────────────┐  │
│  API (Node.js)                          │  │
│   ├─ Domain-Module                      │  │
│   ├─ ORM  ──► SQLite-Datei              │  │
│   └─ PDF-Service (Puppeteer)  ──────────┼──┘
└────────────────┬────────────────────────┘
                 │
        /data/  db.sqlite  ·  assets/  ·  invoices/*.pdf
```

**Der zentrale Architekturhebel:** Rechnungs-Template und Berechnungslogik
liegen in gemeinsamen Packages und werden von Frontend (Vorschau) **und**
Backend (PDF) aus derselben Quelle benutzt. Damit ist Vorschau ≙ PDF
konstruktionsbedingt, nicht durch Nachpflege zweier Implementierungen.

Autoritativ ist immer das Backend: Es rechnet bei jedem Speichern/Finalisieren
neu. Das Frontend rechnet nur für die sofortige UI-Reaktion.

---

## 4. Monorepo-Struktur

pnpm Workspaces, kein Turborepo im MVP (bei 4 Paketen unnötig; nachrüstbar).

```
agentur-tool/
├── apps/
│   ├── web/          React SPA
│   └── api/          Node-Backend
├── packages/
│   ├── shared/       Zod-Schemas, Typen, Enums, Berechnungen, Formatierung
│   └── invoice-template/  A4-Template (Komponente + CSS + Beispieldaten)
├── docker/           Dockerfile, compose, Caddyfile
├── scripts/          backup.ts, restore.ts, seed.ts
├── data/             (gitignored) db.sqlite, assets/, invoices/
├── package.json
├── pnpm-workspace.yaml
└── README.md
```

**Was `shared` enthält (Vertrag, keine Implementierung):**

- Zod-Schemas der API-Requests/Responses → daraus abgeleitete TS-Typen
- Domain-Enums (`InvoiceStatus`, `TaxProfileKind`, `DocumentType`)
- Reine Funktionen: Positions-/Summen-/Steuerberechnung, Geld-Arithmetik,
  Datums- und Währungsformatierung, Rechnungsnummern-Formatierung
- Konstanten (Länderliste, Standard-Steuersätze als Seed-Daten)

**Was `shared` ausdrücklich NICHT enthält:**

- DB-/ORM-Modelle oder generierte ORM-Typen (Persistenz ≠ API-Vertrag)
- Framework-spezifische Klassen (Nest-DTOs, Decorators, Guards)
- Frontend-Komponenten, HTTP-Client, Backend-Services
- Alles, was Node-only oder Browser-only ist (`shared` muss in beiden laufen)

---

## 5. Frontend-Architektur

Stack: React 19 + TypeScript + Vite + Tailwind + React Router +
TanStack Query (Server-State) + react-hook-form/zodResolver (Formulare).
Kein globaler State-Store nötig — Server-State über Query, Formular-State über RHF.

```
apps/web/src/
├── app/            Router, Provider, Layout, ErrorBoundary
├── features/
│   ├── dashboard/
│   ├── invoices/   list/ · editor/ (Form, ItemsTable, TotalsPanel, PreviewPane) · detail/
│   ├── customers/
│   └── settings/   company/ · tax-profiles/ · template/ · backup/
├── components/ui/  Button, Input, Select, Table, Dialog, Money, DatePicker
├── lib/            apiClient, queryKeys, formatters, currency
└── hooks/
```

Routen: `/` · `/invoices` · `/invoices/new` · `/invoices/:id` ·
`/invoices/:id/edit` · `/customers` · `/customers/:id` · `/settings/*`

**Vorschau-Detail:** Die Vorschau läuft in einem `<iframe>`, damit Tailwind
Preflight und App-Styles nicht ins Template durchschlagen. Der Editor ist
zweispaltig: links Formular, rechts A4-Vorschau (CSS-`transform: scale`),
debounced aktualisiert.

---

## 6. Backend-Architektur

**NestJS**, Module entlang der Domäne:

```
apps/api/src/
├── company/        Singleton-Stammdaten + Logo
├── customers/
├── tax-profiles/
├── template-settings/
├── invoices/       Kern: Draft-CRUD, Finalize, Cancel, Duplicate, Payment
│   ├── numbering/  NumberSequence, transaktionale Vergabe
│   └── snapshot/   Snapshot-Bau + Validierung
├── pdf/            Puppeteer-Browser-Pool, Render-Service
├── files/          Asset-/PDF-Ablage, Streaming, Hashing
├── backup/         Export/Restore
├── auth/           (schaltbar, siehe Abschnitt 16)
└── common/         Zod-Validation-Pipe, Fehlerfilter, Config
```

Schichtung pro Modul: Controller (HTTP) → Service (Domänenlogik,
Transaktionen) → Repository (Prisma). Domänenlogik nie im Controller,
Prisma-Typen nie nach außen — Mapper auf die `shared`-Response-Schemas.

Nest-spezifisch:

- Eigene `ZodValidationPipe` statt `class-validator`/`class-transformer`.
  Grund: die Schemas aus `packages/shared` sind dann die _einzige_
  Validierungsquelle für Frontend und Backend. Zwei parallele
  Validierungssysteme (Zod im Frontend, Decorators im Backend) laufen
  garantiert auseinander.
- `PrismaService` als injizierbarer Singleton mit `onModuleInit`/`enableShutdownHooks`.
- Globaler `ExceptionFilter`, der Domänenfehler auf das einheitliche
  Fehlerformat aus Abschnitt 14 abbildet.
- `PdfService` kapselt den Puppeteer-Browser als Provider mit
  `OnModuleDestroy` — sonst bleiben Chromium-Prozesse zurück.
- `ServeStaticModule` liefert im Produktivbetrieb das gebaute Frontend aus.

---

## 7. Datenmodell

### Entitäten

| Entität            | Zweck                                       | Kern                                                                                                                   |
| ------------------ | ------------------------------------------- | ---------------------------------------------------------------------------------------------------------------------- |
| `Company`          | eigene Firmendaten (Singleton, `id = 1`)    | Name, Adresse, Kontakt, USt-ID, Steuernr., Kontoinhaber/IBAN/BIC, Logo-Ref, Standard-Zahlungsziel, Fußzeilentexte      |
| `Customer`         | Rechnungsempfänger (Stammdaten)             | Nr., Firma, Ansprechpartner, Adresse, Land, E-Mail, USt-ID, Standard-Steuerprofil, Standard-Zahlungsziel, `archivedAt` |
| `TaxProfile`       | konfigurierbare Steuerkonstellation         | Name, `kind`, Standardsatz, Hinweistext, Flags                                                                         |
| `TemplateSettings` | Aussehen (Singleton in V1)                  | Template-Key, Akzentfarbe, Schrift, Sichtbarkeits-Flags, Footer, Standardtexte                                         |
| `Invoice`          | Rechnungskopf + Snapshots + Status          | siehe unten                                                                                                            |
| `InvoiceItem`      | Positionen                                  | Sortierung, Beschreibung, Menge, Einheit, Einzelpreis, Rabatt, Steuersatz, berechnete Beträge                          |
| `NumberSequence`   | Zählerstand je Jahr/Dokumenttyp             | `scope`, `year`, `nextValue`                                                                                           |
| `InvoiceDocument`  | erzeugte PDF-Datei                          | Invoice-Ref, Pfad, SHA-256, Bytes, `generatedAt`, `kind`                                                               |
| `Asset`            | hochgeladene Dateien (Logo)                 | Pfad, MIME, Größe, Hash                                                                                                |
| `InvoiceEvent`     | Verlaufsprotokoll (**Pflicht**, siehe Undo) | Invoice-Ref, Typ, Zeitpunkt, Metadaten-JSON                                                                            |
| `AppSetting`       | Key-Value-Kleinkram                         | Key, JSON-Wert                                                                                                         |

### Beziehungen

```
Company (1) ──── (1) Asset            Logo
Customer (1) ──< (n) Invoice          nur als Referenz für Filter/Statistik
TaxProfile (1) ─< (n) Invoice         nur als Referenz
Invoice  (1) ──< (n) InvoiceItem      Positionen (bei ISSUED eingefroren)
Invoice  (1) ──< (n) InvoiceDocument  PDF(s)
Invoice  (1) ──< (n) InvoiceEvent     Verlauf
Invoice  (1) ──── (0..1) Invoice      cancelledByInvoiceId / cancelsInvoiceId
```

Wichtig: Die Fremdschlüssel `customerId` / `taxProfileId` auf einer
finalisierten Rechnung sind **nur noch Verweise für Listen und Filter**.
Was auf dem Dokument steht, kommt ausschließlich aus den Snapshots. Das ist
der Kern von Abschnitt 8.

### Invoice-Felder (Auszug)

```
id, documentType (INVOICE | CANCELLATION), status, number (unique, nullable),
numberYear, numberSeq, currency ('EUR'),
customerId, taxProfileId,
invoiceDate, serviceDate, serviceDateTo?, dueDate,
notes, footerNote,
buyerData        TEXT/JSON  ← ab Entwurf befüllt, editierbar, ab ISSUED gesperrt
sellerSnapshot   TEXT/JSON  ← NULL im Entwurf, beim Finalisieren gesetzt
taxSnapshot      TEXT/JSON  ← NULL im Entwurf, beim Finalisieren gesetzt
templateSnapshot TEXT/JSON  ← NULL im Entwurf, beim Finalisieren gesetzt
totalsSnapshot   TEXT/JSON  ← NULL im Entwurf, beim Finalisieren gesetzt
snapshotVersion  INT
issuedAt, sentAt?, paidAt?, cancelledAt?, cancelsInvoiceId?, cancelledByInvoiceId?
createdAt, updatedAt
```

`InvoiceItem`: `position`, `description`, `quantity` (Tausendstel), `unit`,
`unitPriceCents`, `discountType` (`PERCENT` | `AMOUNT`), `discountValue`,
`taxRatePct` (Basispunkte) sowie die berechneten `lineDiscountCents` und
`lineNetCents` — gespeichert, damit die Rechnung ohne Neuberechnung
darstellbar ist und historische Zeilen nie nachträglich anders herauskommen.

### Konsequenzen aus Prisma + SQLite (wichtig fürs Schema)

Prisma unterstützt auf SQLite **kein `Json`**, **keine `enum`** und keine
Scalar-Lists. Das ist keine Einschränkung, die wir umgehen — sondern eine, die
wir explizit einplanen:

- **Snapshots** werden als `String`-Spalten mit JSON-Inhalt gespeichert und in
  einer schmalen Repository-Schicht mit **Zod** geparst/serialisiert. Effekt:
  Snapshots sind beim Lesen typsicher validiert statt nur „irgendein JSON" —
  in einer Rechnungssoftware ist das eher Vorteil als Nachteil.
- **Enums** werden `String`-Spalten. Die zulässigen Werte kommen aus den
  Union-Typen in `packages/shared`; zusätzlich setzen wir per handgeschriebenem
  SQL in der Migration `CHECK`-Constraints, damit die Datenbank selbst keine
  ungültigen Zustände zulässt.
- **`Decimal`** ist auf SQLite unzuverlässig (Fließkomma-Affinität) — bestätigt
  die Entscheidung für Integer-Cent unten.
- Prisma-Migrationen dürfen frei bearbeitetes SQL enthalten. Dort landen die
  `CHECK`-Constraints, der `UNIQUE`-Index auf `number` und der
  Immutability-Trigger.

### Geldbeträge und Mengen

- **Alle Geldbeträge als Integer in Cent.** Niemals Float/`REAL`. SQLite hat
  keinen echten Decimal-Typ, und Rundungsfehler sind in einer
  Rechnungssoftware inakzeptabel.
- **Mengen als Integer in Tausendstel** (`7.5 h` → `7500`), damit
  Stundenbruchteile darstellbar sind.
- Rabatt je Position, umschaltbar: `PERCENT` (Basispunkte, `12,5 %` → `1250`)
  oder `AMOUNT` (Cent). Kein Rabatt auf Rechnungsebene — Paketnachlässe werden
  als eigene Position mit negativem Betrag erfasst. Damit bleibt die Zuordnung
  zu Steuersätzen eindeutig und es braucht keine anteilige Verteilung.
- Preise werden **netto** erfasst. Ein späterer Brutto-Modus wäre ein Flag auf
  der Rechnung plus ein zweiter Rechenpfad — bewusst nicht in V1.

### Der Rechenweg (verbindlich)

Festgeschrieben, weil sich hier später sonst unbemerkt Cent-Differenzen
einschleichen. Implementierung als reine Funktion in `packages/shared`,
abgesichert mit Unit-Tests inklusive der Grenzfälle.

```
Je Position:
  1  base      = round(quantity × unitPriceCents / 1000)
  2  discount  = discountType === PERCENT
                   ? round(base × discountValue / 10000)
                   : discountValue
  3  lineNet   = base − discount

Je Steuersatz-Gruppe (alle Positionen mit gleichem taxRatePct):
  4  groupNet  = Σ lineNet
  5  groupTax  = round(groupNet × taxRatePct / 10000)

Gesamt:
  6  totalNet   = Σ groupNet
     totalTax   = Σ groupTax
     totalGross = totalNet + totalTax
```

Zwei Punkte, die leicht übersehen werden:

- **Die Steuer wird je Steuersatzgruppe auf der Nettosumme berechnet**, nicht
  je Position und dann addiert. Das entspricht dem üblichen Steuerausweis und
  vermeidet, dass die Summe der zeilenweise gerundeten Steuerbeträge von der
  Steuer auf das Gesamtentgelt abweicht. Der Steuerausweis auf dem PDF erfolgt
  entsprechend **je Satz** („19 % von 1.234,00 € = 234,46 €").
- **Kaufmännisch gerundet wird symmetrisch zur Null** („half away from zero").
  JavaScripts `Math.round` rundet bei negativen Werten aufwärts
  (`Math.round(-0.5) === -0`) — bei Storno-Dokumenten mit negativen Beträgen
  würde die Stornosumme dann um einzelne Cent von der Originalrechnung
  abweichen. In `packages/shared` gibt es deshalb eine eigene
  `roundHalfAwayFromZero`-Funktion, die überall statt `Math.round` benutzt wird.
  Ein Test prüft explizit: Storno + Original = exakt 0.

Sämtliche Rechenlogik liegt ausschließlich in `packages/shared`. Das Backend
rechnet bei jedem Speichern und beim Finalisieren neu und ist autoritativ;
das Frontend benutzt dieselbe Funktion nur für die sofortige Anzeige.

**Umgesetzt in Schritt 5** als `packages/shared/src/invoice-calculation.ts`:

- `calculateItem` und `calculateInvoice` bilden die Schritte 1 bis 6 ab.
- `negateInvoiceItems` erzeugt die Storno-Gegenposition. Umgekehrt wird die
  **Menge**, nicht der Einzelpreis — so bleibt auf dem Storno erkennbar, zu
  welchem Preis ursprünglich abgerechnet wurde. Ein absoluter Rabatt wird
  mitgedreht, ein prozentualer nicht: Der Satz gilt unverändert, nur die
  Bezugsgröße ist negativ.
- `itemGrossForDisplay` liefert den Bruttobetrag einer Zeile **nur für die
  Anzeige**. Die Summe dieser Werte ist nicht der Rechnungsbetrag; ein Test
  hält den Unterschied fest, damit die Falle dokumentiert bleibt.
- Die Funktion rechnet und bewertet nicht: Ob ein Rabatt größer als die
  Position ist, prüfen die Schemas und die Finalisierung. Hier würde eine
  solche Regel den Storno unmöglich machen, der legitimerweise mit negativen
  Beträgen arbeitet.
- `roundHalfAwayFromZero` bricht ab, sobald ein Ergebnis jenseits von
  `Number.MAX_SAFE_INTEGER` läge. Dort rechnet JavaScript still ungenau
  weiter; bei Geldbeträgen ist ein Abbruch besser als ein Ergebnis, das
  plausibel aussieht und um Cents danebenliegt.

---

## 8. Snapshots und finalisierte Rechnungen

### Prinzip

Es gibt genau **zwei** Zustände mit klarer Regel, woher jedes Feld kommt:

| Feld                       | Entwurf                                                              | Ab `ISSUED`                             |
| -------------------------- | -------------------------------------------------------------------- | --------------------------------------- |
| Empfängerdaten             | `buyerData` — beim Kundenauswahl **kopiert**, im Formular editierbar | eingefroren (`buyerData` wird gesperrt) |
| Eigene Firmendaten         | **live** aus `Company` aufgelöst                                     | `sellerSnapshot`                        |
| Steuerprofil + Hinweistext | **live** aus `TaxProfile` aufgelöst                                  | `taxSnapshot`                           |
| Template-Einstellungen     | **live** aus `TemplateSettings`                                      | `templateSnapshot`                      |
| Summen                     | bei jedem Speichern neu berechnet                                    | `totalsSnapshot`                        |

Das ist bewusst asymmetrisch, und zwar aus einem praktischen Grund:

- **Empfängerdaten kopiert:** Du brauchst regelmäßig einmalige Abweichungen —
  abweichende Rechnungsanschrift, „z. Hd. Frau Müller", ein Zusatz in der
  Adresszeile. Mit einem reinen Verweis ginge das nur über zusätzliche
  Override-Felder. Ein Button „Kundendaten neu übernehmen" holt den aktuellen
  Stammdatenstand nach, wenn du ihn willst.
- **Eigene Firmendaten live:** Wenn du deine IBAN änderst, sollen alle offenen
  Entwürfe automatisch die neue tragen — ein Entwurf mit veralteter
  Bankverbindung, der irgendwann finalisiert wird, wäre ein echter Fehler.
  Deine eigenen Daten willst du praktisch nie pro Rechnung abweichend haben.

**Umgesetzt in Schritt 6:** Das Formular führt die Empfängeradresse flach —
vier nebeneinanderliegende Felder sind einfacher zu bedienen als eine
verschachtelte Gruppe. Die Umwandlung in die verschachtelte Snapshot-Form
passiert im geteilten Schema, nicht im Service und nicht im Formular, damit
sie nur an einer Stelle existiert. `POST /api/invoices/:id/refresh-customer`
holt den aktuellen Stammdatenstand nach.

Technisch: `buyerData` ist ab dem Entwurf befüllt, die übrigen Snapshot-Spalten
sind `NULL`, bis finalisiert wird. Beim Rendern gilt: `sellerSnapshot ?? live
aufgelöste Company`. Ab `ISSUED` wird ausschließlich aus den Snapshots
gerendert, nie wieder aus Stammdaten.

### Warum JSON-Snapshots statt Snapshot-Tabellen oder Versionierung

Alternativen wären (B) eigene Snapshot-Tabellen pro Entität oder (C) voll
versionierte Stammdaten mit Verweis auf die Version. Beide sind korrekt, aber
für ein Single-User-Tool deutlich teurer: B verdoppelt die Tabellenzahl, C
macht jedes Stammdaten-Update zu einer Versionsoperation und jede Abfrage zu
einer Zeitreise. JSON-Snapshots sind hier die einfachste Lösung, die die
Anforderung vollständig erfüllt — mit `snapshotVersion` und Zod-Schema pro
Version bleiben sie auch langfristig lesbar.

### Immutability

Nach `ISSUED` ist alles gesperrt **außer** einer expliziten Whitelist:
`paidAt`, `sentAt`, interne Notizen (erscheinen nicht auf dem PDF).
Durchgesetzt auf drei Ebenen: Service-Guard, dedizierte Endpunkte statt
generischem PATCH, und ein DB-Trigger als letzte Absicherung.

**Umgesetzt in Schritt 1**, mit einer Eigenheit, die man kennen muss: SQLite
meldet einen Trigger-Abbruch als `SQLITE_CONSTRAINT_TRIGGER`, und Prisma
bildet den auf **`P2003`** ab — denselben Code wie eine echte
Fremdschlüsselverletzung, mit `constraint: null` und **ohne** den Text aus
dem `RAISE(ABORT, ...)`. Nur bei Roh-Queries (`$executeRaw`) kommt die
Meldung durch. Wer sich auf den Text verlässt, hält eine Sperrverletzung
später für einen Fremdschlüsselfehler. Deshalb gibt es
`apps/api/src/common/database-errors.ts` mit `isImmutabilityViolation()`,
das beide Formen erkennt; ein Regressionstest sichert das ab.

Korrektur einer ausgestellten Rechnung = **Storno + Neuausstellung**:
Die Original-Rechnung bleibt unverändert und erhält `cancelledAt` +
Verweis; es entsteht ein neues Storno-Dokument mit eigener Nummer und
negativen Beträgen; anschließend kann per „Duplizieren" eine korrigierte
Rechnung erstellt werden. Das entspricht der üblichen Erwartung an
GoBD-konforme Belegführung, ohne dass wir Buchhaltungslogik nachbauen.

### „Finalisierung zurücknehmen" (eng begrenztes Undo)

Für den Fall „Tippfehler zehn Sekunden nach dem Klick". Erlaubt **nur**, wenn
**alle** Bedingungen erfüllt sind — sonst 409 mit sprechender Begründung:

1. Status ist `ISSUED` (nicht `PAID`, nicht `CANCELLED`),
2. die Rechnung trägt die **zuletzt vergebene Nummer ihres Jahres**
   (`numberSeq === NumberSequence.nextValue - 1`),
3. `sentAt` ist leer — was der Kunde hat, wird nicht rückabgewickelt,
4. es existiert kein Storno-Dokument dazu.

Ablauf in einer Transaktion: Sequenz-Zähler um 1 zurücksetzen, `number`,
`numberYear`, `numberSeq` und alle Snapshots leeren, Status auf `DRAFT`,
gespeichertes PDF und `InvoiceDocument`-Datensatz löschen, `InvoiceEvent`
vom Typ `UNFINALIZED` mit der zurückgegebenen Nummer schreiben.

Die Bedingung „letzte Nummer des Jahres" ist der Kern: dadurch entsteht nie
eine Lücke, und die Nummer wird nur an denjenigen zurückgegeben, der sie
gerade gezogen hat. Ohne diese Bedingung wäre Undo ein Loch in der
Fortlaufendkeit. Die UI zeigt den Button deshalb auch nur, wenn er wirklich
zulässig ist, und benennt sonst den Grund.

**Umgesetzt in Schritt 9.** Die vier Bedingungen stehen als
`unfinalizeBlocker()` im geteilten Paket und werden an zwei Stellen benutzt:
Das Backend weist den Aufruf damit ab, und die Antwort trägt `canUnfinalize`
samt Begründung, damit die Oberfläche den Knopf gar nicht erst anbietet. Zwei
Formulierungen derselben Regel wären genau der Fall, in dem ein sichtbarer
Knopf mit 409 antwortet.

Weil Undo Nummern und Dokumente wieder freigibt, ist `InvoiceEvent` **kein
optionales Extra mehr, sondern Pflicht** — es ist die einzige Spur, dass eine
Nummer einmal vergeben und zurückgenommen wurde.

### Statusmodell

```
                    ┌────── unfinalize (eng begrenzt) ──────┐
                    ▼                                       │
DRAFT ──finalize──► ISSUED ──payment──► PAID ───────────────┘
  │                   │                   │
delete             cancel               cancel
  ▼                   ▼                   ▼
(weg)             CANCELLED           CANCELLED
```

- Vier gespeicherte Zustände: `DRAFT`, `ISSUED`, `PAID`, `CANCELLED`.
- `OVERDUE` wird **nicht gespeichert**, sondern aus `status = ISSUED &&
dueDate < heute` berechnet — sonst bräuchte es einen Cron-Job, der Zustände
  umschreibt, und ein Backup vom Vortag hätte falsche Zustände.
- „Versendet" ist kein Status, sondern das Feld `sentAt` — es ist orthogonal
  zum Bezahlstatus (versendet _und_ bezahlt, versendet _und_ offen).
- Zahlung ist in V1 nur `paidAt` (Datum oder leer). `PAID` ist damit ein
  abgeleiteter, aber gespeicherter Status: `paidAt` setzen ⇒ `PAID`,
  `paidAt` leeren ⇒ zurück auf `ISSUED`.
- **Teilzahlungen später:** die Migration ist klein — eine `Payment`-Tabelle
  ergänzen, bestehende `paidAt` als je einen Vollzahlungs-Datensatz
  übernehmen, den Status daraus berechnen. Deshalb ist der schmale Start
  hier kein Sackgassen-Risiko.

### Finalisierungs-Prüfung

Beim Finalisieren prüft der Server einmalig auf Vollständigkeit
(Pflichtangaben nach § 14 UStG: eigene Adresse + Steuernummer/USt-ID,
Empfängeradresse, Rechnungsdatum, Leistungsdatum, fortlaufende Nummer,
Entgelt und Steuersatz bzw. Hinweis auf Steuerbefreiung; bei Reverse Charge
zusätzlich USt-ID beider Seiten). Fehlt etwas, schlägt die Finalisierung mit
einer verständlichen Liste fehl. Rechtsberatung ersetzt das nicht.

**Umgesetzt in Schritt 9** als `checkFinalizable()` im geteilten Paket. Die
Liste kommt als `details` einer 409-Antwort mit dem Code
`FINALIZE_VALIDATION_FAILED` zurück und steht im Editor unter den Positionen —
nicht als „Etwas fehlt", sondern als die Aufzählung dessen, was fehlt.

---

## 9. Rechnungsnummern

**Vergabe erst beim Finalisieren.** Entwürfe haben keine Nummer (Anzeige:
„Entwurf #<id>"). Damit erzeugen gelöschte oder verworfene Entwürfe keine
Lücken — der häufigste Grund für unangenehme Rückfragen bei einer Prüfung.

Umsetzung:

- Tabelle `NumberSequence(scope, year, nextValue)`, `scope` z. B. `INVOICE`.
- Vergabe innerhalb **einer** interaktiven Prisma-Transaktion zusammen mit
  Snapshot-Erzeugung, PDF-Erzeugung und Statuswechsel.
- Prisma reicht auf SQLite kein `BEGIN IMMEDIATE` durch, deshalb dreifache
  Absicherung: bedingtes Update (`UPDATE NumberSequence SET nextValue = nextValue + 1
WHERE scope = ? AND year = ? AND nextValue = ?`, Ergebnis muss 1 Zeile sein),
  ein `UNIQUE`-Index auf `number`, und ein Retry bei Kollision. Bei einem
  Single-User-Tool ist echte Nebenläufigkeit ohnehin die Ausnahme — aber
  Doppelvergabe darf auch in der Ausnahme nicht passieren.
- Format konfigurierbar über ein Muster, Default `{YYYY}-{SEQ:3}` → `2026-001`.
  Das Muster liegt in `AppSetting` unter `invoice.numberPattern` (keine
  Oberfläche in V1) und kennt `{YYYY}`, `{YY}`, `{MM}` und `{SEQ:n}`. Es wird
  beim Lesen validiert und fällt bei Unsinn auf den Standard zurück, statt das
  Ausstellen unmöglich zu machen — und es darf keine Zeichen enthalten, die in
  einem Dateinamen unzulässig sind, weil die Nummer der Dateiname des PDFs ist.
- **Jahreswechsel:** Zähler-Jahr wird aus dem **Rechnungsdatum** abgeleitet
  (nicht aus `now()`). Wer am 03.01.2027 eine Rechnung mit Datum 31.12.2026
  finalisiert, bekommt korrekt `2026-0xx`. Ist das Zieljahr bereits
  „geschlossen" (spätere Nummern existieren), warnt die UI.
- **Storno:** eigenes Dokument, Nummer aus derselben Sequenz (bleibt
  lückenlos fortlaufend), `documentType = CANCELLATION`.
- **Rückgabe durch Undo:** „Finalisierung zurücknehmen" (Abschnitt 8) gibt die
  Nummer an die Sequenz zurück — aber nur die zuletzt vergebene. Damit bleibt
  die Sequenz lückenlos und monoton.

---

## 10. Steuerprofile

Bewusst datengetrieben, keine Steuerlogik im Code:

```
TaxProfile {
  name              "Deutschland 19 %", "EU B2B Reverse Charge", "Kleinunternehmer"
  kind              STANDARD | ZERO_RATED | REVERSE_CHARGE | SMALL_BUSINESS
  defaultRatePct    1900 (Basispunkte)
  noteText          Freitext, erscheint auf der Rechnung
  showTaxColumn     bool
  isDefault         bool
}
```

- Die Rechnung hat **ein** Profil auf Dokumentebene; es setzt den Vorschlag
  für neue Positionen. Jede Position trägt ihren eigenen Steuersatz, damit
  gemischte Rechnungen (19 % + 7 %) möglich sind.
- `kind` steuert nur drei Dinge: erzwungener Satz 0, automatischer
  Hinweistext, Sichtbarkeit der Steuerspalte. Mehr Steuerlogik gibt es nicht.
- Seed liefert die vier Beispielprofile; alles ist editierbar.
- Der Hinweistext wandert beim Finalisieren in `taxSnapshot`.

---

## 11. PDF-Architektur

```
Formulardaten ──► shared/calculateInvoice() ──► InvoiceRenderModel
                                                   │
              ┌────────────────────────────────────┴─────────────┐
              ▼                                                  ▼
  Frontend: <InvoiceDocument/> im iframe              Backend: renderToStaticMarkup
  (sofortige Live-Vorschau)                           + CSS ──► Puppeteer
                                                        page.setContent() ──► A4-PDF
```

**Ein Template, zwei Konsumenten.** `packages/invoice-template` exportiert
eine React-Komponente plus ihr CSS als String. Das Frontend rendert sie
direkt; das Backend rendert dieselbe Komponente mit
`react-dom/server` zu HTML und gibt es Puppeteer. Es gibt keine zweite
Template-Implementierung, die auseinanderlaufen könnte.

Regeln für Deckungsgleichheit Vorschau ↔ PDF:

- Template-CSS ist **eigenständiges Plain-CSS in mm/pt**, kein Tailwind
  (Tailwind ist rem-/viewport-basiert und für Druck ungeeignet).
- `@page { size: A4; margin: 0 }`, Seitenränder als Padding im Dokument.
- Schriften **selbst gehostet** und als `@font-face` mit Base64-Data-URI
  eingebettet — sonst rendert Puppeteer ohne Netzwerk andere Fallbacks.
- Puppeteer mit `printBackground: true`, `preferCSSPageSize: true`.
- Seitenumbruch über `break-inside: avoid` an Positionszeilen und
  Summenblock; wiederholter Tabellenkopf über `<thead>`.
- Ein Snapshot-Test rendert das Template mit Beispieldaten zu PDF und
  vergleicht (Pixel-Diff), damit Layout-Regressionen auffallen.

Puppeteer-Betrieb: ein **persistenter Browser** (Singleton mit Lazy-Start und
Idle-Shutdown), pro Render nur eine neue Page. Kaltstart kostet sonst
~1–2 s pro PDF. Im Docker-Image Chromium aus dem Paketmanager statt
Puppeteer-Download.

Bewertung der vorgeschlagenen Architektur: **sie ist für diesen Fall die
richtige.** Alternativen wären deklarative PDF-Bibliotheken
(`@react-pdf/renderer`, `pdfmake`) — die sind leichter und ohne Chromium,
aber man verliert echtes CSS-Layout, die Browser-Vorschau ist dann nicht mehr
identisch, und komplexere Layouts werden mühsam. Bei bereits vorhandener
Puppeteer-Erfahrung überwiegt der HTML/CSS-Weg klar.

---

## 12. Template-Architektur

V1: **ein** Template, aber hinter einer Registry-Schnittstelle, damit später
weitere hinzukommen können, ohne V1 zu verkomplizieren:

```
packages/invoice-template/
├── scripts/embed-fonts.mjs   erzeugt fonts.generated.ts aus @fontsource
├── src/
│   ├── types.ts              InvoiceRenderModel, TemplateDefinition
│   ├── render-model.ts       buildRenderModel(quelle, eingefroreneSummen?)
│   ├── registry.ts           löst templateKey auf, Rückfall auf classic
│   ├── fonts.generated.ts    Open Sans 400/700 als Base64 (eingecheckt)
│   ├── server.ts             renderInvoiceDocument() — eigener Einstiegspunkt
│   └── templates/classic/    ClassicTemplate.tsx · styles.ts
└── test/fixtures.ts          die Referenzrechnung als Modell
```

**Zwei Einstiegspunkte.** `server.ts` importiert `react-dom/server` und liegt
deshalb nicht im Haupt-Barrel: Das Frontend benutzt dieselbe Komponente, und
ein Import in der gemeinsamen Datei zöge den Server-Renderer in das
Browser-Bundle. Zwei Einstiegspunkte sind billiger als die Hoffnung, dass
Tree Shaking das schon richtet — ein Test im Build prüft, dass
`renderToStaticMarkup` nicht im Web-Bundle landet.

**Das CSS ist ein String, keine `.css`-Datei.** Es muss an zwei Orte, die
kein Bundler bedient: in ein `<style>` im Vorschau-iframe und in das
HTML-Dokument, das Puppeteer bekommt.

**Die Schrift ist eingebettet (D29).** Open Sans in Regular und Bold, als
Data-URI im CSS, rund 49 kB. Puppeteer rendert in einem Container, der weder
Netzwerk noch eine verlässliche Schriftauswahl hat; eine per URL eingebundene
Schrift fiele dort still auf einen Ersatz zurück, und ein Ersatz bricht
Zeilen anders um. Die Vorschau zeigte dann etwas anderes als das PDF —
genau das, was die gemeinsame Komponente verhindern soll. `pnpm --filter
@agentur-tool/invoice-template fonts` erzeugt die Datei neu; sie ist
eingecheckt, damit der Build nicht an der Erreichbarkeit von npm hängt.

**Seitenränder kommen im Druck aus `@page` (D31).** Ein Padding auf der
Seite wirkt nur auf der ersten Druckseite — auf Folgeseiten klebte die
Tabelle sonst am oberen Blattrand. Am Bildschirm bleibt das Padding, weil es
dort das sichtbare Blatt erzeugt. Puppeteer muss dafür mit
`preferCSSPageSize: true` und ohne eigene `margin`-Angabe aufgerufen werden
(umgesetzt in Schritt 8). Belegt durch `apps/api/test/pdf.test.ts`: Eine
34-Positionen-Rechnung ergibt zwei Seiten, und der bedruckbare Kasten ist auf
beiden derselbe — 12 mm links und oben, 16 mm unten für die Fußzeile. Der
Test liest diesen Kasten aus dem PDF; mit Padding statt `@page` stimmte er
nur auf Seite 1.

**Die Live-Vorschau (D30)** rendert die Komponente über ein React-Portal in
ein `about:blank`-iframe. Ein iframe, weil das Template ein eigenes
Stylesheet mitbringt, das sich mit Tailwinds Preflight in beide Richtungen
stören würde; ein Portal statt `srcdoc`, weil React so nur die geänderten
Knoten aktualisiert — bei `srcdoc` würde das Dokument bei jedem Tastendruck
neu aufgebaut, mit Flackern und verlorener Scrollposition.

Was die Vorschau **nicht** zeigt, ist der Seitenumbruch: Sie ist eine
fortlaufende Seite. Dafür gibt es seit Schritt 8 den Knopf „PDF
herunterladen" im Editor — er schickt die aktuellen, auch die noch nicht
gespeicherten Formularwerte an `POST /api/invoices/preview/pdf`.

**Abweichungen von der Referenzrechnung**, jeweils bewusst:

- Der Adresszusatz steht **über** der Straße (DIN 5008 und die Bedeutung des
  Feldes: „z. Hd. Buchhaltung"), in der Referenz stand er darunter.
- „PLZ Ort" ohne Komma, wie in Deutschland üblich.
- Die Rabattspalte erscheint nur, wenn mindestens eine Position einen Rabatt
  hat — sonst wäre es eine Spalte aus Nullen.
- Das Land wird weggelassen, wenn es dem des Absenders entspricht.
- Steuerzeilen im Summenblock entstehen je Steuersatz (D12); die Referenz
  hatte durchgehend 0 % und deshalb keine.

Aufbau des `classic`-Templates entsprechend der Referenzrechnung:
Kopf (Logo, Absenderdaten, Zahlungsdetails) → Empfängerblock + Metadaten
(Nummer, Rechnungs-, Leistungs-, Fälligkeitsdatum) → Überschrift →
Positionstabelle → Summenblock (Netto, Steuer je Satz, Rechnungsbetrag) →
Hinweise/Anmerkungen → Fußzeile.

**Konfigurierbar in V1 (D15, „mittel"):** Logo und Logogröße, Akzentfarbe,
Schriftauswahl aus 2–3 mitgelieferten Familien, Fußzeilentext, Standardtexte
(Zahlungshinweis, Grußformel). Bewusst **nicht** in V1: einzelne Blöcke
ein-/ausblendbar, Abstände und Spaltenbreiten — das sind genau die Optionen,
die Seitenumbruch-Kombinationen erzeugen, die man alle prüfen müsste.

`templateSnapshot` friert diese Werte beim Finalisieren ein — deshalb ändert
ein späterer Farb- oder Schriftwechsel alte Rechnungen nicht.

Damit spätere Templates ohne Umbau dazukommen können: Der `templateKey` steht
im Snapshot, die Registry löst ihn beim Rendern auf, und alte Templates
bleiben im Code, auch wenn sie nicht mehr auswählbar sind. Ohne das könnte
eine 2026er Rechnung 2029 nicht mehr identisch gerendert werden — was zwar
durch das gespeicherte PDF abgefangen wäre, aber die Duplizieren-Funktion
und jede Neuerzeugung nach einem Reparaturfall brechen würde.

---

## 13. PDF- und Dateispeicherung

**Entschieden: Variante C** — strukturierte Daten **und** eingefrorenes PDF.
(Ergab sich zwingend aus der Reproduzierbarkeitsanforderung im Context-Abschnitt
und aus D6/D8; A und B scheiden aus den folgenden Gründen aus.)

- A (nur Daten, PDF on demand) ist elegant, aber falsch für diesen Zweck:
  jede Code-, Template- oder Schriftänderung verändert rückwirkend das
  Dokument. Das widerspricht der Anforderung „exakt reproduzierbar".
- B (nur PDF) verliert Such-, Filter- und Auswertbarkeit sowie die Grundlage
  für Duplizieren und spätere Exporte.
- C kostet nur Speicher (~100 KB × wenige tausend = wenige hundert MB) und
  liefert beides.

Gespeichert wird im **Dateisystem** (`data/invoices/<jahr>/<nummer>.pdf`,
Assets unter `data/assets/<hash>`), Metadaten und SHA-256 in der Datenbank.
Die Alternative — PDF als BLOB in SQLite — hätte den Vorteil echter
Atomarität und eines einzigen Backup-Artefakts, lässt die Datenbank aber auf
mehrere hundert MB wachsen und macht die Dokumente außerhalb der Anwendung
unsichtbar. Die Konsistenzlücke des Dateisystems ist mit wenig Aufwand
schließbar, die Nachteile des BLOB-Wegs nicht.

**Konsistenzprotokoll beim Finalisieren** (Dateisystem und DB dürfen nicht
auseinanderlaufen). Umgesetzt in Schritt 9, mit einer Korrektur gegenüber der
ersten Fassung dieses Abschnitts: Dort stand das PDF **vor** der Transaktion.
Das geht nicht — auf dem Dokument steht die Rechnungsnummer, und die gibt es
erst, wenn der Zähler gezogen ist. Das Drucken liegt deshalb **in** der
Transaktion:

1. Transaktion öffnen und die Nummer ziehen (bedingtes Update, Abschnitt 9).
2. Mit dieser Nummer das PDF rendern, unter `data/tmp/<uuid>.pdf` schreiben,
   SHA-256 bilden.
3. Weiter in derselben Transaktion: Snapshots schreiben, Status auf `ISSUED`,
   `InvoiceDocument`-Datensatz mit Zielpfad und Hash anlegen, `InvoiceEvent`
   schreiben. Bricht irgendetwas davon ab, wird zurückgerollt und die
   temporäre Datei verworfen — die Nummer ist dann nicht verbraucht und es
   entsteht kein halb ausgestelltes Dokument.
4. Nach erfolgreichem Commit die Datei an den Zielpfad verschieben
   (`rename`, atomar innerhalb desselben Dateisystems).
5. Beim Start prüft ein kleiner Reconciler: `InvoiceDocument`-Zeilen ohne
   Datei werden protokolliert und in der UI als reparierbar markiert
   (`documentMissing` in der Antwort, Knopf „PDF neu erzeugen"); verwaiste
   Dateien ohne Zeile wandern nach `data/orphans/` statt gelöscht zu werden.

Der Preis der Umkehrung: Chromium druckt, während die Schreibsperre der
Datenbank gehalten wird — knapp eine Sekunde. Bei einem Einzelplatzwerkzeug
ist das der günstigere Tausch. Die Alternative wäre ein Fenster, in dem eine
Nummer vergeben, aber keine Rechnung ausgestellt ist, und genau das erzeugt
die Lücke, die die späte Nummernvergabe vermeiden soll. Das Zeitlimit der
Transaktion ist deshalb auf 120 Sekunden gesetzt; die Voreinstellung von fünf
reicht für eine lange Rechnung auf einer langsamen Maschine nicht sicher.

Der einzige verbleibende Bruchfall ist ein Absturz zwischen Commit und
Verschieben: Dann gibt es einen Datensatz ohne Datei. Er ist beim Start
sichtbar und aus dem Snapshot reparierbar — deshalb ist er tragbar.

Weitere Regeln:

- Download liefert **immer** die gespeicherte Datei, nie eine Neuerzeugung.
- Nur Entwürfe werden bei jedem Aufruf frisch gerendert.
- Ausgeliefert ausschließlich über authentifizierte API-Routen, nie als
  öffentliches Static-Verzeichnis.
- Beim Backup gilt eine feste Reihenfolge: erst die Datenbank sichern, dann
  die Dateien. So kann das Backup höchstens Dateien enthalten, die die DB noch
  nicht kennt — nie umgekehrt. Ein Verifikationsschritt vergleicht die Hashes.

---

## 13a. Der PDF-Dienst (Schritt 8)

Zwei Klassen, weil sie zwei verschiedene Dinge wissen müssen:

- **`PdfService`** kennt nur Chromium: einen Browser starten, HTML drucken.
  Er weiß nichts über Rechnungen.
- **`InvoicePdfService`** baut das Dokument: Render-Modell aus Rechnung und
  Stammdaten oder Snapshots, HTML über `renderInvoiceDocument`, Dateiname.

Der Schnitt ist nicht kosmetisch: `buildHtml()` lässt sich ohne Browser
prüfen, und genau dort sitzen die Fehler, die teuer wären — falscher
Snapshot, fehlendes Logo, neu gerechnete statt eingefrorener Summen.

**Ein Browser für die Laufzeit, gestartet beim ersten PDF.** Ein Kaltstart
kostet je nach Maschine 200 bis 600 ms; wer an einer Rechnung schreibt,
sieht sich den Umbruch mehrfach an. Wer nur Stammdaten pflegt, soll dafür
kein Chromium im Speicher haben. Renderläufe laufen nacheinander — bei einem
Einzelplatzwerkzeug bringt Parallelität nichts und kostet Speicher.

**`puppeteer-core` statt `puppeteer` (D32).** Das große Paket lädt bei jeder
Installation ein eigenes Chromium (~150 MB) und legte im Image ein zweites
neben das des Paketmanagers. Der Preis dafür ist `apps/api/src/pdf/chromium.ts`:
`PUPPETEER_EXECUTABLE_PATH`, sonst die üblichen Orte, sonst eine Meldung, die
sagt, was zu tun ist. Fehlt Chromium, ist das ein Konfigurationsfehler beim
Aufsetzen und kein Ausfall im Betrieb — die Anwendung startet trotzdem, nur
das PDF entsteht nicht.

**Sandbox bleibt an.** `--no-sandbox` nur, wenn `PUPPETEER_NO_SANDBOX=true`
ausdrücklich gesetzt ist — vorgesehen für den Container, in dem der Prozess
ohnehin isoliert und unprivilegiert läuft (Abschnitt 16).

**Die Fußzeile mit der Seitenzahl** kommt aus `renderInvoiceFooterTemplate()`
im Template-Paket, nicht aus dem Backend: Sie muss den Seitenrand kennen und
in den Platz passen, den `@page` unten frei lässt. Chromium rendert dieses
Fragment in einem eigenen Dokument, ohne das Stylesheet der Seite — deshalb
steht ihr CSS inline und ihre Schrift ist eine generische.

**Wege zum PDF**, beide über `Content-Disposition: inline` und `no-store`:

| Route                                   | Quelle                                                      |
| --------------------------------------- | ----------------------------------------------------------- |
| `GET /api/invoices/:id/pdf`             | Entwurf: frisch gerendert · ausgestellt: gespeicherte Datei |
| `POST /api/invoices/preview/pdf`        | ungespeicherte Formulardaten, nichts wird angelegt          |
| `POST /api/invoices/:id/regenerate-pdf` | Reparaturweg: aus dem Snapshot neu erzeugt und abgelegt     |

`no-store` ist wichtiger, als es klingt: Ein Entwurfs-PDF sieht nach der
nächsten Änderung anders aus, und ein Blatt aus dem Browser-Cache wäre genau
das Missverständnis, das der Blick auf den Umbruch vermeiden soll.

Seit Schritt 9 legt das Finalisieren das erzeugte PDF ab, und der Download
einer ausgestellten Rechnung liefert genau diese Datei — nie eine
Neuerzeugung (Abschnitt 13). Fehlt sie, wird ersatzweise aus dem Snapshot
gerendert und die Antwort meldet `documentMissing`; dauerhaft repariert wird
über `regenerate-pdf`.

---

## 14. API-Struktur

REST/JSON, Zod-validiert, Präfix `/api`. Zustandsübergänge sind eigene
Endpunkte statt `PATCH { status }` — das macht die Immutability-Regeln
explizit und verhindert versehentliche Statuswechsel.

```
GET    /api/health

GET    /api/company                    PUT /api/company
POST   /api/company/logo               DELETE /api/company/logo

GET    /api/customers?q=&archived=     POST /api/customers
GET    /api/customers/:id              PATCH  /api/customers/:id
DELETE /api/customers/:id              (soft: archivedAt)

GET    /api/tax-profiles               POST /api/tax-profiles
PATCH  /api/tax-profiles/:id           DELETE /api/tax-profiles/:id

GET    /api/template-settings          PUT  /api/template-settings

GET    /api/invoices?status=&year=&customerId=&q=&page=&sort=
POST   /api/invoices                   Entwurf anlegen
GET    /api/invoices/:id
PATCH  /api/invoices/:id               nur DRAFT → sonst 409
DELETE /api/invoices/:id               nur DRAFT
POST   /api/invoices/:id/finalize      → Nummer + Snapshot + PDF
POST   /api/invoices/:id/unfinalize    → nur unter den Bedingungen aus Abschnitt 8
POST   /api/invoices/:id/cancel        → Storno-Dokument
POST   /api/invoices/:id/duplicate     → neuer Entwurf
POST   /api/invoices/:id/payment       { paidAt | null }
POST   /api/invoices/:id/sent          { sentAt | null }
GET    /api/invoices/:id/pdf           gespeichertes PDF (bzw. Draft-Render)
POST   /api/invoices/preview/pdf       ungespeicherte Formulardaten → PDF
POST   /api/invoices/:id/regenerate-pdf   PDF aus dem Snapshot neu ablegen

POST   /api/backup/export              GET /api/backup/status
```

Fehler einheitlich als `{ error: { code, message, details? } }`;
Domänenverletzungen als `409 Conflict` mit sprechendem `code`
(`INVOICE_NOT_EDITABLE`, `NUMBER_SEQUENCE_CONFLICT`, `FINALIZE_VALIDATION_FAILED`).

Zu GraphQL/tRPC: tRPC wäre bei einem TS-Monorepo verlockend
(End-to-End-Typen ohne Codegen), koppelt Frontend und Backend aber eng und
erschwert spätere externe Zugriffe. REST + geteilte Zod-Schemas liefert fast
dieselbe Typsicherheit bei besserer Entkopplung. **Empfehlung: REST.**

---

## 15. Datenbank

**SQLite ist für diesen Anwendungsfall richtig.** Bei wenigen tausend
Datensätzen ist Datenmenge kein Thema; der einzige echte Nachteil (ein
Schreiber gleichzeitig) ist bei einem Single-User-Tool irrelevant.

Betrieb:

- WAL-Modus, `foreign_keys = ON`, `busy_timeout` gesetzt — beim Start durch
  `PrismaService.applyPragmas()`. Wichtig: über `$queryRaw`, **nicht** über
  `$executeRaw`. `PRAGMA journal_mode` und `PRAGMA busy_timeout` liefern
  ihren neuen Wert als Ergebniszeile zurück, und `$executeRaw` bricht bei
  Statements mit Ergebnis ab ("Execute returned results, which is not
  allowed in SQLite") — der Anwendungsstart scheitert dann vollständig.
  Ein Regressionstest deckt das ab.
- Zahlen aus Roh-Queries kommen als `BigInt` zurück, nicht als `number`.
- Alle Geldbeträge als `INTEGER`, keine `REAL`-Spalten.
- Bewusst **keine** SQLite-spezifischen Konstrukte, damit ein späterer
  Wechsel auf PostgreSQL ein Provider-Tausch bleibt und kein Rewrite.

Grenzen für eine spätere gehostete Version: mehrere App-Instanzen /
horizontale Skalierung, Netzwerkzugriff auf die DB, echte
Nebenläufigkeit beim Schreiben, verwaltete Backups/Replikation beim Hoster.
Alles davon trifft ein Single-User-Tool auf einem VPS nicht. Falls doch:
Umstieg auf PostgreSQL bei dieser Datenmenge ein überschaubarer Aufwand.

Migrationen mit **Prisma Migrate**: `prisma migrate dev` in der Entwicklung,
`prisma migrate deploy` beim Start des Containers. Migrationsdateien liegen
versioniert im Repo und werden bei Bedarf von Hand um SQL ergänzt
(`CHECK`-Constraints, Immutability-Trigger, Indizes). Immer vorwärts, kein
Auto-Rollback in Produktion, vor jeder Migration automatisches Backup.
`prisma db push` ausschließlich lokal beim Herumprobieren, nie auf echten Daten.

Seed: Standard-Steuerprofile, leere Company, Default-Template-Settings.

---

## 16. Sicherheit

Grundsätze unabhängig vom Betriebsmodell:

- Alle Secrets ausschließlich über Environment-Variablen, `.env` gitignored,
  `.env.example` im Repo.
- Uploads: MIME- und Magic-Byte-Prüfung, Größenlimit, Speicherung unter
  generiertem Namen (Hash), niemals unter dem Originaldateinamen.
- Ausgabe: PDFs und Assets nur über die API, nie statisch.
- Eingaben serverseitig mit Zod validiert, ORM-parametrisierte Queries.
- Rechnungs-Template rendert nur Text (React escapt), kein `dangerouslySetInnerHTML`.
- Puppeteer sandboxed, kein `--no-sandbox` außerhalb von Docker mit eigenem User.

### Zugriffsmodell: Tailscale + Login (D18)

Zwei Schichten, die unabhängig voneinander tragen:

1. **Netzwerkebene — Tailscale.** Der Dienst wird ausschließlich an die
   Tailscale-Adresse gebunden, nicht an `0.0.0.0`. Kein offener Port, kein
   öffentlich erreichbarer Login-Endpunkt, keine Bot-Scans, keine
   Brute-Force-Versuche aus dem Internet. HTTPS-Zertifikate kommen über
   `tailscale cert` / Tailscale Serve — kein Let's Encrypt und kein Caddy
   nötig. Funktioniert auf Windows, macOS und iOS.
2. **Anwendungsebene — Login.** Trotzdem aktiv, für den Fall, dass ein Gerät
   verloren geht oder entwendet wird: Passwort mit **argon2id**,
   serverseitige **Session-Cookies** (httpOnly, Secure, SameSite=Lax) in der
   Datenbank — kein JWT, weil Widerruf mit Sessions trivial ist und mit JWT
   nicht. Rate-Limiting auf dem Login, generische Fehlermeldungen,
   konstante Antwortzeit.

Ein Benutzer genügt in V1; das Schema bekommt trotzdem eine `User`-Tabelle
statt eines Passwort-Hashes in den Einstellungen, weil das später mehrere
Benutzer ohne Migration erlaubt. TOTP als zweiter Faktor ist nachrüstbar,
aber hinter Tailscale kein vordringlicher Bedarf.

Falls du später doch öffentliche Erreichbarkeit willst (z. B. Zugriff von
einem fremden Rechner ohne Tailscale-Client), ist der Weg vorbereitet: Caddy
als Reverse Proxy mit automatischem Let's Encrypt davorschalten, HSTS und
Security-Header setzen, CORS restriktiv halten. Die Anwendung selbst ändert
sich dafür nicht — der Login ist ja bereits aktiv.

---

## 17. Backup

Ziel: eine Datei, die alles enthält, und ein Weg zurück, den man auch unter
Stress noch versteht.

- **Inhalt:** SQLite-Datenbank + `assets/` + `invoices/*.pdf` +
  Template-/App-Einstellungen + Manifest (Schema-Version, App-Version,
  Zeitstempel, Datei-Hashes).
- **Konsistenz:** Datenbank per `VACUUM INTO` in eine Kopie schreiben —
  ein einfaches `cp` auf eine WAL-Datenbank kann korrupt sein.
- **Ergebnis:** ein `.zip`/`.tar.gz` mit Zeitstempel.
- **Auslösung:** Button in den Einstellungen (Download), zusätzlich ein
  `pnpm backup`-Skript und im VPS-Betrieb ein nächtlicher Cron mit
  Aufbewahrung (z. B. 14 täglich / 8 wöchentlich / 12 monatlich).
- **Offsite:** Sync des Backup-Ordners (z. B. `restic`/`rclone` auf einen
  S3-kompatiblen Speicher oder in einen Cloud-Ordner). 3-2-1-Regel.
- **Restore:** `pnpm restore <archiv>` — App stoppen, `data/` ersetzen,
  Migrationen anwenden, starten. Restore muss **einmal getestet** werden;
  ein ungetestetes Backup ist kein Backup.
- Automatisches Backup zusätzlich vor jeder Migration.

---

## 18. Lokale Nutzung

Entwicklung: `pnpm dev` startet Vite (Port 5173) und API (Port 3000) parallel,
Vite-Proxy für `/api`. SQLite unter `./data/`.

Lokaler „Produktivbetrieb": ein Befehl (`pnpm start` oder
`docker compose up -d`), API liefert das gebaute Frontend statisch mit, alles
unter `http://127.0.0.1:3000`. Bindung explizit an `127.0.0.1`, nicht `0.0.0.0`.

---

## 19. Mögliche spätere Online-Bereitstellung

Vorbereitung, die **jetzt** fast nichts kostet und später viel spart:

- Ein Docker-Image (Node + Chromium), das API und gebautes Frontend enthält.
- Ein Volume `/data` für Datenbank, Assets und PDFs.
- Konfiguration ausschließlich über Environment-Variablen, inkl.
  `AUTH_ENABLED`, `PUBLIC_URL`, `DATA_DIR`.
- Auth-Modul von Anfang an vorhanden, lokal per Flag deaktiviert.
- Keine Annahme „läuft auf localhost" im Code (absolute URLs aus Config).

Deployment später: VPS mit Tailscale im Tailnet, `docker compose up -d`,
Bindung an die Tailscale-Adresse, Zertifikat über Tailscale. Update per
`git pull && docker compose up -d --build`, nächtliches Backup per Cron.
Zugriff von iPhone/Mac/Windows über den Browser; die SPA wird responsiv genug
gebaut, dass Ansehen, Suche und Statusänderungen mobil funktionieren
(Rechnungserstellung bleibt eine Desktop-Aufgabe).

Ein Detail für den VPS: Chromium für Puppeteer kommt aus dem Paketmanager des
Images (`PUPPETEER_SKIP_DOWNLOAD`, `PUPPETEER_EXECUTABLE_PATH`), nicht aus dem
npm-Download — sonst wird das Image unnötig groß und bei jedem Build neu
geladen. Der Container braucht außerdem die üblichen Chromium-Bibliotheken
und läuft als unprivilegierter Benutzer.

---

## 20. Reihenfolge der Implementierung

Jeder Schritt endet mit etwas Lauffähigem.

| #    | Schritt                                                                    | Ergebnis                        |
| ---- | -------------------------------------------------------------------------- | ------------------------------- |
| 0 ✅ | Monorepo-Gerüst, TS-Configs, Lint/Format, `shared`-Skeleton                | `pnpm dev` läuft                |
| 1 ✅ | DB-Schema, Migrationen, Seed                                               | Datenbank steht                 |
| 2 ✅ | Company-Einstellungen inkl. Logo-Upload                                    | erster vertikaler Durchstich    |
| 3 ✅ | Kundenverwaltung (CRUD, Liste, Suche)                                      | zweite Domäne, Muster etabliert |
| 4 ✅ | Steuerprofile                                                              | Stammdaten komplett             |
| 5 ✅ | Berechnungslogik in `shared` + Unit-Tests                                  | Kern abgesichert                |
| 6 ✅ | Rechnungs-Entwurf: API + Editor mit dynamischen Positionen                 | Rechnungen erfassbar            |
| 7 ✅ | `invoice-template` + Live-Vorschau im iframe                               | sichtbares Ergebnis             |
| 8 ✅ | PDF-Service (Puppeteer) + Entwurfs-PDF                                     | PDF-Pipeline steht              |
| 9 ✅ | Nummernvergabe + Snapshots + Finalisieren + PDF-Ablage                     | **Kernfunktion fertig**         |
| 10   | Status: bezahlt/versendet, Stornieren, Duplizieren                         | Lebenszyklus komplett           |
| 11   | Rechnungsübersicht mit Filter/Sortierung + Dashboard                       | Alltagstauglich                 |
| 12   | Backup-Export/Restore + Restore-Test                                       | Datensicherheit                 |
| 13   | Docker-Image + Auth-Modul (per `AUTH_ENABLED`), Tailscale-Anbindung        | deploy-fähig                    |
| 14   | Politur: Fehlerbehandlung, Leerzustände, Tastaturbedienung, Responsiveness | V1                              |

Tests bewusst schmal, aber gezielt: Berechnungen und Nummernvergabe mit
Unit-Tests, Finalisierung als Integrationstest, ein PDF-Snapshot-Test.
Kein flächendeckendes UI-Testing im MVP.

---

## 21. Abgrenzung MVP ↔ später

| Bereich          | V1                               | Später                                              |
| ---------------- | -------------------------------- | --------------------------------------------------- |
| Dokumenttypen    | Rechnung, Storno                 | Angebot, Auftragsbestätigung, Mahnung, Gutschrift   |
| Templates        | 1 Template + Optionen            | mehrere Templates, mehr Optionen                    |
| Versand          | PDF-Download                     | E-Mail-Versand, Anhänge, Versandprotokoll           |
| Zahlungen        | bezahlt am / offen               | Teilzahlungen, Zahlungserinnerungen, Mahnstufen     |
| Positionen       | frei erfasst                     | Produkt-/Leistungskatalog, Import aus Zeiterfassung |
| Wiederholung     | Duplizieren                      | echte wiederkehrende Rechnungen mit Zeitplan        |
| Export           | Backup-Archiv                    | CSV, DATEV-nah, Steuerberater-Paket                 |
| Mandanten/Nutzer | einer                            | mehrere Unternehmen, mehrere Benutzer, Rollen       |
| Auswertung       | Dashboard mit letzten Rechnungen | Umsatzübersichten, Statistiken, offene Posten       |
| E-Rechnung       | nur PDF                          | ZUGFeRD / XRechnung (siehe unten)                   |

**Hinweis E-Rechnung (strategisch relevant):** In Deutschland läuft die
Umstellung auf strukturierte E-Rechnungen im B2B-Bereich stufenweise; die
Empfangspflicht gilt bereits, Ausstellungspflichten greifen gestaffelt in den
Folgejahren (bitte den für dich geltenden Stand und Termin selbst prüfen bzw.
mit dem Steuerberater klären). Für uns heißt das: **kein Feature für V1**,
aber das Datenmodell wird so gebaut, dass es später ohne Umbau geht — also
vollständig strukturierte Positionsdaten, Steuerkategorie je Position,
Einheiten, Zahlungsbedingungen und Käufer-/Verkäufer-Identifikatoren sauber
getrennt gespeichert (statt nur als Freitext auf dem PDF). Der spätere
ZUGFeRD-Schritt ist dann ein zusätzlicher Erzeugungsschritt (XML einbetten,
PDF/A-3), keine Datenmodell-Migration.

---

## 22. ENTSCHEIDUNGEN — Verlauf und offene Punkte

Alle 20 identifizierten Entscheidungen sind getroffen; die Ergebnisse stehen
in der Tabelle am Anfang des Dokuments. Der Verlauf zur Nachvollziehbarkeit:

### Runde 1 — Fundament ✅ entschieden

Siehe Tabelle am Anfang des Dokuments (D1–D4).

### Runde 2 — Rechnungs-Lebenszyklus und Historie ✅ entschieden

Siehe Tabelle am Anfang des Dokuments (D5–D8).

**D10 — Storno-Nummernkreis:** vorgeschlagen und offen für Widerspruch:
Storno-Dokumente ziehen ihre Nummer aus **derselben** Sequenz wie Rechnungen
(also `2026-014` als Storno zu `2026-013`), nicht aus einem eigenen Kreis
(`S-2026-001`). Grund: eine einzige lückenlos fortlaufende Reihe über alle
ausgehenden Belege ist am einfachsten zu erklären und zu prüfen. Der
Dokumenttyp steht ohnehin auf dem PDF und im Feld `documentType`.

### Runde 3 — Berechnung und Datenmodell-Details ✅ entschieden

Siehe Tabelle am Anfang des Dokuments (D9–D12, D16).

### Runde 4 — PDF, Template, Betrieb ✅ entschieden

Siehe Tabelle am Anfang des Dokuments (D13–D15, D17–D20).

### Offen bleibt bewusst

Nichts, was den Implementierungsstart blockiert. Diese Punkte klären wir,
wenn wir dort ankommen:

- Konkretes Aussehen des `classic`-Templates — wird an der Referenzrechnung
  ausgerichtet, sobald wir bei Schritt 7 sind.
- Standard-Zahlungsziel und Standardtexte — Stammdatenpflege, keine Architektur.
- Ob die Kundennummer automatisch vergeben wird oder frei eingegeben.
- Ob Rechnungen als Storno-Grund einen Pflichttext bekommen.

---

## 23. Verifikation

Womit wir prüfen, dass es wirklich funktioniert — nicht nur kompiliert.

**Automatisiert (Vitest):**

- `packages/shared`: der Rechenweg aus Abschnitt 7 mit Grenzfällen —
  gemischte Steuersätze, Prozent- und Betragsrabatt, Menge `0`, negative
  Beträge, und der Test „Storno + Original = exakt 0" für das symmetrische
  Runden.
- Nummernvergabe: zwei gleichzeitige Finalisierungen ergeben zwei
  verschiedene Nummern; Jahreswechsel über das Rechnungsdatum; Undo gibt
  genau die letzte Nummer zurück und wird bei vorletzter Nummer, bei
  `sentAt` und bei `PAID` abgelehnt.
- Finalisierung als Integrationstest gegen eine temporäre SQLite-Datei:
  Snapshots vollständig, Status korrekt, `InvoiceDocument` vorhanden,
  anschließende `PATCH`-Versuche liefern 409.
- Der Immutability-DB-Trigger: direkter `UPDATE` auf eine `ISSUED`-Rechnung
  am Service vorbei muss scheitern.
- PDF-Snapshot: das `classic`-Template mit festen Beispieldaten rendern und
  gegen eine Referenz vergleichen (Pixel-Diff mit kleiner Toleranz).

**Manuell, einmal am Stück durchgespielt:**

1. Firmendaten inkl. Logo speichern, Kunde anlegen, Steuerprofile prüfen.
2. Rechnung mit drei Positionen erstellen, davon eine mit 7 % und eine mit
   Rabatt; Summen gegen eine Handrechnung prüfen.
3. Vorschau und erzeugtes PDF nebeneinander legen — Ränder, Schrift,
   Umbruch, Farben müssen übereinstimmen.
4. Rechnung mit so vielen Positionen, dass sie zweiseitig wird:
   Tabellenkopf wiederholt sich, Summenblock wird nicht zerrissen.
5. Finalisieren → Nummer prüfen, PDF herunterladen, `PATCH` per `curl`
   versuchen (muss 409 liefern).
6. Kundenadresse ändern → die finalisierte Rechnung zeigt weiterhin die alte;
   ein neuer Entwurf zeigt die neue. **Das ist der wichtigste Einzeltest.**
7. Undo direkt nach dem Finalisieren; danach neu finalisieren — dieselbe
   Nummer muss wieder vergeben werden.
8. Stornieren, Duplizieren, „bezahlt am" setzen, Übersicht filtern.
9. Backup erzeugen, `data/` löschen, aus dem Backup wiederherstellen, alle
   Rechnungen und PDFs sind wieder da und die Hashes stimmen.
   **Dieser Test wird einmal wirklich durchgeführt, nicht nur geplant.**

---

## Nächster Schritt

Alle Entscheidungen sind getroffen (D1–D20). Die Implementierung folgt der
Reihenfolge aus Abschnitt 20, beginnend mit Schritt 0 (Monorepo-Gerüst) und
Schritt 1 (Schema + Migrationen). Neue Entscheidungen von Tragweite, die
während der Umsetzung auftauchen, werden wie bisher vorher abgestimmt.
