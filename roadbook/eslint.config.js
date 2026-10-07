import js from '@eslint/js';
import globals from 'globals';

export default [
  { ignores: ['dist', 'node_modules', 'public'] },
  js.configs.recommended,
  {
    files: ['src/**/*.{js,jsx}'],
    languageOptions: { ecmaVersion: 2024, sourceType: 'module', globals: { ...globals.browser }, parserOptions: { ecmaFeatures: { jsx: true } } },
    rules: { 'no-unused-vars': ['error', { argsIgnorePattern: '^_', varsIgnorePattern: '^(_|[A-Z])' }], 'no-restricted-properties': ['error', { property: 'innerHTML', message: 'Never insert HTML. Use JSX.' }] },
  },
  { files: ['tests/**/*.mjs', 'scripts/**/*.mjs', 'vite.config.js'], languageOptions: { globals: { ...globals.node } } },
];
