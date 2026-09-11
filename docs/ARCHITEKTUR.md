# Projektplan: Eigene Rechnungssoftware ("AgenturTool")

**Status:** v2.0 — V1 steht, und die Anwendung wird als Desktop-Anwendung
für macOS und Windows ausgeliefert (D1, D34). Die Daten sind gesichert und
der Weg zurück ist einmal wirklich gegangen worden (Abschnitt 17).
**Repository:** `Kalabedo/AgenturTool`

Dieses Dokument ist die verbindliche Architekturgrundlage. Es wird mit dem Code
fortgeschrieben: Wenn eine Entscheidung sich im Lauf der Umsetzung ändert, wird
sie hier korrigiert und nicht nur im Code.

### Getroffene Entscheidungen

| ID  | Thema                    | Gewählt                                                                                                                                                                       |
| --- | ------------------------ | ----------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| D1  | Betriebsmodell           | **Desktop-Anwendung** (Electron; Server im Hauptprozess, Daten in `userData`, Auth-Modul vorhanden aber deaktiviert) — ersetzt das ursprüngliche Docker-Image (Abschnitt 16a) |
| D2  | Datenbank                | **SQLite** (portabel gehalten für späteren Postgres-Wechsel)                                                                                                                  |
| D3  | DB-Zugriff               | **Prisma**                                                                                                                                                                    |
| D4  | Backend                  | **NestJS**                                                                                                                                                                    |
| D5  | Rechnungsnummer          | **Erst beim Finalisieren** vergeben                                                                                                                                           |
| D6  | Nach Finalisierung       | **Gesperrt + Storno**, plus eng begrenztes „Finalisierung zurücknehmen"                                                                                                       |
| D7  | Zahlungen                | **Nur `paidAt`** (Teilzahlungen später)                                                                                                                                       |
| D8  | Historische Daten        | **JSON-Snapshots auf der Rechnung**                                                                                                                                           |
| D9  | Entwurfsdaten            | **Kunde kopiert** (editierbar + Refresh), **eigene Firmendaten live** bis zum Finalisieren                                                                                    |
| D10 | Storno-Nummern           | **Dieselbe Sequenz** wie Rechnungen                                                                                                                                           |
| D11 | Rabatt                   | **Je Position**, umschaltbar Prozent ⇄ Betrag; kein Gesamtrabatt                                                                                                              |
| D12 | Rundung                  | **Steuer je Steuersatzgruppe** auf Summenebene                                                                                                                                |
| D13 | PDF-Ablage               | **Dateisystem** + Metadaten/Hash in der DB                                                                                                                                    |
| D14 | Vorschau                 | **React-Template im iframe** (eine Implementierung, zwei Konsumenten)                                                                                                         |
| D15 | Template-Optionen V1     | **Mittel**: Logo/-größe, Akzentfarbe, Schrift (2–3), Fußzeile, Standardtexte                                                                                                  |
| D16 | Preiseingabe             | **Nur netto**                                                                                                                                                                 |
| D17 | Auth in V1               | **Vorhanden, per `AUTH_ENABLED` deaktiviert** (folgt aus D1)                                                                                                                  |
| D18 | ~~Späterer Zugriff~~     | ~~Tailscale + aktiver Login~~ — gegenstandslos mit D1 (Abschnitt 16)                                                                                                          |
| D19 | Backup                   | Button in der App **und** Skript für Cron; Offsite optional                                                                                                                   |
| D20 | Tooling                  | pnpm, kein Turborepo, Vitest, ESLint + Prettier                                                                                                                               |
| D21 | Kalenderdaten            | **ISO-String `"YYYY-MM-DD"`**; echte Zeitstempel bleiben `DateTime`                                                                                                           |
| D22 | Kundennummer             | **Freies Feld, optional, eindeutig wenn gesetzt**                                                                                                                             |
| D23 | Primärschlüssel          | `Int @id @default(autoincrement())`                                                                                                                                           |
| D24 | Build der Pakete         | `tsup` → ESM + CJS + `.d.ts` (NestJS läuft CJS, Vite ESM)                                                                                                                     |
| D29 | Schrift im Dokument      | **Open Sans, als Base64 im Paket eingebettet** — kein Netzwerkzugriff beim PDF-Rendern                                                                                        |
| D30 | Vorschau-Einbindung      | **iframe + React-Portal** (nicht `srcdoc`): dieselbe Komponente wie im PDF, inkrementell aktualisiert                                                                         |
| D31 | Seitenränder             | **`@page`-Ränder im Druck**, Padding nur am Bildschirm — Padding wirkt sonst nur auf der ersten Seite                                                                         |
| D32 | ~~Puppeteer-Paket~~      | ~~`puppeteer-core` mit gefundenem Chromium~~ — überholt durch D34                                                                                                             |
| D33 | Backup-Format            | **ZIP** statt tar.gz — mit Bordmitteln auf Windows, macOS und iOS zu öffnen (Abschnitt 17)                                                                                    |
| D34 | PDF-Renderer             | **Electrons `printToPDF`** statt eines ferngesteuerten Browsers — die Anwendung bringt ihr Chromium mit (Abschnitt 13a)                                                       |
| D35 | asar-Archiv              | **Keins.** Prisma startet und lädt seine Engines über selbst gebildete Pfade, an Electrons asar-Umleitung vorbei (Abschnitt 16a)                                              |
| D36 | Netzverkehr des Fensters | **Alles außer der Rückschleife wird abgewiesen** — ein `webRequest`-Filter, wie ihn der PDF-Renderer schon hat (Abschnitt 16)                                                 |
| D37 | Steuerberater-Export     | **Ehrliches Übergabe-ZIP** aus Snapshots, CSV und Originalbelegen; kein vorgeblicher DATEV-Stapel ohne Konten-/Kanzleikonfiguration (Abschnitt 26)                            |
| D38 | Verkaufskanal            | **Eigene Website zuerst**; Microsoft Store und Mac App Store bleiben optionale spätere Zusatzkanäle                                                                          |
| D39 | Lizenzmodell             | **Einmalkauf mit dauerhaftem Nutzungsrecht**; zwölf Monate Updates inklusive, danach optional bezahlbare Verlängerung des Updatezeitraums                                    |
| D40 | Offline-Nutzung          | **Keine dauerhafte Aktivierungspflicht.** Nach einmaliger Aktivierung beziehungsweise Import einer signierten Lizenzdatei funktioniert die berechtigte Version dauerhaft offline |
| D41 | Anwendungsupdates        | **Eigener, signierter Updatekanal** über eine fest erlaubte HTTPS-Domain; Prüfung im Electron-Hauptprozess, Installation nur nach Zustimmung und lokalem Backup               |
| D42 | App-Identität            | **Stabil ab öffentlichem Release:** `AgenturTool`, App-ID `de.agenturtool.app`, bestehende Datenpfade und dieselben Herausgeber-/Signaturidentitäten                           |
| D43 | Externe Verbindungen     | **Nach Zweck getrennt und minimal erlaubt:** Updates, Aktivierung und bewusst ausgelöster E-Mail-Versand; keine Telemetrie und keine Kunden- oder Rechnungsdaten beim Updatecheck |
| D44 | Preisvalidierung         | **Vor Ausbau des Vertriebs und weiterer großer Module** mit Solo-Agenturen testen; Preis zunächst Hypothese, kein allein aus Entwicklungskosten abgeleiteter Beschluss        |

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
15. Steuerberater-Paket als CSV + PDF/XML für einen Rechnungszeitraum

