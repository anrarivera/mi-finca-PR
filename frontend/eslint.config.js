import js from '@eslint/js'
import globals from 'globals'
import reactHooks from 'eslint-plugin-react-hooks'
import reactRefresh from 'eslint-plugin-react-refresh'
import tseslint from 'typescript-eslint'
import { defineConfig, globalIgnores } from 'eslint/config'

export default defineConfig([
  globalIgnores(['dist']),
  {
    files: ['**/*.{ts,tsx}'],
    extends: [
      js.configs.recommended,
      tseslint.configs.recommended,
      reactHooks.configs.flat.recommended,
      reactRefresh.configs.vite,
    ],
    languageOptions: {
      ecmaVersion: 2020,
      globals: globals.browser,
    },
    rules: {
      // The React 19 compiler-powered rules flag long-standing patterns in
      // the canvas/drawing code (imperative Leaflet + SVG interop). Keep
      // them visible as warnings; fixing them requires careful refactors.
      'react-hooks/set-state-in-effect': 'warn',
      'react-hooks/refs': 'warn',
      // shadcn/ui files export helpers alongside components by design.
      'react-refresh/only-export-components': 'warn',
    },
  },
])
