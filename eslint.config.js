import js from '@eslint/js'
import globals from 'globals'
import reactHooks from 'eslint-plugin-react-hooks'
import reactRefresh from 'eslint-plugin-react-refresh'
import tseslint from 'typescript-eslint'
import prettier from 'eslint-config-prettier'
import { defineConfig, globalIgnores } from 'eslint/config'

export default defineConfig([
  globalIgnores(['dist', 'coverage', 'prototype']),
  {
    files: ['**/*.{ts,tsx}'],
    extends: [
      js.configs.recommended,
      tseslint.configs.recommended,
      reactHooks.configs.flat.recommended,
      reactRefresh.configs.vite,
    ],
    languageOptions: {
      globals: { ...globals.browser },
    },
  },
  {
    // Runtime code must never import product-looking hardcoded data. Tests may
    // use synthetic fixtures, but src/app and src/server must run on connectors.
    files: ['src/{app,server}/**/*.{ts,tsx}'],
    rules: {
      'no-restricted-imports': [
        'error',
        {
          patterns: [
            {
              group: ['**/data/sampleData', '**/sampleData', '**/data/countryProfiles'],
              message:
                'Runtime code must not import hardcoded product data. Use connector-backed ingestion instead.',
            },
          ],
        },
      ],
    },
  },
  {
    // The CLIENT BUNDLE (src/app + the entry) must never pull in connectors, the
    // ingestion pipeline, the brief producer, or key config — it may only RENDER a
    // gate-passed brief loaded at runtime, never PRODUCE one (no network/keys in the
    // browser). Importing the pure publish gate for defense-in-depth re-validation is
    // allowed. This block also re-states the hardcoded-data ban it overrides for src/app.
    files: ['src/app/**/*.{ts,tsx}', 'src/main.tsx'],
    rules: {
      'no-restricted-imports': [
        'error',
        {
          patterns: [
            {
              group: ['**/data/sampleData', '**/sampleData', '**/data/countryProfiles'],
              message:
                'Runtime code must not import hardcoded product data. Use connector-backed ingestion instead.',
            },
            {
              group: [
                '**/server/connectors/**',
                '**/server/ingestion/**',
                '**/server/runtime/**',
                '**/server/config',
                '**/scripts/**',
              ],
              message:
                'Client code must not import connectors, the ingestion pipeline, the brief producer/generator, or key config. The runtime only renders a gate-passed BriefDraft loaded at runtime.',
            },
          ],
        },
      ],
    },
  },
  prettier,
])
