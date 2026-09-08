# AgenturTool

Eigene Rechnungssoftware — selbst gehostet, unabhängig von externen
Rechnungsdiensten. Rechnungen erstellen, verwalten und als PDF exportieren.

**Status:** Schritte 0 bis 13 umgesetzt — alltagstauglich, gesichert und deploy-fähig. Rechnungen lassen sich erfassen und ausstellen (Nummer, eingefrorene Stammdaten, abgelegtes PDF), als versendet und bezahlt vermerken, stornieren und duplizieren; die Übersicht filtert, sortiert und blättert, das Dashboard zeigt Entwürfe, offene und überfällige Rechnungen. Ein Backup umfasst Datenbank, Logos und alle PDFs in einer ZIP-Datei; der Weg zurück ist einmal wirklich getestet. Anmeldung (argon2id, serverseitige Sitzungen) lässt sich per `AUTH_ENABLED` zuschalten, und ein Docker-Image bringt API, Frontend und Chromium zusammen. Es fehlt nur noch die Politur (Schritt 14).

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
| PDF       | HTML/CSS-Template + Puppeteer                                                            |
| Betrieb   | lokal, deploy-fähig als Docker-Image                                                     |

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

Voraussetzungen: Node 22+, pnpm 10+ und ein Chromium für die PDF-Erzeugung
(`chromium`, `chromium-browser` oder Google Chrome). Liegt es nicht an einem
der üblichen Orte, zeigt `PUPPETEER_EXECUTABLE_PATH` in der `.env` darauf.
Ohne Chromium läuft alles außer dem PDF; die Rendertests überspringen sich.

```bash
pnpm install
cp .env.example .env
pnpm db:migrate      # Schema anlegen
pnpm db:seed         # Steuerprofile und Grundeinstellungen
pnpm dev             # API auf :3000, Web auf :5173
```

Weitere Befehle:

| Befehl                          | Wirkung                                                       |
| ------------------------------- | ------------------------------------------------------------- |
| `pnpm test`                     | Unit- und Integrationstests                                   |
| `pnpm lint` / `pnpm typecheck`  | Statische Prüfungen                                           |
| `pnpm build`                    | Alle Pakete und Apps bauen                                    |
| `pnpm db:studio`                | Daten im Browser ansehen                                      |
| `pnpm db:verify`                | Prüft, dass alle CHECK-Constraints und Trigger vorhanden sind |
| `pnpm db:reset`                 | Datenbank verwerfen und neu aufbauen                          |
| `pnpm backup`                   | Archiv unter `data/backups/` erzeugen                         |
| `pnpm restore <archiv> --force` | Datenbank und `data/` aus einem Archiv wiederherstellen       |
| `pnpm user:set <e-mail>`        | Benutzer anlegen oder sein Passwort ändern                    |

### Warum es `db:verify` gibt

Prisma baut SQLite-Tabellen bei manchen Migrationen neu auf und erzeugt das
`CREATE TABLE` dabei aus dem Prisma-Schema. Handgeschriebene
`CHECK`-Constraints und Trigger — unter anderem die Sperre finalisierter
Rechnungen — verschwinden dabei ohne Fehlermeldung. `db:verify` vergleicht die
Datenbank gegen `apps/api/prisma/expected-constraints.ts` und läuft als Test
mit, damit ein solcher Verlust auffällt. Wer eine Migration schreibt, die eine
der betroffenen Tabellen anfasst, muss die Regeln dort erneut anlegen.

## Betrieb

### Lokal

```bash
pnpm build
pnpm --filter @agentur-tool/api start   # alles unter http://127.0.0.1:3000
```

Die API liefert das gebaute Frontend gleich mit; ein zweiter Webserver ist
nicht nötig. Gebunden wird an `127.0.0.1` — lokal soll die Anwendung nicht im
Netzwerk hängen.

### Im Container

```bash
cp .env.example .env      # AUTH_ENABLED=true setzen
docker compose up -d --build
docker compose exec app apps/api/node_modules/.bin/tsx apps/api/scripts/user.ts chef@example.de
```

Das Image enthält API, gebautes Frontend und Chromium. Der gesamte Zustand —
Datenbank, Logos, PDFs, Sicherungen — liegt im Volume unter `/data` und
überlebt jedes `docker compose up --build`. Der Port ist an `127.0.0.1` des
Hosts gebunden: Erreichbar wird die Anwendung erst durch Tailscale.

Aktualisieren:

```bash
git pull && docker compose up -d --build
```

Migrationen laufen beim Start des Containers (`prisma migrate deploy`); ein
Backup vorher schadet trotzdem nie: `docker compose exec app pnpm backup`.

### Tailscale

Die Anwendung gehört nicht ins offene Internet. Tailscale nimmt ihr die
Erreichbarkeit von außen ab und bringt HTTPS gleich mit:

```bash
tailscale up
tailscale serve --bg 3000      # https://<maschine>.<tailnet>.ts.net
```

Damit ist die Anwendung von jedem Gerät im eigenen Tailnet erreichbar —
iPhone, Mac, Windows —, und von sonst niemandem. Kein offener Port, kein
öffentlich erreichbares Anmeldeformular, keine Bot-Scans. Das Zertifikat
kommt von Tailscale, Let's Encrypt und ein Reverse Proxy entfallen.

Terminiert Tailscale das HTTPS (wie oben), bleibt `COOKIE_SECURE=true`.
Wer die Anwendung ohne HTTPS direkt über die Tailscale-Adresse aufruft, muss
`COOKIE_SECURE=false` setzen — sonst schickt der Browser das Sitzungs-Cookie
nicht mit.

### Anmeldung

`AUTH_ENABLED=false` (Voreinstellung) ist der lokale Betrieb: kein
Anmeldeformular, der Server hört ohnehin nur auf `127.0.0.1`. Sobald die
Anwendung über das Netz erreichbar ist, gehört der Schalter auf `true` und ein
Benutzer angelegt:

```bash
pnpm user:set chef@example.de     # Passwort wird verdeckt abgefragt
```

Es gibt bewusst keine Registrierung und kein „Passwort vergessen": ein
Benutzer, auf der Kommandozeile angelegt. Ein neues Passwort meldet alle
bestehenden Sitzungen ab.
