# AgenturTool

Eigene Rechnungssoftware — selbst gehostet, unabhängig von externen
Rechnungsdiensten. Rechnungen erstellen, verwalten und als PDF exportieren.

**Status:** V1 — alle 15 Schritte der Roadmap sind umgesetzt. Rechnungen lassen sich erfassen und ausstellen (Nummer, eingefrorene Stammdaten, abgelegtes PDF), als versendet und bezahlt vermerken, stornieren und duplizieren; die Übersicht filtert, sortiert und blättert, das Dashboard zeigt Entwürfe, offene und überfällige Rechnungen. Eine Zeiterfassung hält gearbeitete Zeit je Kunde in Viertelstunden fest und druckt daraus einen Zeitnachweis für einen frei wählbaren Zeitraum. Beim Ausstellen entsteht neben dem PDF eine XRechnung nach EN 16931, geprüft
mit dem offiziellen KoSIT-Validator. Ein Backup umfasst Datenbank, Logos und
alle erzeugten Dateien in einer ZIP-Datei; der Weg zurück ist einmal wirklich getestet. Ein Steuerberater-Paket sammelt für einen Rechnungszeitraum CSV-Auswertungen, Steueraufteilung, Positionen und die unveränderten PDF-/XML-Belege. Verschickt wird direkt aus der Anwendung — per SMTP oder über die Mail-Anwendung des Rechners, mit PDF, XRechnung und Zeitnachweis als Anhängen, editierbaren Textvorlagen und einem Protokoll, das auch den gescheiterten Versuch festhält. Wie die Rechnung aussieht, bestimmt ein eigener Bereich „Design": vier mitgelieferte Vorlagen — klassisch, modern, kompakt, schlicht —, dazu Farben, Schrift, Logogröße, Dichte und die Sichtbarkeit einzelner Blöcke, alles mit einer A4-Vorschau daneben, die jedem Tastendruck folgt. Eine bereits ausgestellte Rechnung bleibt davon unberührt: Sie trägt das Aussehen vom Tag ihrer Ausstellung. Ausgeliefert wird sie als Desktop-Anwendung für macOS und Windows: Doppelklick, eigenes Fenster, kein installierter Browser nötig — die PDFs entstehen über Electrons eigenes Chromium. Die Oberfläche sagt, wenn etwas schiefgeht, lässt sich mit der Tastatur bedienen, läuft vom Telefon bis zum breiten Bildschirm und kennt einen Dunkelmodus, der auf Wunsch dem Betriebssystem folgt.

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
| `pnpm einrechnung:pruefen`      | Die E-Rechnung gegen den KoSIT-Validator prüfen               |
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

| System        | Paket                      | Unterstützt                     |
| ------------- | -------------------------- | ------------------------------- |
| macOS ARM64   | eigenes Apple-Silicon-DMG  | macOS 13 oder neuer             |
| macOS x64     | eigenes Intel-DMG          | macOS 13 oder neuer             |
| Windows x64   | NSIS-Installer             | Windows 10 und 11               |
| Windows ARM64 | Windows-x64-Paket emuliert | nicht eigenständig zertifiziert |

Linux-Pakete dienen nur der Rauchprobe in CI und werden nicht veröffentlicht.

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

Ein Paket entsteht immer nativ für System und Architektur des Baurechners.
Ein Intel-Mac baut also ausschließlich das Intel-DMG, ein Apple-Silicon-Mac
das ARM64-DMG und ein Windows-x64-Rechner den x64-Installer. Ein Cross-Build
wird abgewiesen, weil Prisma und argon2 native Binärdateien enthalten.

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

Mit einem festen Datenverzeichnis prüft ein zweiter Lauf zusätzlich, dass
Rechnung, PDF und Start-Backup ein Update beziehungsweise einen Neustart
überleben:

