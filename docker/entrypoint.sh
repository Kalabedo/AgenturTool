#!/bin/sh
# Migrationen laufen beim Start, nicht beim Bauen: Erst zur Laufzeit ist die
# Datenbank aus dem Volume überhaupt da. Vor einer Änderung entsteht
# automatisch ein konsistentes Backup. Eine neue Installation bekommt eine
# leere SQLite-Datei (Prisma 6 legt sie bei `migrate deploy` nicht zuverlässig
# selbst an) und danach die idempotenten Grunddaten.
set -e

mkdir -p "$DATA_DIR"

cd /app/apps/api

if [ -s "$DATA_DIR/db.sqlite" ]; then
  node_modules/.bin/tsx scripts/backup.ts --if-exists
else
  touch "$DATA_DIR/db.sqlite"
fi

node node_modules/prisma/build/index.js migrate deploy
node node_modules/prisma/build/index.js db seed
cd /app

exec "$@"
