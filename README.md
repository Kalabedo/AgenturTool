# AgenturTool

Eigene Rechnungssoftware — selbst gehostet, unabhängig von externen
Rechnungsdiensten. Rechnungen erstellen, verwalten und als PDF exportieren.

**Status:** Planung abgeschlossen, Implementierung noch nicht begonnen.

## Architektur

Die vollständige Architektur, alle getroffenen Entscheidungen und die
Reihenfolge der Umsetzung stehen in [`docs/ARCHITEKTUR.md`](docs/ARCHITEKTUR.md).

Kurzfassung des geplanten Stacks:

| Bereich | Wahl |
|---|---|
| Monorepo | pnpm Workspaces (`apps/web`, `apps/api`, `packages/shared`, `packages/invoice-template`) |
| Frontend | React + TypeScript + Vite + Tailwind |
| Backend | NestJS |
| Datenbank | SQLite via Prisma |
| PDF | HTML/CSS-Template + Puppeteer |
| Betrieb | lokal, deploy-fähig als Docker-Image |

Die zwei prägenden Architekturprinzipien:

1. **Eine ausgestellte Rechnung ist ein Dokument, keine Datenbankzeile.** Beim
   Finalisieren werden alle Stammdaten als unveränderliche Snapshots
   eingefroren und das PDF dauerhaft gespeichert — eine spätere Änderung an
   Kundenadresse, Bankverbindung oder Template verändert historische
   Rechnungen nicht.
2. **Ein Template, zwei Konsumenten.** Dieselbe Template-Komponente rendert die
   Live-Vorschau im Browser und wird serverseitig für die PDF-Erzeugung
   benutzt. Vorschau und PDF können nicht auseinanderlaufen.