```bash
node apps/desktop/scripts/rauchprobe.mjs <anwendung> --data-dir /tmp/agentur-tool-test
node apps/desktop/scripts/rauchprobe.mjs <anwendung> --data-dir /tmp/agentur-tool-test --reopen
```

Auf einem Rechner ohne Bildschirm — einem Bauserver — gehört `xvfb-run -a`
davor. Die CI läuft beide Stufen bei jedem Push.

Die CI baut deshalb auf drei nativen Runnern und prüft nicht nur den
Paketbaum: Sie hängt die DMGs ein beziehungsweise installiert das NSIS-Paket
still und startet genau die darin enthaltene Anwendung zweimal.

Signierte Veröffentlichungen entstehen ausschließlich über einen passenden
`vMAJOR.MINOR.PATCH`-Tag. Einrichtung, Geheimnisse und Ablauf stehen im
[`Release-Handbuch`](docs/RELEASE.md).

### E-Rechnung

Beim Ausstellen entsteht neben dem PDF eine **XRechnung** nach EN 16931 —
dieselbe Datei, die ab 2027 für Rechnungen an deutsche Unternehmen
vorgeschrieben ist. Sie wird wie das PDF eingefroren und liegt neben ihm
unter `invoices/<Jahr>/`; der Knopf „XRechnung (XML)" lädt sie herunter.

Dafür braucht es drei Angaben mehr als für ein PDF:

| Wo                | Was                                                                    |
| ----------------- | ---------------------------------------------------------------------- |
| Unternehmensdaten | eigene elektronische Adresse und Telefonnummer                         |
| Kunde             | Leitweg-ID beziehungsweise Referenz des Käufers, elektronische Adresse |
| Steuerprofil      | Steuerkategorie und, außer bei Regelbesteuerung, ein Befreiungsgrund   |

Fehlt etwas davon, lässt sich die Rechnung trotzdem ausstellen — sie ist
nach § 14 UStG gültig. Nur die XML-Datei entsteht dann nicht, und die
Rechnungsmaske sagt, was fehlt.

Verschickt wird die Datei per E-Mail — direkt aus der Anwendung, siehe
unten. Einen Peppol-Zugang gibt es bewusst nicht: Er bräuchte einen
akkreditierten Zugangspunkt und damit eine dauerhafte Anbindung an einen
Dienst. Der E-Mail-Versand ist demgegenüber eine Verbindung, die nur auf
Knopfdruck entsteht und die es ohne Einrichtung gar nicht gibt.

Dass die erzeugten Dateien gültig sind, prüft nicht die Anwendung selbst,
sondern der offizielle **KoSIT-Validator** — bei jedem Push in der CI und
auf Wunsch von Hand:

```bash
pnpm einrechnung:pruefen      # braucht Java, wird nie ausgeliefert
```

### E-Mail-Versand

Unter **Einstellungen → E-Mail** wird eingerichtet, wie Rechnungen das Haus
verlassen. Ohne Einrichtung baut AgenturTool keine Verbindung nach außen auf —
das ist die Vorbelegung, nicht ein Zustand, aus dem man herausmuss.

| Weg                | Was AgenturTool tut                                               |
| ------------------ | ----------------------------------------------------------------- |
| **SMTP-Server**    | verschickt selbst und vermerkt die Rechnung als versendet         |
| **Mail-Anwendung** | öffnet einen Entwurf und legt die Anhänge in einen Ordner daneben |
| **Kein Versand**   | Vorbelegung                                                       |

