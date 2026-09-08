# AgenturTool

Eigene Rechnungssoftware — selbst gehostet, unabhängig von externen
Rechnungsdiensten. Rechnungen erstellen, verwalten und als PDF exportieren.

**Status:** Schritte 0 bis 9 umgesetzt — die Kernfunktion steht. Rechnungen lassen sich erfassen, ausstellen und als PDF herunterladen: Beim Ausstellen bekommt die Rechnung ihre Nummer, alle Stammdaten werden eingefroren und das PDF wird dauerhaft abgelegt. Als Nächstes folgen Storno, Duplizieren und die Statusverwaltung (Schritt 10).

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

| Befehl                         | Wirkung                                                       |
| ------------------------------ | ------------------------------------------------------------- |
| `pnpm test`                    | Unit- und Integrationstests                                   |
| `pnpm lint` / `pnpm typecheck` | Statische Prüfungen                                           |
| `pnpm build`                   | Alle Pakete und Apps bauen                                    |
| `pnpm db:studio`               | Daten im Browser ansehen                                      |
| `pnpm db:verify`               | Prüft, dass alle CHECK-Constraints und Trigger vorhanden sind |
| `pnpm db:reset`                | Datenbank verwerfen und neu aufbauen                          |

### Warum es `db:verify` gibt

Prisma baut SQLite-Tabellen bei manchen Migrationen neu auf und erzeugt das
`CREATE TABLE` dabei aus dem Prisma-Schema. Handgeschriebene
`CHECK`-Constraints und Trigger — unter anderem die Sperre finalisierter
Rechnungen — verschwinden dabei ohne Fehlermeldung. `db:verify` vergleicht die
Datenbank gegen `apps/api/prisma/expected-constraints.ts` und läuft als Test
mit, damit ein solcher Verlust auffällt. Wer eine Migration schreibt, die eine
der betroffenen Tabellen anfasst, muss die Regeln dort erneut anlegen.
