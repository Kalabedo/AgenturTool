#!/bin/sh
# Migrationen laufen beim Start, nicht beim Bauen: Erst zur Laufzeit ist die
# Datenbank aus dem Volume überhaupt da. `migrate deploy` wendet nur an, was
# fehlt, und ist damit bei jedem Neustart unbedenklich.
set -e

cd /app/apps/api
node node_modules/prisma/build/index.js migrate deploy
cd /app

exec "$@"
