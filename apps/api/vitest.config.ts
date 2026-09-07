import { defineConfig } from 'vitest/config';

export default defineConfig({
  test: {
    // Jeder Test legt eine eigene SQLite-Datei an; parallele Läufe würden
    // sich über die DATABASE_URL in die Quere kommen.
    fileParallelism: false,
    testTimeout: 30_000,
    hookTimeout: 60_000,
  },
});
