# AgenturTool

Eigene Rechnungssoftware — selbst gehostet, unabhängig von externen
Rechnungsdiensten. Rechnungen erstellen, verwalten und als PDF exportieren.

**Status:** V1 — alle 15 Schritte der Roadmap sind umgesetzt. Rechnungen lassen sich erfassen und ausstellen (Nummer, eingefrorene Stammdaten, abgelegtes PDF), als versendet und bezahlt vermerken, stornieren und duplizieren; die Übersicht filtert, sortiert und blättert, das Dashboard zeigt Entwürfe, offene und überfällige Rechnungen. Eine Zeiterfassung hält gearbeitete Zeit je Kunde in Viertelstunden fest und druckt daraus einen Zeitnachweis für einen frei wählbaren Zeitraum. Ein Backup umfasst Datenbank, Logos und alle PDFs in einer ZIP-Datei; der Weg zurück ist einmal wirklich getestet. Ausgeliefert wird sie als Desktop-Anwendung für macOS und Windows: Doppelklick, eigenes Fenster, kein installierter Browser nötig — die PDFs entstehen über Electrons eigenes Chromium. Die Oberfläche sagt, wenn etwas schiefgeht, lässt sich mit der Tastatur bedienen und läuft vom Telefon bis zum breiten Bildschirm.

## Architektur

Die vollständige Architektur, alle getroffenen Entscheidungen und die
Reihenfolge der Umsetzung stehen in [`docs/ARCHITEKTUR.md`](docs/ARCHITEKTUR.md).

Kurzfassung des geplanten Stacks:

| Bereich   | Wahl                                                                                     |
| --------- | ---------------------------------------------------------------------------------------- |
| Monorepo  | pnpm Workspaces (`apps/web`, `apps/api`, `packages/shared`, `packages/invoice-template`) |
| Frontend  | React + TypeScript + Vite + Tailwind                                                     |
| Backend   | NestJS                                                                                   |
| Datenbank | SQLite via Prisma                                                                        |
| PDF       | HTML/CSS-Template + Electron (`printToPDF`)                                              |
| Betrieb   | Desktop-Anwendung (Electron), macOS und Windows                                          |

Die zwei prägenden Architekturprinzipien:

1. **Eine ausgestellte Rechnung ist ein Dokument, keine Datenbankzeile.** Beim
   Finalisieren werden alle Stammdaten als unveränderliche Snapshots
   eingefroren und das PDF dauerhaft gespeichert — eine spätere Änderung an
   Kundenadresse, Bankverbindung oder Template verändert historische
   Rechnungen nicht.
2. **Ein Template, zwei Konsumenten.** Dieselbe Template-Komponente rendert die
   Live-Vorschau im Browser und wird serverseitig für die PDF-Erzeugung
   benutzt. Vorschau und PDF können nicht auseinanderlaufen.

## Entwicklung

Voraussetzungen: Node 22+ und pnpm 10+. Einen Browser braucht es nicht —
Electron bringt seinen mit.

```bash
pnpm install
cp .env.example .env
pnpm db:migrate      # Schema anlegen
pnpm db:seed         # Steuerprofile und Grundeinstellungen
pnpm dev             # API auf :3000, Web auf :5173
```

Zwei Entwicklungswege, weil sie verschiedene Dinge gut können:

| Befehl             | Fenster           | PDFs |
| ------------------ | ----------------- | ---- |
| `pnpm dev`         | Browser auf :5173 | nein |
| `pnpm dev:desktop` | Electron          | ja   |

`pnpm dev` ist der schnellere Weg für Oberfläche und Backend: Beides lädt
bei jeder Änderung nach. PDFs entstehen dort nicht — sie brauchen Electron,
und die PDF-Routen sagen das auch, statt einen Fehler zu werfen, den
niemand deuten kann.

`pnpm dev:desktop` startet Vite und Electron zusammen; das Fenster zeigt
auf den Dev-Server, die Oberfläche lädt also weiterhin nach. Nur
Änderungen am Backend brauchen dort einen Neustart.

Weitere Befehle:

| Befehl                          | Wirkung                                                       |
| ------------------------------- | ------------------------------------------------------------- |
| `pnpm test`                     | Unit- und Integrationstests                                   |
| `pnpm lint` / `pnpm typecheck`  | Statische Prüfungen                                           |
| `pnpm verify`                   | Alle Prüfungen und den Produktions-Build ausführen            |
| `pnpm build`                    | Alle Pakete und Apps bauen                                    |
| `pnpm dev:desktop`              | Vite und Electron zusammen starten                            |
| `pnpm db:studio`                | Daten im Browser ansehen                                      |
| `pnpm db:verify`                | Prüft, dass alle CHECK-Constraints und Trigger vorhanden sind |
| `pnpm db:reset`                 | Datenbank verwerfen und neu aufbauen                          |
| `pnpm backup`                   | Archiv unter `data/backups/` erzeugen                         |
| `pnpm restore <archiv> --force` | Datenbank und `data/` aus einem Archiv wiederherstellen       |
| `pnpm user:set <e-mail>`        | Benutzer anlegen oder sein Passwort ändern                    |
| `pnpm paket`                    | Die Anwendung für dieses System packen                        |
| `pnpm rauchprobe`               | Die gepackte Anwendung starten und einmal durcharbeiten       |

### Warum es `db:verify` gibt