**Raus (später):** Angebote, Mahnungen, E-Mail-Versand, wiederkehrende
Rechnungen, Produktkatalog, DATEV-Buchungsstapel, Statistiken, mehrere Templates,
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
│   └─ PDF-Renderer (Electron)  ──────────┼──┘
└────────────────┬────────────────────────┘
                 │
   userData/Daten/  db.sqlite · assets/ · invoices/*.pdf · backups/
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
│   ├── api/          Node-Backend
│   └── desktop/      Electron-Hülle: Hauptprozess, PDF-Renderer, Verpackung
├── packages/
│   ├── shared/       Zod-Schemas, Typen, Enums, Berechnungen, Formatierung
│   └── invoice-template/  A4-Template (Komponente + CSS + Beispieldaten)
├── data/             (gitignored) db.sqlite, assets/, invoices/ — nur im
│                     Entwicklungsbetrieb; die Anwendung nutzt userData/
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

## 5a. Politur: Fehler, Leere, Tastatur, Breite (Schritt 14)

Der letzte Schritt hat nichts Neues gebaut, sondern die Kanten abgerundet, an
denen die Anwendung im Alltag hängen bleibt.

### Fehler sagen, was los ist

Vorher wurde ein Fehler beim Speichern über
`error instanceof ApiRequestError ? … : null` ausgewertet. Das ist genau dann
falsch, wenn es darauf ankommt: Ein abgestürzter Server wirft im Browser einen
`TypeError`, keinen `ApiRequestError` — der Klick auf „Speichern" sah damit aus
wie gar nichts. `formErrorOf` (in `lib/errorMessage.ts`) fängt beide Fälle und
übersetzt „Failed to fetch" in einen Satz, der eine Handlung nahelegt.

Dieselbe Trennung an anderer Stelle: Ein 404 heißt „diesen Datensatz gibt es
nicht" und führt zurück zur Liste; alles andere heißt „gerade nicht erreichbar"
und bekommt einen Knopf zum erneuten Versuch (`isNotFound`). Vorher stand bei
einem abgestürzten Server „Dieser Kunde wurde nicht gefunden" — eine Auskunft,
die jemanden glauben lässt, seine Daten seien weg.

Zwei Netze darunter: Der Router bekommt eine `errorElement`-Seite innerhalb des
Layouts (Kopfzeile und Navigation bleiben stehen, der Weg zurück ist ein
Klick), und ganz außen steht eine `ErrorBoundary` als Klassenkomponente — die
einzige Bauart, mit der React Renderfehler abfängt. Ohne sie bliebe ein weißes
Fenster.

### Leerzustände und Ladezustände sind zweierlei

`latest.data?.items.length === 0` ist während des Ladens ebenfalls wahr — die
Seite behauptete für einen Moment, es gebe nichts. Jetzt kommt zuerst der
Ladehinweis (`LoadingNote`, `aria-live="polite"`), dann der Leerzustand mit dem
nächsten Schritt darin (Anlegen, Filter zurücksetzen).

### Tastatur

- Ein Sprunglink „Zum Inhalt springen" als erste Station — sonst führt jeder
  Seitenwechsel wieder durch die ganze Navigation.
- Sichtbarer Fokus überall: Tailwinds Preflight nimmt Links den Rahmen des
  Browsers weg, eine Regel in `index.css` gibt ihn zurück (`:focus-visible`,
  nicht `:focus` — der Rahmen gehört zur Tastatur, nicht zur Maus).
- Strg/Cmd+S speichert die Rechnung, statt den Seite-speichern-Dialog des
  Browsers zu öffnen.
- „Position hinzufügen" setzt den Cursor in die neue Zeile.
- `aria-sort` an den sortierbaren Spalten (der Pfeil daneben ist für einen
  Screenreader nur ein Zeichen), `role="alert"` an Fehlermeldungen.
- Ein `beforeunload`-Hinweis, wenn ein Fenster mit ungespeicherten Änderungen
  zugeht. Innerhalb der Anwendung genügt der sichtbare Hinweis: Ein
  Seitenwechsel lässt sich zurücknehmen, ein geschlossenes Fenster nicht.

### Breite

Nachgemessen statt geschätzt: Ein Skript fährt mit Chromium jede Seite in 1440
und in 390 Pixeln an und meldet, wenn das Dokument breiter wird als das
Fenster. Zwei Stellen taten das — die Hauptnavigation und die Filterleiste der
Rechnungsliste; beide scrollen jetzt in sich selbst, statt die Seite zu
verbreitern. Breite Tabellen scrollen ebenso in ihrem eigenen Kasten: Spalten
zu verstecken hieße, ausgerechnet Betrag oder Status zu verstecken.

Der Rechnungseditor ist der Sonderfall. Seine Vorschau steht erst ab `2xl`
daneben; darunter bekam das Formular trotzdem die volle Breite des breiten
Layouts — Eingabefelder über 1400 Pixel. Jetzt bleibt es auf Lesebreite, bis
die zweite Spalte tatsächlich erscheint.

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
├── pdf/            Render-Schnittstelle, Dokumentaufbau, Ablage
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
- Der PDF-Renderer kommt als Token `PDF_RENDERER` von außen; wer die
  Anwendung hostet, bietet ihn über `HostModule` an (Abschnitt 13a).
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
| `TimeEntry`        | erfasste Arbeitszeit für einen Kunden       | Tag, Kunden-Ref, Beginn/Ende/Pause in Minuten (Viertelstundenraster), Tätigkeit                                        |
| `AppSetting`       | Key-Value-Kleinkram                         | Key, JSON-Wert                                                                                                         |

### Beziehungen

```
Company (1) ──── (1) Asset            Logo
Customer (1) ──< (n) Invoice          nur als Referenz für Filter/Statistik
Customer (1) ──< (n) TimeEntry        RESTRICT: erfasste Zeit hält den Kunden
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

**Umgesetzt in Schritt 10.** Das Storno geht durch dieselbe Maschinerie wie
das Finalisieren — Nummer aus derselben Sequenz (D10), eigenes PDF, eigener
`InvoiceDocument`-Datensatz — und markiert die Originalrechnung **in
derselben Transaktion**. Sonst gäbe es einen Moment mit einem Storno zu einer
Rechnung, die nichts davon weiß.

Zwei Festlegungen, die dabei anfielen:

- Das Storno übernimmt die **Snapshots der Originalrechnung**, nicht die
  heutigen Stammdaten. Es hebt ein bestimmtes Dokument auf und muss deshalb
  dieselbe Anschrift, dasselbe Steuerprofil und dasselbe Aussehen tragen. Nur
  die Summen entstehen neu — aus den umgekehrten Mengen, und dank des
  symmetrischen Rundens ergeben Original und Storno exakt null. Ein Test
  prüft genau diese Summe am erzeugten Dokument.
- Ein **Storno auf ein Storno** gibt es nicht: Das wäre eine
  Wiederherstellung. Wer die Leistung doch abrechnen will, dupliziert die
  Originalrechnung und stellt sie neu aus. `isCancellable()` im geteilten
  Paket ist die eine Stelle, an der diese Frage beantwortet wird.

**Duplizieren** kopiert Empfänger, Positionen und Texte, nicht aber Nummer,
Snapshots, Zahlungs- und Versandvermerke oder die interne Notiz — die gehören
zu einem abgeschlossenen Vorgang. Die Daten werden neu gesetzt: Ein Duplikat
ist eine Rechnung von heute, kein Abzug von damals.

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
  `paidAt` leeren ⇒ zurück auf `ISSUED`. **Umgesetzt in Schritt 10** als
  `POST /api/invoices/:id/payment` — es gibt bewusst keinen zusätzlichen
  Endpunkt „als bezahlt markieren", sonst gäbe es zwei Wege zu einem Feld.
  Auf einer stornierten Rechnung wird keine Zahlung mehr vermerkt, auf einem
  Entwurf gar keine.
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
  (sofortige Live-Vorschau)                           + CSS ──► PdfRenderer
                                                        printToPDF() ──► A4-PDF
```

**Ein Template, zwei Konsumenten.** `packages/invoice-template` exportiert
eine React-Komponente plus ihr CSS als String. Das Frontend rendert sie
direkt; das Backend rendert dieselbe Komponente mit
`react-dom/server` zu HTML und gibt es dem Renderer. Es gibt keine zweite
Template-Implementierung, die auseinanderlaufen könnte.

Regeln für Deckungsgleichheit Vorschau ↔ PDF:

- Template-CSS ist **eigenständiges Plain-CSS in mm/pt**, kein Tailwind
  (Tailwind ist rem-/viewport-basiert und für Druck ungeeignet).
- `@page { size: A4; margin: 0 }`, Seitenränder als Padding im Dokument.
- Schriften **selbst gehostet** und als `@font-face` mit Base64-Data-URI
  eingebettet — sonst rendert Chromium ohne Netzwerk andere Fallbacks.
- Gedruckt wird mit `printBackground: true`, `preferCSSPageSize: true`.
- Seitenumbruch über `break-inside: avoid` an Positionszeilen und
  Summenblock; wiederholter Tabellenkopf über `<thead>`.
- Fünf Referenzdokumente werden bei jedem Testlauf durch ein echtes
  Chromium gedruckt und vermessen — Seitenzahl, Seitenmaß, Inhaltsflächen,
  eingebettete Schrift (Abschnitt 13a). Kein Pixel-Diff: Gemessen wird die
  Geometrie, weil sie es ist, die dem Empfänger der Rechnung auffiele.

Betrieb: ein verstecktes Fenster je Renderlauf, Läufe nacheinander. Ein
Kaltstart fällt nicht an — Chromium läuft schon, es zeichnet ja auch das
Anwendungsfenster (Abschnitt 13a).

Bewertung der Architektur: **sie ist für diesen Fall die richtige.**
Alternativen wären deklarative PDF-Bibliotheken (`@react-pdf/renderer`,
`pdfmake`) — die sind leichter und ohne Chromium, aber man verliert echtes
CSS-Layout, die Browser-Vorschau ist dann nicht mehr identisch, und
komplexere Layouts werden mühsam. Seit die Anwendung Chromium ohnehin
mitbringt, entfällt auch das letzte Argument dagegen: Es kostet nichts
mehr, was nicht schon da wäre.

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
HTML-Dokument, das der Renderer bekommt.

**Die Schrift ist eingebettet (D29).** Open Sans in Regular und Bold, als
Data-URI im CSS, rund 49 kB. Gerendert wird in einem Container, der weder
Netzwerk noch eine verlässliche Schriftauswahl hat; eine per URL eingebundene
Schrift fiele dort still auf einen Ersatz zurück, und ein Ersatz bricht
Zeilen anders um. Die Vorschau zeigte dann etwas anderes als das PDF —
genau das, was die gemeinsame Komponente verhindern soll. `pnpm --filter
@agentur-tool/invoice-template fonts` erzeugt die Datei neu; sie ist
eingecheckt, damit der Build nicht an der Erreichbarkeit von npm hängt.

**Seitenränder kommen im Druck aus `@page` (D31).** Ein Padding auf der
Seite wirkt nur auf der ersten Druckseite — auf Folgeseiten klebte die
Tabelle sonst am oberen Blattrand. Am Bildschirm bleibt das Padding, weil es
dort das sichtbare Blatt erzeugt. Der Renderer muss dafür mit
`preferCSSPageSize: true` und ohne eigene `margin`-Angabe aufgerufen werden
(umgesetzt in Schritt 8). Belegt durch `apps/api/test/pdf.test.ts`: Eine
34-Positionen-Rechnung ergibt zwei Seiten, und der bedruckbare Kasten ist auf
beiden derselbe — 12 mm links und oben, 16 mm unten für die Fußzeile. Der
Test liest diesen Kasten aus dem PDF; mit Padding statt `@page` stimmte er
nur auf Seite 1.

**Ein Streifen bleibt rechts frei (`PAGE.edgeGapMm`, 0,75 mm).** Chromium
richtet den Inhalt an einem Kasten aus und beschneidet die gedruckte Seite
dann auf einen, der eine Winzigkeit schmaler ist — nachgemessen 0,7 pt. Was
bündig rechts steht, verlor dadurch eine Scheibe: die „6" der Datumsangaben
und die „4" der IBAN standen mit senkrecht abgeschnittener Rundung im PDF.
Ein größerer Seitenrand hilft dagegen nicht — rechtsbündiger Text wandert mit
ihm —, also gehört der Streifen in den Textbereich: `.page` behält im Druck
ein `padding-right`, am Bildschirm steckt derselbe Wert im Seitenpadding.
Beide Medien haben so denselben Textbereich, sonst bräche die Vorschau anders
um als das PDF. Die Fußzeile (`renderInvoiceFooterTemplate`) rechnet
denselben Wert ein, damit die Seitenzahl mit dem Textblock fluchtet.
Nachgemessen an sechs Varianten (Entwurf, Steuer und Rabatt, große Beträge,
zweiseitig, leerer Entwurf): Vorher lag in 74 Bildzeilen Tinte auf dem
Beschnitt, danach in keiner, bei mindestens 1,1 pt Abstand.
`packages/invoice-template/test/page-geometry.test.ts` hält die Geometrie
fest.

Der Platzhalter „Entwurf" statt der Rechnungsnummer steht deshalb **aufrecht**.
Eingebettet sind nur Regular und Bold (D29); ein `font-style: italic` ergibt
keine echte Kursive, sondern eine von Chromium schräggestellte Regular, deren
Tinte bis zu 2 pt über die Laufweite hinausragt — rechtsbündig fiel damit das
halbe „f" dem Beschnitt zum Opfer. Eine echte Kursive einzubetten wäre der
andere Weg, kostet aber 26 kB in jedem Dokument und beseitigt den Überstand
nur zur Hälfte (gemessen). Die grau gesetzte Farbe kennzeichnet den
Platzhalter genauso; die kursiven Platzhalter im Fließtext bleiben, sie stehen
linksbündig und damit nie am Beschnitt.

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

## 13a. Der PDF-Dienst (Schritt 8, überarbeitet mit D34)

Zwei Ebenen, weil sie zwei verschiedene Dinge wissen müssen:

- **Ein `PdfRenderer`** kennt nur den Druck: HTML rein, PDF raus. Er weiß
  nichts über Rechnungen. Die Schnittstelle steht in
  `apps/api/src/pdf/pdf-renderer.ts` und hat genau eine Methode.
- **`InvoicePdfService`** baut das Dokument: Render-Modell aus Rechnung und
  Stammdaten oder Snapshots, HTML über `renderInvoiceDocument`, Dateiname.

Der Schnitt ist nicht kosmetisch: `buildHtml()` lässt sich ohne Browser
prüfen, und genau dort sitzen die Fehler, die teuer wären — falscher
Snapshot, fehlendes Logo, neu gerechnete statt eingefrorener Summen.

**Electrons `printToPDF` statt eines ferngesteuerten Browsers (D34).**
Ursprünglich steuerte `puppeteer-core` ein auf dem Rechner gefundenes
Chromium fern (D32) — mit einer dreistufigen Suche, einem
Installationsskript für den Fall, dass keines da war, und der Aussicht, dass
das PDF auf einem fremden Rechner schlicht nicht entsteht. Mit dem Umstieg
auf die Desktop-Anwendung fällt das weg: Electron bringt dasselbe Chromium
mit, das ohnehin das Fenster zeichnet. `webContents.printToPDF` bedient
dieselbe Schnittstelle des DevTools-Protokolls wie `page.pdf`, weshalb
`preferCSSPageSize`, `printBackground` und die Fußzeilenvorlage unverändert
übernommen werden konnten.

Belegt ist die Gleichheit, nicht behauptet:
`apps/api/test/reference-documents.ts` beschreibt fünf Dokumente — ein-,
mehrseitig, mit eingebettetem Logo, mit vollem Satz aus Steuer und Rabatten
und dazu den Zeitnachweis mit seinen eigenen Rändern —, und
`pdf-electron.test.ts` misst an jedem Seitenzahl, Seitenmaß, Inhaltsflächen
und eingebettete Schrift gegen `fixtures/pdf-reference.json`. Diese Referenz
wurde mit dem Puppeteer-Weg aufgenommen, bevor er entfernt wurde. Sie ist
damit der eingefrorene Vertrag über das, was einmal gedruckt wurde.

**Der Renderer wird hereingereicht, nicht gebaut.** `PdfModule` fragt nach
dem Token `PDF_RENDERER`; wer die Anwendung hostet, bietet über
`HostModule` einen an. Die Desktop-Anwendung reicht ihren
`ElectronPdfRenderer` durch, weil dessen Umsetzung ein `BrowserWindow`
braucht und damit zu `apps/desktop` gehört — `apps/api` soll dafür nicht
gegen Electron gebaut werden müssen. Läuft der Server ohne Gastgeber (auf
der Kommandozeile, in `pnpm dev`, in den Tests), antwortet ein
`UnavailablePdfRenderer` mit einem Satz, der sagt, woran es liegt. Alles
außer dem Druck funktioniert dort weiter.

**Ein Fenster je Lauf, ein Lauf nach dem anderen.** Der Kaltstart eines
Browsers entfällt — Chromium läuft schon. Das versteckte Fenster entsteht
je Dokument und wird danach zerstört; Renderläufe laufen nacheinander, weil
Parallelität bei einem Einzelplatzwerkzeug nichts bringt und Speicher
kostet. Ein `offscreen`-Fenster wäre naheliegend, kommt aber mit eigener
Rasterung und damit womöglich anderen Maßen — ein verstecktes, gewöhnliches
Fenster rastert wie ein sichtbares.

**Chromium bekommt kein Netz.** Puppeteer bekam dafür
`--host-resolver-rules=MAP * ~NOTFOUND` auf die Kommandozeile; der Anlass
war eine Messung, bei der trotz aller Flags gegen Hintergrundverbindungen
eine Anfrage nach draußen ging. Unter Electron leistet das eine eigene
Session, die jede Anfrage außer `file:` und `data:` abweist. Das Dokument
braucht kein Netz — es trägt Schrift und Logo als Data-URI in sich (D29) —,
also soll es auch keines bekommen können. Ohne diese Sperre wäre ein
manipuliertes Logo oder Template ein Weg, Rechnungsdaten abfließen zu
lassen. `pdf-electron.test.ts` prüft beide Richtungen: Der Griff nach einer
externen Adresse wird abgewiesen und ergibt trotzdem ein Dokument, die
eingebetteten Data-URIs kommen weiter durch.

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

GET    /api/invoices?status=&documentType=&year=&customerId=&q=&overdue=
                     &sort=&order=&page=&pageSize=
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

GET    /api/time-entries?from=&to=&customerId=      POST  /api/time-entries
GET    /api/time-entries/:id                       PATCH /api/time-entries/:id
DELETE /api/time-entries/:id
GET    /api/time-entries/report/pdf?from=&to=&customerId=   Zeitnachweis

POST   /api/backup/export              GET /api/backup/status
GET    /api/backup/:filename           Archiv herunterladen

POST   /api/tax-advisor/preview        Inhalt und Belegintegrität vorab prüfen
POST   /api/tax-advisor/export         Zeitraum → CSV + Belege als ZIP
```

**Die Übersicht** (umgesetzt in Schritt 11) antwortet nicht mit einem nackten
Array, sondern mit `{ items, total, page, pageSize, pageCount }`: „87
Rechnungen, Seite 2 von 4" lässt sich sonst nicht anzeigen, und ein Zähler,
den das Frontend schätzt, ist falsch, sobald gefiltert wird. Dazu:

- Sortierbar nach `invoiceDate`, `dueDate` und `number` — alles Spalten.
  Nach dem Betrag zu sortieren hieße, alle Rechnungen zu laden und im
  Speicher zu sortieren, weil die Summe je nach Zustand aus einem
  JSON-Snapshot kommt oder berechnet wird. Ein unbekanntes Sortierfeld wird
  abgewiesen, nicht ignoriert: Sonst käme ein Feldname ungeprüft in die
  Datenbankabfrage.
- Die `id` ist immer zweites Sortierkriterium. Ohne sie wäre die Reihenfolge
  zweier Rechnungen mit gleichem Datum offen, und beim Blättern könnte
  dieselbe Rechnung auf zwei Seiten stehen oder ganz fehlen.
- `overdue=true` ist ein Filter und kein Status: „überfällig" ergibt sich aus
  `status = ISSUED` und `dueDate < heute` (Abschnitt 8).

**Das Dashboard hat bewusst keinen eigenen Endpunkt.** Es stellt dieselbe
Übersichtsabfrage dreimal mit kleinem `pageSize` und liest `total` — Entwürfe,
offene, überfällige. Ein Statistik-Endpunkt müsste dieselben Filter ein
zweites Mal ausdrücken, und die beiden Ausdrücke liefen irgendwann
auseinander. Gezeigt werden diese drei Zahlen und die letzten Rechnungen;
Umsatzübersichten und offene Posten mit Altersstruktur bleiben ausdrücklich
einer späteren Version vorbehalten (Abschnitt 21). Die Filter der Übersicht
stehen in der Adresszeile, damit das Dashboard direkt auf „überfällig"
verlinken kann und eine Auswahl teilbar ist.

**Die Zeiterfassung** hält Uhrzeiten als Minuten seit Mitternacht und den Tag
als Kalenderdatum (D21) — eine erfasste Zeit ist eine Angabe auf der Uhr des
Benutzers, kein Zeitpunkt auf der Weltlinie. Alle Minutenangaben liegen auf
dem Viertelstundenraster: Das Zod-Schema rundet jede Eingabe **ab** (aus
„12:13 bis 14:02" wird „12:00 bis 14:00"), und vier CHECK-Constraints halten
das Raster auch gegen Schreibwege an der Anwendung vorbei. Abrunden statt
kaufmännisch runden, damit die abgerechnete Zeit im Zweifel unter der
geleisteten liegt. Der Zeitnachweis ist bewusst kein Rechnungsdokument: keine
Nummer, kein Snapshot, keine Ablage — er wird bei jedem Abruf aus den
aktuellen Einträgen gedruckt und teilt mit der Rechnung nur den PDF-Dienst.

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
- Der PDF-Renderer bekommt kein Netz: eigene Session, die alles außer
  `file:` und `data:` abweist (Abschnitt 13a).
- Das Fenster bekommt es ebenso wenig (D36). Zwei Chromium-Schalter
  (`disable-background-networking`, `disable-component-update`) nehmen den
  größten Teil weg, aber gemessen blieb beim Start ein Versuch übrig.
  `apps/desktop/src/network.ts` schließt die Lücke: erlaubt sind die
  Rückschleife — der eigene Server auf wechselndem Port, im
  Entwicklungsbetrieb Vite samt WebSocket — und was im Fenster selbst
  entsteht (`devtools:`, `blob:`, `data:`, `file:`). Entschieden wird über
  den Hostnamen und nicht über den Anfang der Zeichenkette; sonst käme
  `http://127.0.0.1.angreifer.example/` durch. Alles Abgewiesene steht im
  Protokoll, und die Rauchprobe verlangt, dass die Liste leer bleibt.

### Zugriffsmodell: der eigene Rechner (D18, überarbeitet)

Ursprünglich war ein Zugriff über **Tailscale** vorgesehen: Der Dienst
hätte auf einem Server gelegen, ausschließlich an die Tailscale-Adresse
gebunden, mit aktivem Login als zweiter Schicht. Mit der Desktop-Anwendung
ist das gegenstandslos — die Anwendung läuft dort, wo der Benutzer sitzt.

Was stattdessen trägt:

1. **Der Server hört nur auf die Rückschleife**, auf einem Port, den das
   Betriebssystem bei jedem Start neu vergibt. Von außen ist nichts
   erreichbar, weil nichts nach außen gebunden ist.
2. **Das Betriebssystem schützt die Daten.** Sie liegen im Benutzerordner
   und unterliegen dessen Rechten und dessen Festplattenverschlüsselung.

Die verbleibende Lücke ist ehrlich zu benennen: Ein anderer Prozess
desselben Benutzers könnte die API ansprechen. Wer das schließen will,
bräuchte ein Merkmal je Start, das nur das Fenster kennt — ein Aufwand, der
sich gegen einen Angreifer, der ohnehin schon als dieser Benutzer Code
ausführt, kaum lohnt: Er käme genauso an die SQLite-Datei.

**Das Auth-Modul bleibt trotzdem.** Passwort mit **argon2id**,
serverseitige **Session-Cookies** (httpOnly, Secure, SameSite=Lax) in der
Datenbank — kein JWT, weil Widerruf mit Sessions trivial ist und mit JWT
nicht; dazu Rate-Limiting auf dem Login, generische Fehlermeldungen,
konstante Antwortzeit. Im Desktop-Betrieb ist es über `AUTH_ENABLED=false`
abgeschaltet und die Oberfläche zeigt kein Anmeldeformular. Es zu entfernen
wäre eine eigene Entscheidung; solange es getestet ist und nicht stört,
hält es den Weg zu einem Netzbetrieb offen.

Ein Benutzer genügt; das Schema hat trotzdem eine `User`-Tabelle statt
eines Passwort-Hashes in den Einstellungen, weil das später mehrere
Benutzer ohne Migration erlaubt.

---

## 16a. Anmeldung und Betrieb als Anwendung (Schritt 13, überarbeitet mit D1)

Ursprünglich stand hier ein Docker-Image: Es machte die Anwendung
erreichbar, die Anmeldung entschied, wer hineinkommt. Beides ist mit der
Desktop-Form hinfällig geworden — erreichbar ist sie dort, wo sie läuft,
und wer am Rechner sitzt, ist angemeldet. Der Abschnitt beschreibt jetzt
den Start der Anwendung; die Anmeldung bleibt dokumentiert, weil das Modul
weiterhin im Code steht (Abschnitt 16).

### Der Schalter

`AUTH_ENABLED` ist keine halbe Anmeldung, sondern eine ganze, die abgeschaltet
werden kann. Derselbe Code läuft in beiden Fällen; nur der globale Wächter
(`AuthGuard`, per `APP_GUARD` an alle Routen gebunden) gibt bei
`AUTH_ENABLED=false` sofort frei. Das ist der lokale Betrieb aus D1 — der
Server hört dort ohnehin nur auf `127.0.0.1`.

Öffentlich bleiben in jedem Fall drei Routen, ausgezeichnet mit `@Public()`:
`GET /api/health`, `POST /api/auth/login` und `POST /api/auth/logout`. Dazu
`GET /api/auth/session`, denn das Frontend muss vor der Anmeldung fragen
dürfen, ob es überhaupt eine gibt. Die Antwort verrät nichts:
`{ enabled, user }`, und `user` ist ohne gültige Sitzung `null`.

### Passwörter und Sitzungen

- **argon2id** über `@node-rs/argon2` mit den Voreinstellungen der Bibliothek
  (19 MiB, 2 Durchläufe). Kein bcrypt: Argon2 ist speicherhart, und genau das
  macht Angriffe mit Grafikkarten teuer.
- **Serverseitige Sitzungen**, kein JWT. Abmelden muss sofort wirken; bei
  einem JWT hieße das warten oder eine Sperrliste führen — und eine Sperrliste
  ist eine Sitzungstabelle mit Umwegen.
- In der Tabelle steht nie das Token, sondern sein **SHA-256**. Wer die
  Datenbank in die Hände bekommt — Backup, Kopie, Fehlersuche —, kann sich
  damit nicht anmelden. Ein zweiter Hash-Durchlauf mit Argon2 wäre hier
  unnötig: Das Token ist 32 zufällige Bytes, es gibt nichts zu raten.
- Cookie: `httpOnly` (kein Skript kommt heran), `SameSite=Lax` (eine fremde
  Seite kann keine Anfrage im Namen des Angemeldeten stellen — CSRF ist damit
  erledigt, ohne ein zweites Token einzuführen), `Secure`, sobald
  `AUTH_ENABLED` gesetzt ist. `COOKIE_SECURE=false` ist der bewusste Ausweg
  für den Betrieb ohne HTTPS-Terminierung im Tailnet.
- Laufzeit `SESSION_TTL_DAYS` (30). Abgelaufene Sitzungen räumt jede Anmeldung
  mit weg; ein eigener Aufräumlauf wäre für eine Tabelle mit einer Handvoll
  Zeilen zu viel Apparat.

### Was ein Angreifer nicht erfährt

Falsches Passwort und unbekannte Adresse ergeben dieselbe Meldung und dieselbe
Antwortzeit: Gibt es den Benutzer nicht, wird gegen einen fest hinterlegten
Dummy-Hash geprüft, statt sofort zurückzukehren. Sonst ließe sich an der
Antwortzeit ablesen, welche Adresse existiert. Ein Test hält beides fest.

Dazu eine Sperre nach `LOGIN_MAX_ATTEMPTS` Fehlversuchen je Absender innerhalb
von `LOGIN_WINDOW_MINUTES`. Sie liegt im Arbeitsspeicher, nicht in der
Datenbank: Es gibt einen Prozess und einen Benutzer. Nach einem Neustart ist
die Zählung weg — das ist die Schwäche, und bei einem Server, der nur auf
die Rückschleife hört, ist sie hinnehmbar.

### Kein Registrierungsweg

Benutzer entstehen auf der Kommandozeile: `pnpm user:set <e-mail>`. Ein
Registrierungsformular wäre genau die Tür, die die Anmeldung zumachen soll.
Das Passwort wird eingegeben, nicht als Argument übergeben — was auf der
Kommandozeile steht, landet in der Prozessliste und in der Shell-Historie. Wird
ein Passwort geändert, werden alle bestehenden Sitzungen dieses Benutzers
verworfen: Ein Passwortwechsel nach einem verlorenen Gerät wäre sonst wirkungslos.

### Das Frontend liefert der Server mit

`ServeStaticModule` reicht `apps/web/dist` aus, mit `exclude: ['/api/(.*)']` —
ohne diese Ausnahme beantwortete der statische Server einen vertippten
API-Pfad mit der `index.html`, und ein 404 sähe im Frontend aus wie kaputtes
JSON. Existiert das Verzeichnis nicht (Entwicklung, dort übernimmt Vite),
hält sich das Modul heraus, statt beim Start zu stolpern.

Vor der Anwendung steht der `AuthGate`: Er fragt `/api/auth/session` und zeigt
das Anmeldeformular nur, wenn der Server sagt, dass es eine Anmeldung gibt und
niemand angemeldet ist. Aus einem 401 zu raten wäre unzuverlässig — es gäbe
einen Moment, in dem die Anwendung schon steht und ihre Daten nicht. Läuft die
Sitzung während der Arbeit ab, meldet der HTTP-Client das über ein
Fensterereignis, und der Gate fragt nach.

### Der Start der Anwendung

Der Electron-Hauptprozess (`apps/desktop/src/main.ts`) macht in dieser
Reihenfolge:

1. **Eine Instanz sicherstellen.** `requestSingleInstanceLock()`; ein
   zweiter Start holt das bestehende Fenster nach vorn, statt eine zweite
   Anwendung auf dieselbe SQLite-Datei zu setzen.
2. **Pfade festlegen.** `DATA_DIR` ist `userData/Daten`, nicht `userData`
   selbst: Dort legt Chromium seine Caches, Cookies und eigenen Datenbanken
   ab, und „Datenordner zeigen" soll Rechnungen zeigen.
3. **Die Datenbank vorbereiten** (`database.ts`): Backup, solange schon
   eine da ist, sonst eine leere Datei — Prisma 6 legt sie bei
   `migrate deploy` nicht zuverlässig selbst an. Dann die Migrationen, dann
   die idempotenten Grunddaten. Genau der Ablauf, der vorher im
   Docker-Entrypoint stand.
4. **Den Server hochziehen.** `bootstrap()` aus `apps/api` läuft im
   Hauptprozess, nicht in einem eigenen Prozess: So kann der PDF-Renderer
   direkt ein `BrowserWindow` benutzen, ohne dass eine IPC-Schicht dazwischen
   gebaut und abgesichert werden müsste. Gebunden wird an `127.0.0.1` und
   Port 0 — das Betriebssystem sucht einen freien, und es gibt keinen
   festen, um den sich etwas streiten könnte.
5. **Das Fenster öffnen** auf der Adresse, die der Server danach meldet.

Die Migrationen laufen über `prisma migrate deploy` als Kindprozess, den
`process.execPath` mit `ELECTRON_RUN_AS_NODE=1` startet: Electrons eigenes
Node führt die CLI aus, sodass die gepackte Anwendung kein zweites
mitschleppen muss. Aus demselben Grund steht der Seed als Funktion in
`apps/api/src/common/seed.ts` und nicht mehr nur als `tsx`-Skript — in
einer gepackten Anwendung gibt es kein `tsx`.

**Warum HTTP und nicht `file://`.** Das Frontend spricht ausschließlich
relative Pfade (`fetch('/api' + …)`), das Vite-Build erzeugt absolute
`/assets/…`-Pfade, und der Router ist ein `createBrowserRouter` mit
nachgeladenen Bündeln. Über HTTP funktioniert all das unverändert; über
`file://` bräuchte jedes der drei eine Sonderbehandlung.

### Die Verpackung

`electron-builder`, gespeist aus einem eigens gebauten Verzeichnis
(`apps/desktop/scripts/paket.mjs`). Der Umweg ist nötig, weil
electron-builder dem virtuellen Store von pnpm nicht folgt. `pnpm deploy
--prod --node-linker=hoisted` legt stattdessen einen flachen Baum an, wie
Node ihn erwartet — mit dem Schalter bleiben von 401 Symlinks neun übrig,
allesamt Startskripte unter `.bin/`, die zur Laufzeit niemand ruft.

Vier Eigenheiten sind dabei nicht offensichtlich, und jede einzelne hat die
Anwendung beim Start scheitern lassen, bevor sie erkannt war
(`scripts/rauchprobe.mjs` prüft seitdem jede davon):

**Der Prisma-Client muss im Abzug neu erzeugt werden.** `pnpm deploy`
kopiert die Pakete unberührt aus dem Store, und `@prisma/client` ist dort
eine Hülle, deren `default.js` nur `require('.prisma/client/default')`
enthält. Der erzeugte Client liegt im Repository daneben und kommt nicht
mit.

**Und er muss danach umziehen.** `generate` schreibt ihn nach
`node_modules/.prisma/client` — genau dieses Verzeichnis lässt
electron-builder weg, mit jedem denkbaren `files`-Muster: Was in
`node_modules` landet, bestimmt allein der Abhängigkeitsbaum, und ein
Verzeichnis mit führendem Punkt steht in keinem. Der erzeugte Client ist
ortsunabhängig — sein einziger Verweis nach draußen ist
`@prisma/client/runtime/library.js` —, also zieht er in eben dieses Paket
um und überschreibt die Hülle.

**Gepackt wird das echte Paket, nicht ein erfundenes.** Ein erzeugtes
Manifest ohne `dependencies` ergab ein `app.asar` von 61 kB, in dem der
gesamte Server fehlte. Deshalb ist `paket/` der Abzug von
`@agentur-tool/desktop` mit dessen eigener Abhängigkeitsliste. Das
Frontend liegt bewusst daneben unter `web/` statt in `node_modules`: Als
Abhängigkeit eingetragen brächte es React, den Router und alles Weitere
mit, obwohl Vite genau das längst gebündelt hat.

**Kein asar-Archiv (D35).** Prisma startet die Schema-Engine als eigenen
Prozess und lädt die Query-Engine über `dlopen`; beide bekommen den Pfad
von Prisma selbst und gehen an Electrons asar-Umleitung vorbei. Im Archiv
endete der Start mit `ENOTDIR` auf einen Pfad innerhalb von `app.asar`.
Sich herauszuwinden hieße, Prisma über `PRISMA_SCHEMA_ENGINE_BINARY` und
`PRISMA_QUERY_ENGINE_LIBRARY` die entpackten Pfade einzeln zu nennen — und
dafür die Plattformkennung jedes Engine-Dateinamens im Hauptprozess
nachzubauen. Ohne Archiv stimmt jeder Pfad von selbst. Ein Schutz war das
Archiv ohnehin nicht; es lässt sich mit einem Befehl öffnen.

Gebaut wird je System und Architektur auf einem passenden nativen Runner.
Prisma erzeugt nur `binaryTargets = ["native"]`, und ein Hook weist jeden
Cross-Build ab: Neben Prisma bringt auch `@node-rs/argon2`
plattformspezifische Binärdateien mit. Ein einziger Mac-Paketbaum darf deshalb
niemals sowohl das ARM64- als auch das x64-DMG speisen.

Öffentliche macOS-Pakete werden mit derselben Developer-ID vollständig
signiert und danach notarisiert. Der Hardened Runtime ist Pflicht; als einzige
Ausnahme bleibt `com.apple.security.cs.allow-jit` für Chromiums
JavaScript-Engine. Die Bibliotheksprüfung bleibt aktiv und erfasst damit auch
Prisma und argon2. Windows-Releases verlangen entsprechend eine gültige
Authenticode-Signatur.

### Die Rauchprobe

`apps/desktop/scripts/rauchprobe.mjs` startet die gebaute Anwendung mit
leerem Datenverzeichnis und arbeitet einmal durch: Migrationen, Grunddaten,
Firmendaten, Kunde, Rechnung, Finalisierung, PDF, Backup. Am Ende prüft
sie, dass keine einzige Anfrage nach außen gehen wollte.

Sie prüft nicht Logik, sondern Form — jede der oben beschriebenen
Eigenheiten ist in der Entwicklung beantwortet und im Paket neu zu stellen.
Sie läuft gegen den Paketbaum (`--nur-baum`) wie gegen das fertig gepackte
Programm. Unter macOS wird dafür das DMG geprüft und eingehängt, unter Windows
der NSIS-Installer still installiert. Ein zweiter Start mit demselben
Datenverzeichnis prüft zusätzlich Rechnung, PDF und das automatische
Migrations-Backup.

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

**Umgesetzt in Schritt 12.** Ein paar Festlegungen, die dabei anfielen:

- **ZIP statt tar.gz** (D33). Das Archiv soll sich auf Windows, macOS und iOS
  mit Bordmitteln öffnen lassen: Im Zweifel will man ein einzelnes PDF
  herausholen, ohne die Anwendung überhaupt zu starten. Geschrieben mit
  `yazl`, gelesen mit `yauzl` — beide streamen, was bei einigen hundert
  Megabyte den Unterschied zwischen „läuft" und „Speicher voll" ausmacht.
- **Aufbau des Archivs:** `manifest.json`, `database.sqlite` und
  `files/<pfad relativ zu DATA_DIR>` für Assets, PDFs und verwaiste Dateien.
  `data/tmp` bleibt draußen — dort liegt nur Arbeitsmaterial.
- **Erst prüfen, dann anfassen.** Die Wiederherstellung entpackt zunächst
  vollständig in ein temporäres Verzeichnis und vergleicht jeden Hash mit dem
  Manifest. Erst danach werden die vorhandenen Daten beiseitegelegt. Ein
  beschädigtes Archiv darf nicht auffallen, nachdem die alten Daten weg sind.
- **Beiseitelegen statt löschen:** Ohne `--force` bricht die
  Wiederherstellung ab, solange Daten da sind; mit `--force` wandern sie nach
  `data.bak-<Zeitstempel>`. Wer im Ernstfall das falsche Archiv erwischt,
  soll das zurücknehmen können.
- **WAL- und SHM-Datei werden entfernt**, wenn die Datenbank ersetzt wird.
  Bleiben sie liegen, hält SQLite sie für das Write-Ahead-Log genau dieser
  Datei und liest Änderungen ein, die es nicht mehr gibt.
- **Kein Restore-Knopf im Browser.** Die Wiederherstellung ersetzt das
  Datenverzeichnis unter der laufenden Anwendung — das ist ein Skript, keine
  Schaltfläche. Die Einstellungsseite zeigt stattdessen den Befehl.

**Der Restore-Test ist durchgeführt** (Abschnitt 23, Punkt 9), zweifach: als
automatischer Test (`apps/api/test/backup.test.ts`) und einmal von Hand am
laufenden System — drei ausgestellte Rechnungen mit echten PDFs und
hochgeladenem Logo, Backup über die API, dann `data/` **und** Datenbank
gelöscht, `pnpm restore` ausgeführt, Anwendung gestartet: alle drei Rechnungen
mit ihren Beträgen wieder da, das Logo wieder da, und die SHA-256 der drei
PDFs identisch zu denen vor dem Verlust — auch die des über die API
heruntergeladenen Dokuments.

---

## 18. Nutzung

**Entwicklung, zwei Wege.** `pnpm dev` startet Vite (Port 5173) und API
(Port 3000) parallel, Vite-Proxy für `/api`, SQLite unter `./data/`. Beides
lädt bei jeder Änderung nach — der schnellere Weg für Oberfläche und
Backend. PDFs entstehen dort nicht; die Routen sagen das auch, statt einen
Fehler zu werfen, den niemand deuten kann.

`pnpm dev:desktop` startet Vite und Electron zusammen. Das Fenster zeigt
auf den Dev-Server, die Oberfläche lädt also weiterhin nach; nur Änderungen
am Backend brauchen dort einen Neustart. Dafür gibt es PDFs.

**Betrieb.** Die installierte Anwendung: Doppelklick, eigenes Fenster.
Server und Frontend stecken darin, der Browser für die PDF-Erzeugung
ebenfalls. Die Daten liegen außerhalb, unter
`~/Library/Application Support/AgenturTool/Daten` beziehungsweise
`%APPDATA%\AgenturTool\Daten`, und überleben jedes Update (Abschnitt 16a).

---

## 19. Was aus der Online-Bereitstellung wurde

Ursprünglich war ein späterer Serverbetrieb vorgesehen — Docker-Image,
Volume, VPS mit Tailscale — und die Architektur war darauf vorbereitet:
Konfiguration ausschließlich über Umgebungsvariablen, Auth-Modul von Anfang
an vorhanden, keine Annahme „läuft auf localhost" im Code.

Gebaut wurde stattdessen die Desktop-Anwendung (D1). Der Anlass war
nüchtern: Für eine Person an einem Rechner löst ein Server ein Problem, das
es nicht gibt, und kostet dafür Miete, Wartung und eine
Auftragsverarbeitung.

Die Vorbereitung war trotzdem nicht umsonst — sie ist der Grund, warum der
Umbau überschaubar blieb. Der Server nimmt seine Konfiguration weiterhin
aus der Umgebung, nur setzt sie jetzt der Hauptprozess statt einer `.env`.
Das Auth-Modul steht unverändert im Code und ist über einen Schalter
erreichbar. Wer die Anwendung eines Tages doch auf einen Server stellen
will, braucht dafür kein neues Fundament, sondern ein Image und einen
PDF-Renderer, der ohne Electron auskommt.

---

## 20. Reihenfolge der Implementierung

Jeder Schritt endet mit etwas Lauffähigem.

| #     | Schritt                                                                    | Ergebnis                        |
| ----- | -------------------------------------------------------------------------- | ------------------------------- |
| 0 ✅  | Monorepo-Gerüst, TS-Configs, Lint/Format, `shared`-Skeleton                | `pnpm dev` läuft                |
| 1 ✅  | DB-Schema, Migrationen, Seed                                               | Datenbank steht                 |
| 2 ✅  | Company-Einstellungen inkl. Logo-Upload                                    | erster vertikaler Durchstich    |
| 3 ✅  | Kundenverwaltung (CRUD, Liste, Suche)                                      | zweite Domäne, Muster etabliert |
| 4 ✅  | Steuerprofile                                                              | Stammdaten komplett             |
| 5 ✅  | Berechnungslogik in `shared` + Unit-Tests                                  | Kern abgesichert                |
| 6 ✅  | Rechnungs-Entwurf: API + Editor mit dynamischen Positionen                 | Rechnungen erfassbar            |
| 7 ✅  | `invoice-template` + Live-Vorschau im iframe                               | sichtbares Ergebnis             |
| 8 ✅  | PDF-Dienst + Entwurfs-PDF (später auf Electron umgestellt, D34)            | PDF-Pipeline steht              |
| 9 ✅  | Nummernvergabe + Snapshots + Finalisieren + PDF-Ablage                     | **Kernfunktion fertig**         |
| 10 ✅ | Status: bezahlt/versendet, Stornieren, Duplizieren                         | Lebenszyklus komplett           |
| 11 ✅ | Rechnungsübersicht mit Filter/Sortierung + Dashboard                       | Alltagstauglich                 |
| 12 ✅ | Backup-Export/Restore + Restore-Test                                       | Datensicherheit                 |
| 13 ✅ | Auth-Modul (per `AUTH_ENABLED`) + Verpackung als Anwendung (D1)            | ausliefer­bar                   |
| 14 ✅ | Politur: Fehlerbehandlung, Leerzustände, Tastaturbedienung, Responsiveness | **V1**                          |

Tests bewusst schmal, aber gezielt: Berechnungen und Nummernvergabe mit
Unit-Tests, Finalisierung als Integrationstest, ein PDF-Snapshot-Test.
Kein flächendeckendes UI-Testing im MVP.

---

## 21. Abgrenzung MVP ↔ später

| Bereich          | V1                                 | Später                                              |
| ---------------- | ---------------------------------- | --------------------------------------------------- |
| Dokumenttypen    | Rechnung, Storno                   | Angebot, Auftragsbestätigung, Mahnung, Gutschrift   |
| Templates        | 1 Template + Optionen              | mehrere Templates, mehr Optionen                    |
| Versand          | PDF-Download                       | E-Mail-Versand, Anhänge, Versandprotokoll           |
| Zahlungen        | bezahlt am / offen                 | Teilzahlungen, Zahlungserinnerungen, Mahnstufen     |
| Positionen       | frei erfasst                       | Produkt-/Leistungskatalog, Import aus Zeiterfassung |
| Wiederholung     | Duplizieren                        | echte wiederkehrende Rechnungen mit Zeitplan        |
| Export           | Backup-Archiv, Steuerberater-Paket | DATEV-Buchungsstapel nach Kanzleikonfiguration      |
| Mandanten/Nutzer | einer                              | mehrere Unternehmen, mehrere Benutzer, Rollen       |
| Auswertung       | Dashboard mit letzten Rechnungen   | Umsatzübersichten, Statistiken, offene Posten       |
| E-Rechnung       | nur PDF                            | ZUGFeRD / XRechnung (siehe unten)                   |

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

Zwei davon sind später gefallen: **D18** (Tailscale) wurde mit dem
Umstieg auf die Desktop-Anwendung gegenstandslos, **D32** (`puppeteer-core`
mit gefundenem Chromium) durch **D34** ersetzt, weil Electron sein Chromium
mitbringt. Beide stehen durchgestrichen in der Tabelle, statt gelöscht zu
sein — eine Entscheidung, die man einmal getroffen hat, verschwindet nicht
dadurch, dass sie überholt ist.

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
   ✅ In Schritt 12 durchgeführt — mit gelöschter Datenbank und gelöschtem
   Datenverzeichnis, wiederhergestellt über `pnpm restore`; die Hashes der
   PDFs stimmen vorher und nachher überein.

---

## 24. E-Rechnung (EN 16931)

Ab dem 1. Januar 2027 müssen deutsche Unternehmen mit mehr als 800 000 €
Umsatz strukturierte E-Rechnungen **ausstellen**, ab dem 1. Januar 2028
alle; die Pflicht, sie zu **empfangen**, besteht seit 2025. Eine
Rechnungssoftware ohne strukturierten Export ist damit ab 2027 unbrauchbar.

### Der Standard ist europäisch, nicht deutsch

EN 16931 ist eine EU-Norm. XRechnung ist lediglich die deutsche **CIUS** —
ein Einschränkungsprofil, das Felder zur Pflicht macht, die die Norm
freistellt. ZUGFeRD 2.3 und das französische Factur-X 1.07 sind dieselbe
Spezifikation unter zwei Namen.

Daraus folgt der Zuschnitt: Abgebildet wird auf die **Norm**, nicht auf ein
Land. Die Syntax ist CII (UN/CEFACT Cross Industry Invoice, D16B) — dieselbe,
die ZUGFeRD später in die PDF-Datei legt. Was ein Land zusätzlich verlangt,
steckt im Profil.

### Was gebaut ist und was nicht

Gebaut: **XRechnung als eigenständige XML-Datei.** Sie entsteht beim
Ausstellen, wird wie das PDF eingefroren und lässt sich herunterladen.

Nicht gebaut, in dieser Reihenfolge sinnvoll:

- **ZUGFeRD** (PDF/A-3 mit eingebettetem XML) setzt auf derselben Abbildung
  auf. Der Aufwand liegt nicht im XML, sondern im PDF: `printToPDF` von
  Electron erzeugt kein PDF/A-3, und die Datei müsste nachbearbeitet werden.
- **Eingehende E-Rechnungen lesen** ist ein eigenes Feature mit eigener
  Oberfläche.
- **Peppol-Versand** wird **nicht** gebaut. Er bräuchte einen akkreditierten
  Access Point und widerspräche der Zusicherung aus Abschnitt 16, dass die
  Anwendung nicht nach außen spricht. Die Datei geht per E-Mail; das genügt.

### Entscheidungen

**D-E1 — Eigenes Paket `packages/einvoice`.** Nicht in `shared`, weil sonst
jeder Consumer die XML-Erzeugung mitschleppte. Das Paket spiegelt die Rolle
von `packages/invoice-template`: eine Sorge, klar abgegrenzt.

**D-E2 — Die Steuerkategorie steht neben `kind`, nicht darin.** Abschnitt 10
sagt: „`kind` steuert nur drei Dinge." Das soll wahr bleiben. EN 16931
braucht aber die Kategorie nach UNTDID 5305, und ein Profil der Art
`ZERO_RATED` kann je nach Sachverhalt `Z`, `E`, `K` oder `G` sein — das weiß
nur der Benutzer. `TaxProfile` bekam deshalb eigene Felder mit einem aus
`kind` abgeleiteten Vorschlag. Steuerlogik bleibt datengetrieben.

**D-E3 — `unitCode` neben `unit`, nicht statt `unit`.** `unit` ist Freitext
und wird **gedruckt**. Ein Ersetzen hätte das Aussehen bestehender
Rechnungen verändert, was Abschnitt 8 verbietet.

**D-E4 — Snapshot-Version 2.** Die Verzweigung passiert beim Parsen, nicht
an den Aufrufstellen — es gibt drei Stellen, die Snapshots einlesen, und
eine davon hätte man vergessen. Eine Version-1-Rechnung wird **nicht**
umgeschrieben, sondern beim Lesen aufgefüllt: Ein Dokument ändert man nicht
nachträglich, nur weil das Programm dazugelernt hat.

**D-E5 — Das XML wird eingefroren wie das PDF.** Es entsteht in derselben
Transaktion, aus derselben Quelle, mit eigenem SHA-256. Wären es zwei
Vorgänge, gäbe es einen Moment, in dem die Datei andere Beträge trüge als
das Papier.

**D-E6 — Profile sind versioniert und austauschbar.** XRechnung 3.0.2 gilt,
**4.0 ist für Mitte bis Ende 2026 angekündigt** (revidierte
EN 16931-1:2026). Ein fest verdrahtetes Profil wäre binnen eines Jahres
Altlast.

**D-E7 — Eine fehlende Angabe verhindert das Ausstellen nicht.** Eine
Rechnung ohne Leitweg-ID ist nach § 14 UStG gültig; sie ließe sich nur nicht
als XRechnung ausgeben. Deshalb ist `checkEinvoiceReady` von
`checkFinalizable` getrennt: Das eine verhindert, das andere weist nur hin.
Das Gegenteil hätte jede Bestandsrechnung unfinalisierbar gemacht, für ein
Feld, das es beim Anlegen des Kunden noch nicht gab.

**D-E8 — Kein XML-Baukasten als Abhängigkeit.** Ein sequenzstrenges Dokument
mit festgelegter Struktur braucht keinen; die Verpackung (Abschnitt 16a)
ringt schon mit Prisma und argon2. `xml.ts` maskiert, entfernt unzulässige
Steuerzeichen und lässt weg, was nicht da ist.

### Die Reihenfolge ist die Regel

CII ist sequenzstreng: Das Schema schreibt vor, in welcher Reihenfolge die
Elemente stehen. Ein vertauschtes Paar ist kein Schönheitsfehler, sondern
ein Dokument, das der Prüfer abweist — und es fällt beim Lesen nicht auf,
weil beide Fassungen gleich plausibel aussehen. Deshalb steht jede Gruppe in
`cii.ts` als durchgehende Liste mit den Feldnummern daneben.

### Geprüft wird mit fremdem Werkzeug

Die eigenen Tests prüfen, ob herauskommt, was gedacht war. Ob das Gedachte
stimmt, sagt nur, wer die Regeln gemacht hat. `pnpm --filter
@agentur-tool/einvoice pruefen` lässt den offiziellen **KoSIT-Validator**
über die Golden-Dateien laufen; die CI tut dasselbe bei jedem Push.

Beim ersten Lauf hat er vier Dinge gefunden, die keine Selbstprüfung
gefunden hätte:

- Die Kennung der Spezifikation hat sich mit Fassung 3.0 geändert
  (`xoev-de` → `xeinkauf.de`). Mit der alten wurde das Dokument nicht etwa
  bemängelt, sondern **gar nicht erst als XRechnung erkannt**.
- `currencyID` ist an einem Betrag nicht überflüssig, sondern **verboten** —
  mit der einen Ausnahme BT-110, wo es Pflicht ist (CII-DT-031).
- Ein Zeilenrabatt ohne Grund ist ungültig (BR-42, BR-CO-23).
- XRechnung verlangt beim Verkäufer eine Kontaktstelle mit Name, Telefon und
  E-Mail (BR-DE-5 bis BR-DE-7), und die Nummer braucht mindestens drei
  Ziffern (BR-DE-27).

Java läuft ausschließlich auf dem Bauserver und beim Entwickeln —
ausgeliefert wird es nie.

### Die eine bewusste Lücke

Die neuen Spalten `TaxProfile.taxCategoryCode`, `InvoiceItem.unitCode` und
`InvoiceDocument.kind` haben **keinen CHECK-Constraint**. SQLite kann einer
bestehenden Tabelle keinen anfügen; das ginge nur über einen Neuaufbau, und
der hätte die drei Trigger auf `InvoiceItem` verworfen — die Sperre, die
Positionen finalisierter Rechnungen schützt. Die Trigger wiegen schwerer.
Validiert wird über Zod; die Begründung steht in der Migration
`20260911072246_einvoice_fields`.

---

## 26. Steuerberater-Export

Der Export unter **Einstellungen → Steuerberater-Export** ist eine Übergabe
von Ausgangsrechnungen, keine zweite Buchhaltung. Er wählt nach dem
Rechnungsdatum in einem beidseitig eingeschlossenen Zeitraum und nimmt nur
ausgestellte Dokumente auf. Ein Storno ist ein eigener Beleg mit eigener Nummer
und negativen Beträgen; der Bezug zum aufgehobenen Beleg steht daneben.

Das ZIP enthält drei Sichten auf dieselben eingefrorenen Daten:

1. `rechnungen.csv`: eine Zeile je Beleg mit Empfänger, Status und Summen,
2. `steueraufteilung.csv`: Bemessungsgrundlage und Steuer je Steuersatz,
3. `positionen.csv`: die einzelnen Leistungszeilen.

Dazu kommen auf Wunsch die unveränderten PDF- und vorhandenen XML-Dateien
unter `belege/`. Vor dem Verpacken werden Größe und SHA-256 gegen den
Dokumentdatensatz geprüft; bei einer Abweichung bricht der gesamte Export ab.
Ein unvollständiges Paket darf nicht still wie ein vollständiges aussehen.
`manifest.json` nennt Zeitraum und Zählerstände und trägt für jede weitere
Datei erneut Größe und Hash.

### CSV-Vertrag

UTF-8 mit BOM und Semikolon sind eine pragmatische Zusage an Excel auf einem
deutschen Windows-System; Geld steht mit Dezimalkomma und ohne
Währungssymbol in den Zellen. Jede Zelle ist in Anführungszeichen gesetzt.
Frei eingegebene Texte, die mit `=`, `+`, `-` oder `@` anfangen, bekommen ein
vorangestelltes Apostroph. Nur zu quoten verhindert keine Formelauswertung und
ein Kundenname darf beim Öffnen einer CSV niemals Programmtext werden.

### Warum noch kein DATEV-Buchungsstapel

Das DATEV-Format verlangt fachliche Angaben, die AgenturTool bewusst noch
nicht besitzt: mindestens Sach-/Debitorenkonten, die Abbildung von
Steuerkategorien auf Steuerschlüssel sowie Berater- und Mandantennummer. Diese
Werte zu raten würde eine formal importierbare, fachlich aber falsche Datei
erzeugen. D37 legt deshalb die Grenze fest: Jetzt ein vollständiges und
prüfbares Kanzleipaket; DATEV erst nach einer echten, mit der Kanzlei
abgestimmten Kontierungskonfiguration.

---

## Stand

Die Reihenfolge aus Abschnitt 20 ist abgearbeitet: Schritte 0 bis 14 sind
umgesetzt, V1 steht. Danach kam die Auslieferungsform dazu: Aus dem
geplanten Docker-Image wurde eine Desktop-Anwendung (D1), und die
PDF-Erzeugung wanderte von einem ferngesteuerten Browser auf Electrons
eigenes Chromium (D34). Was während der Umsetzung an Entscheidungen
dazukam, steht in den Abschnitten mit Buchstaben-Suffix (5a, 13a, 16a) bei
dem Thema, zu dem es gehört.

Danach kam die E-Rechnung dazu: XRechnung als eigenständige XML-Datei,
eingefroren wie das PDF und mit dem offiziellen KoSIT-Validator geprüft
(Abschnitt 24). Für die Übergabe an die Kanzlei gibt es nun das geprüfte ZIP
aus CSV, PDFs und vorhandenen XMLs (Abschnitt 26).

Was bewusst offen bleibt, steht in Abschnitt 21 — unter anderem Mahnwesen,
wiederkehrende Rechnungen, ZUGFeRD, das Lesen eingehender E-Rechnungen,
DATEV-Buchungsstapel, Mehrbenutzerbetrieb und Auswertungen. Nichts davon ist
verbaut: Die Snapshots tragen die Historie,
das Auth-Modul kennt bereits eine `User`-Tabelle, und die Berechnung liegt in
`shared` und nicht in der Oberfläche. Neue Entscheidungen von Tragweite werden
wie bisher vorher abgestimmt.
