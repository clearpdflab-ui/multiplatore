import reactHooks from 'eslint-plugin-react-hooks';
import reactRefresh from 'eslint-plugin-react-refresh';
import eslintComments from '@eslint-community/eslint-plugin-eslint-comments';
import tseslint from 'typescript-eslint';
import globals from 'globals';

const sharedRules = {
  'prefer-const': 'error',
  'no-var': 'error',
  eqeqeq: ['error', 'always', { null: 'ignore' }], // == null e' l'idioma per null|undefined
  curly: ['error', 'all'],
};

const tsParser = {
  languageOptions: {
    parser: tseslint.parser,
    parserOptions: { ecmaVersion: 'latest', sourceType: 'module' },
  },
  plugins: { '@typescript-eslint': tseslint.plugin },
};

export default [
  {
    ignores: ['dist/**', 'coverage/**', 'node_modules/**', 'pyengine/**', '.serena/**'],
  },

  // App browser (src)
  {
    ...tsParser,
    files: ['src/**/*.{ts,tsx}'],
    languageOptions: {
      ...tsParser.languageOptions,
      globals: globals.browser,
    },
    plugins: {
      ...tsParser.plugins,
      'react-hooks': reactHooks,
      'react-refresh': reactRefresh,
      'eslint-comments': eslintComments,
    },
    rules: {
      ...reactHooks.configs.recommended.rules,
      'react-refresh/only-export-components': ['warn', { allowConstantExport: true }],
      'eslint-comments/disable-enable-pair': 'error',
      'eslint-comments/no-duplicate-disable': 'error',
      'no-unused-vars': 'off',
      '@typescript-eslint/no-unused-vars': ['warn', { argsIgnorePattern: '^_' }],
      '@typescript-eslint/no-explicit-any': 'warn',
      '@typescript-eslint/explicit-function-return-type': 'off',
      '@typescript-eslint/explicit-module-boundary-types': 'off',
      '@typescript-eslint/no-namespace': 'off',
      ...sharedRules,
    },
  },

  // Test
  {
    ...tsParser,
    files: ['tests/**/*.{ts,tsx}'],
    languageOptions: {
      ...tsParser.languageOptions,
      globals: { ...globals.browser, ...globals.node },
    },
    rules: {
      'no-unused-vars': 'off',
      '@typescript-eslint/no-unused-vars': ['warn', { argsIgnorePattern: '^_', varsIgnorePattern: '^(test|it|describe|expect|vi)$' }],
      '@typescript-eslint/no-explicit-any': 'off',
      ...sharedRules,
    },
  },

  // Node (server, config file, scripts)
  {
    ...tsParser,
    files: ['server/**/*.ts', '*.config.ts', '*.config.js', 'scripts/**/*.mjs', 'scripts/**/*.js'],
    languageOptions: {
      ...tsParser.languageOptions,
      globals: globals.node,
    },
    rules: {
      'no-unused-vars': 'off',
      '@typescript-eslint/no-unused-vars': ['warn', { argsIgnorePattern: '^_' }],
      '@typescript-eslint/no-explicit-any': 'off',
      ...sharedRules,
    },
  },

  // Deno (Edge Functions)
  {
    ...tsParser,
    files: ['supabase/functions/**/*.ts'],
    languageOptions: {
      ...tsParser.languageOptions,
      globals: { ...globals.node, ...globals.es2022, Deno: 'readonly' },
    },
    rules: {
      'no-unused-vars': 'off',
      '@typescript-eslint/no-unused-vars': ['warn', { argsIgnorePattern: '^_' }],
      '@typescript-eslint/no-explicit-any': 'off',
      ...sharedRules,
    },
  },
];
