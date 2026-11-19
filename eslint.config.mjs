import js from '@eslint/js'
import globals from 'globals'
import tseslint from 'typescript-eslint'
import reactHooks from 'eslint-plugin-react-hooks'
import reactRefresh from 'eslint-plugin-react-refresh'
import jsxA11y from 'eslint-plugin-jsx-a11y'

export default tseslint.config(
  {
    ignores: [
      '**/dist/**',
      '**/.vite/**',
      '**/node_modules/**',
      'tmp/**',
      // Agent worktrees inside the checkout are other branches, linted there (AI-12).
      '.worktrees/**',
      // Submodules are other repos, linted and tested there (devkit-test skips them too).
      '**/external/**',
      'data/**',
      '**/prisma/migrations/**',
      // Capacitor native project: generated/native code, not linted here.
      'apps/mobile/android/**',
      'apps/mobile/ios/**',
    ],
  },
  js.configs.recommended,
  ...tseslint.configs.recommended,
  {
    files: ['**/*.{js,mjs,cjs}'],
    languageOptions: {
      globals: {
        ...globals.node,
      },
    },
  },
  {
    files: ['**/*.{ts,tsx}'],
    languageOptions: {
      globals: {
        ...globals.browser,
        ...globals.node,
      },
    },
    rules: {
      '@typescript-eslint/no-unused-vars': [
        'warn',
        { argsIgnorePattern: '^_', varsIgnorePattern: '^_' },
      ],
    },
  },
  {
    files: ['apps/linux-desktop/resources/*.js'],
    languageOptions: { globals: globals.browser },
  },
  {
    files: ['apps/web/**/*.{ts,tsx}'],
    plugins: {
      'react-hooks': reactHooks,
      'react-refresh': reactRefresh,
      'jsx-a11y': jsxA11y,
    },
    // Map Joy's components to the elements they render, so the a11y rules see them. Joy's Link
    // is left out: it usually renders a router link or a button through `component`.
    settings: {
      'jsx-a11y': {
        components: {
          Button: 'button',
          IconButton: 'button',
          Input: 'input',
          Textarea: 'textarea',
        },
      },
    },
    rules: {
      ...reactHooks.configs.recommended.rules,
      // UI-14: icon-only controls need accessible names; dialogs and media stay usable.
      ...jsxA11y.flatConfigs.recommended.rules,
      'react-refresh/only-export-components': [
        'warn',
        { allowConstantExport: true },
      ],
      'no-alert': 'error',
    },
  },
)
