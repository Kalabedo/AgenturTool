import js from '@eslint/js';
import tseslint from 'typescript-eslint';
import globals from 'globals';

export default tseslint.config(
  {
    ignores: [
      '**/dist/**',
      '**/node_modules/**',
      '**/coverage/**',
      '**/*.d.ts',
      // Erzeugte Bäume: der Abzug fürs Verpacken und das fertige Paket.
      'apps/desktop/paket/**',
      'apps/desktop/release/**',
    ],
  },
  js.configs.recommended,
  ...tseslint.configs.recommended,
  {
    languageOptions: {
      globals: { ...globals.node, ...globals.browser },
    },
    rules: {
      '@typescript-eslint/no-unused-vars': [
        'error',
        { argsIgnorePattern: '^_', varsIgnorePattern: '^_' },
      ],
      '@typescript-eslint/consistent-type-imports': 'error',
    },
  },
  {
    // NestJS löst Abhängigkeiten über die zur Laufzeit emittierten
    // Konstruktor-Metadaten auf. Ein `import type` entfernt den Import aus
    // dem Kompilat, und die Injection schlägt dann zur Laufzeit fehl —
    // deshalb gilt die Regel im Backend nicht.
    files: ['apps/api/**/*.ts'],
    rules: {
      '@typescript-eslint/consistent-type-imports': 'off',
    },
  },
);
