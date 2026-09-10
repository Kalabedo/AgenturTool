import { defineConfig } from 'vitest/config';

export default defineConfig({
  test: {
    // Nur `test/` — `src/` gehört dem Hauptprozess und lässt sich ohne
    // laufendes Electron nicht laden.
    include: ['test/**/*.test.{ts,mjs}'],
  },
});