Prisma baut SQLite-Tabellen bei manchen Migrationen neu auf und erzeugt das
`CREATE TABLE` dabei aus dem Prisma-Schema. Handgeschriebene
`CHECK`-Constraints und Trigger — unter anderem die Sperre finalisierter
Rechnungen — verschwinden dabei ohne Fehlermeldung. `db:verify` vergleicht die
Datenbank gegen `apps/api/prisma/expected-constraints.ts` und läuft als Test
mit, damit ein solcher Verlust auffällt. Wer eine Migration schreibt, die eine
der betroffenen Tabellen anfasst, muss die Regeln dort erneut anlegen.

## Betrieb

### Als Anwendung

Die fertige Anwendung installiert sich wie jede andere: DMG öffnen, in den
Programme-Ordner ziehen, starten. Sie bringt alles mit — Server, Frontend
und den Browser für die PDF-Erzeugung.

Beim ersten Start legt sie Datenbank und Grundeinstellungen selbst an. Bei
jedem weiteren Start entsteht vor den Migrationen automatisch ein Backup.

Die Daten liegen außerhalb der Anwendung und überleben jedes Update:

| System  | Ort                                               |
| ------- | ------------------------------------------------- |
| macOS   | `~/Library/Application Support/AgenturTool/Daten` |
| Windows | `%APPDATA%\AgenturTool\Daten`                     |

Darin: `db.sqlite`, `assets/` (Logos), `invoices/<Jahr>/` (die ausgestellten
PDFs) und `backups/`. Das Menü führt unter „Ablage" direkt dorthin und legt
auf Wunsch ein Archiv an.

Fenstergröße und -position bleiben über Sitzungen hinweg erhalten. Liegt
das gespeicherte Rechteck auf keinem angeschlossenen Bildschirm mehr — der
zweite Monitor ist nicht da —, öffnet die Anwendung wieder mittig, statt
außerhalb des Sichtbaren zu erscheinen.

Nach außen spricht sie nicht. Über die beiden Chromium-Schalter hinaus
weist ein Filter jede Anfrage ab, die nicht an die eigene Rückschleife
geht; abgewiesene Versuche stehen im Protokoll.

Der Server hört auf `127.0.0.1` und auf einem Port, den das Betriebssystem
bei jedem Start neu vergibt. Es gibt keinen festen Port, um den sich eine
zweite Instanz streiten könnte — und ein zweiter Start holt ohnehin das
bestehende Fenster nach vorn, statt eine zweite Anwendung auf dieselbe
Datenbank zu setzen.

### Selbst bauen

```bash
pnpm install
pnpm build
pnpm --filter @agentur-tool/desktop paket
```

Das Ergebnis liegt unter `apps/desktop/release/`. Gepackt wird nicht das
Projektverzeichnis, sondern ein Abzug unter `apps/desktop/paket/` — warum,
steht in `scripts/paket.mjs` und in Abschnitt 16a der Architektur.

Das Programmsymbol entsteht aus demselben Zeichen wie das Favicon:

```bash
node apps/desktop/scripts/icon.mjs      # schreibt build/icon.png
```

### Prüfen, ob das Paket auch läuft

Dass ein Paket entsteht, heißt nicht, dass es startet: Der gepackte Baum
löst Module anders auf als das Repository, und Prisma sucht seine Engines
neben sich. Dafür gibt es die Rauchprobe. Sie startet die Anwendung mit
leerem Datenverzeichnis und arbeitet einmal durch — Migrationen,
Grunddaten, Kunde, Rechnung, Ausstellung, PDF, Backup — und verlangt
zuletzt, dass keine einzige Anfrage nach außen gehen wollte.

```bash
pnpm --filter @agentur-tool/desktop paket --nur-baum   # ohne zu packen
node apps/desktop/scripts/rauchprobe.mjs               # gegen den Baum

node apps/desktop/scripts/rauchprobe.mjs \
  apps/desktop/release/mac-arm64/AgenturTool.app
```

Auf einem Rechner ohne Bildschirm — einem Bauserver — gehört `xvfb-run -a`
davor. Die CI läuft beide Stufen bei jedem Push.

Gebaut wird je Plattform auf ihrer eigenen: Die Prisma-Engines ließen sich
über Kreuz laden, die nativen Binärdateien von `@node-rs/argon2` kommen
dagegen über plattformspezifische Optional-Dependencies, und pnpm
installiert nur die des Wirtssystems. Die CI baut deshalb auf drei Runnern
(macOS arm64, macOS x64, Windows).

Für eine signierte und notarisierte macOS-Anwendung zusätzlich
`APPLE_ID`, `APPLE_APP_SPECIFIC_PASSWORD` und `APPLE_TEAM_ID` setzen.
Fehlen sie, entsteht ein unsigniertes Paket — das startet auf dem eigenen
Rechner, auf einem fremden erst nach „Rechtsklick → Öffnen".

### Anmeldung

Im Desktop-Betrieb gibt es keine: Der Server hört nur auf die Rückschleife
des eigenen Rechners, und wer davorsitzt, ist angemeldet. `AUTH_ENABLED`
steht deshalb auf `false`, und die Oberfläche zeigt gar kein
Anmeldeformular.

Das Modul dahinter bleibt trotzdem im Code — argon2id, serverseitige
Sitzungen, Sperre nach zu vielen Fehlversuchen. Wer die Anwendung eines
Tages doch über ein Netz erreichbar macht, setzt den Schalter auf `true`
und legt einen Benutzer an:

```bash
pnpm user:set chef@example.de     # Passwort wird verdeckt abgefragt
```

Es gibt bewusst keine Registrierung und kein „Passwort vergessen": ein
Benutzer, auf der Kommandozeile angelegt. Ein neues Passwort meldet alle
bestehenden Sitzungen ab.