Verschickt wird aus der Vorgang-Karte einer Rechnung („Per E-Mail senden") und
aus dem Archiv der Zeiterfassung. Der Dialog belegt Empfänger, Betreff und Text
aus der Vorlage vor und bietet PDF, XRechnung und Zeitnachweis als Anhänge an;
alles davon lässt sich vor dem Absenden ändern. Was nicht anhängbar ist, steht
mit seinem Grund daneben, statt aus der Liste zu verschwinden.

Der Unterschied zwischen den beiden Wegen ist kein Detail: Über SMTP weiß die
Anwendung, dass der Mailserver die Nachricht angenommen hat, und setzt den
Versandvermerk. Über die Mail-Anwendung weiß sie nur, dass ein Fenster
aufgegangen ist — den Versandvermerk setzt dort ein eigener Klick.

Auf diesem Weg versucht AgenturTool zuerst einen **echten Entwurf**: Bei
Apple Mail entsteht ein fertiges Verfassen-Fenster mit Empfängern, Betreff,
Text und Anhängen — es bleibt nur „Senden". macOS fragt dafür einmalig um
Erlaubnis; wer sie verweigert, landet automatisch auf dem zweiten Weg.

Der zweite Weg ist eine vollständige Nachricht als `.eml`-Datei, die
AgenturTool öffnet. Auch darin stecken die Anhänge. Outlook erkennt sie als
Entwurf und öffnet das Verfassen-Fenster; andere Programme zeigen sie als
eingegangene Nachricht, aus der ein „Weiterleiten" die Anhänge übernimmt.

Jede Nachricht steht anschließend im Versandprotokoll, **auch die
fehlgeschlagene**: Ein Versuch, von dem nichts übrig bleibt, ist genau der,
bei dem man später nicht mehr weiß, ob die Rechnung draußen ist.

Betreff und Text kommen aus drei bearbeitbaren Vorlagen — Rechnung, Storno,
Zeitnachweis. Platzhalter wie `{{rechnungsnummer}}` oder `{{anrede}}` setzt
AgenturTool beim Öffnen des Dialogs ein; die Einstellungsseite zeigt daneben
eine Vorschau mit Beispielwerten und findet auf Wunsch zum Auslieferungstext
zurück.

Das SMTP-Passwort liegt verschlüsselt in der Datenbank, sein Schlüssel im
Schlüsselbund des Betriebssystems (ersatzweise in `data/mail.key`). Beides
liegt **nicht** im Backup: Wer eine Sicherung auf einem anderen Rechner
einspielt, muss das Passwort einmal neu eingeben, und die Einstellungen sagen
das auch.

### Steuerberater-Export

Unter **Einstellungen → Steuerberater-Export** entsteht für einen inklusiven
Rechnungszeitraum ein ZIP-Paket. Entwürfe bleiben draußen; Rechnungen und
Stornos werden aus ihren unveränderlichen Snapshots gelesen. Das Paket enthält:

- `rechnungen.csv` mit Netto-, Steuer- und Bruttosummen je Beleg
- `steueraufteilung.csv` mit Bemessungsgrundlage und Steuer je Steuersatz
- `positionen.csv` mit den einzelnen Leistungen
- auf Wunsch die gespeicherten PDFs und vorhandenen XRechnung-XML-Dateien
- `manifest.json` mit Zeitraum, Zählerständen und SHA-256-Prüfsummen

Die CSV-Dateien sind UTF-8 mit BOM, Semikolon-getrennt und verwenden das
deutsche Dezimalkomma. Frei eingegebene Texte werden gegen Tabellenformeln
abgesichert.

Das Paket heißt bewusst nicht DATEV-Export. Ein belastbarer
DATEV-Buchungsstapel braucht Konten, Steuerschlüssel sowie Berater- und
Mandantennummer; diese Zuordnung muss zuerst mit der Kanzlei festgelegt werden.
Das jetzige Format gibt der Kanzlei alle Rechnungsdaten und Originalbelege,
ohne Importfähigkeit vorzutäuschen.

### Aktualisieren

AgenturTool sucht nicht im Netz nach Updates. Vor einem Update empfiehlt sich
ein Backup über die Anwendung; danach wird das neue signierte Paket über die
bestehende Installation installiert. Die Daten liegen außerhalb der
Anwendung und bleiben dabei erhalten. Beim ersten Start der neuen Version
entsteht vor möglichen Datenbankmigrationen automatisch ein weiteres Backup.

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
