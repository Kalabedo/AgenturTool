# syntax=docker/dockerfile:1

# ---------------------------------------------------------------------------
# Bauen
# ---------------------------------------------------------------------------
# Debian statt Alpine, weil Prisma und @node-rs/argon2 vorgefertigte Binärdateien
# gegen glibc ausliefern. Auf musl müsste beides aus den Quellen gebaut werden —
# viel Aufwand für ein paar Megabyte.
FROM node:22-bookworm-slim AS builder

WORKDIR /app
ENV CI=true
RUN corepack enable

# Erst die Manifeste, dann der Rest: Solange sich keine Abhängigkeit ändert,
# bleibt die Installationsschicht im Zwischenspeicher liegen.
COPY package.json pnpm-lock.yaml pnpm-workspace.yaml ./
COPY apps/api/package.json apps/api/
COPY apps/web/package.json apps/web/
COPY packages/shared/package.json packages/shared/
COPY packages/invoice-template/package.json packages/invoice-template/

# Puppeteer holt sich hier kein Chromium: puppeteer-core lädt grundsätzlich
# nichts nach, und das Laufzeit-Image bringt seines aus dem Paketmanager mit.
RUN pnpm install --frozen-lockfile

COPY . .

# `pnpm build` erzeugt zuerst den Prisma-Client und die beiden internen
# Pakete. Damit ist derselbe Befehl lokal, in CI und im Image reproduzierbar.
RUN pnpm build

# Die Entwicklungsabhängigkeiten fliegen wieder raus. Was bleibt, ist das, was
# der Server zur Laufzeit wirklich lädt — dazu gehören `prisma` (Migrationen
# beim Start) und `tsx` (die Skripte für Backup, Restore und Benutzer laufen
# auch im Container).
RUN pnpm prune --prod

# ---------------------------------------------------------------------------
# Laufzeit
# ---------------------------------------------------------------------------
FROM node:22-bookworm-slim AS runtime

# Die Wartungsbefehle in der Dokumentation (`pnpm backup`, `pnpm user:set`)
# müssen auch im fertigen Container ohne Download beim ersten Aufruf laufen.
RUN corepack enable && corepack install --global pnpm@10.33.0

# Chromium und die Schriften kommen aus Debian, nicht aus Puppeteers Download
# (D32): So bekommt das Image die Sicherheitsaktualisierungen der Distribution,
# und die Version ist nachvollziehbar an das Basis-Image gebunden.
# fonts-liberation deckt die Standardschriften ab; die Rechnungsschrift selbst
# steckt als data-URI in der Vorlage und braucht kein Paket.
RUN apt-get update \
  && apt-get install --no-install-recommends -y \
    chromium \
    fonts-liberation \
    ca-certificates \
    tini \
  && rm -rf /var/lib/apt/lists/*

ENV NODE_ENV=production \
    PORT=3000 \
    HOST=0.0.0.0 \
    DATA_DIR=/data \
    DATABASE_URL=file:/data/db.sqlite \
    WEB_ROOT=/app/apps/web/dist \
    PUPPETEER_EXECUTABLE_PATH=/usr/bin/chromium \
    PUPPETEER_NO_SANDBOX=true \
    AUTH_ENABLED=true

WORKDIR /app

# `node` gibt es im Basis-Image bereits als unprivilegierten Benutzer. Chromium
# läuft damit ohne eigene Sandbox (PUPPETEER_NO_SANDBOX), aber auch ohne Rechte,
# die sich zu missbrauchen lohnten — genau die Abwägung aus D32.
COPY --from=builder --chown=node:node /app /app

# Der Zustand liegt ausdrücklich außerhalb des Images: Datenbank, Assets, PDFs
# und Sicherungen gehören in ein Volume, sonst wären sie beim nächsten
# `docker compose pull` weg.
RUN mkdir -p /data && chown node:node /data
VOLUME ["/data"]

COPY --chown=node:node docker/entrypoint.sh /usr/local/bin/entrypoint.sh
RUN chmod +x /usr/local/bin/entrypoint.sh

USER node
EXPOSE 3000

# Gilt auch bei `docker run` ohne Compose; Compose überschreibt dieselbe
# Prüfung mit seinen eigenen Zeitwerten.
HEALTHCHECK --interval=30s --timeout=5s --start-period=20s --retries=3 \
  CMD node -e "fetch('http://127.0.0.1:3000/api/health').then(r=>process.exit(r.ok?0:1)).catch(()=>process.exit(1))"

# tini als PID 1: Chromium hinterlässt Kindprozesse, und ohne einen
# init-Prozess, der sie einsammelt, füllen sich Zombies an.
ENTRYPOINT ["/usr/bin/tini", "--", "/usr/local/bin/entrypoint.sh"]
CMD ["node", "apps/api/dist/main.js"]
