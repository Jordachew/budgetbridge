import js from '@eslint/js';
import globals from 'globals';
import noUnsanitized from 'eslint-plugin-no-unsanitized';

export default [
  { ignores: ['app/vendor/**', 'dist/**', 'node_modules/**'] },
  js.configs.recommended,
  {
    files: ['app/**/*.js'],
    languageOptions: { ecmaVersion: 2023, sourceType: 'module', globals: { ...globals.browser, ...globals.serviceworker } },
    plugins: { 'no-unsanitized': noUnsanitized },
    rules: {
      'no-unsanitized/method': 'error', 'no-unsanitized/property': 'error',
      'no-eval': 'error', 'no-implied-eval': 'error', 'no-new-func': 'error', 'no-script-url': 'error',
      'no-unused-vars': ['warn', { argsIgnorePattern: '^_', caughtErrors: 'none' }],
      'no-undef': 'error', 'no-var': 'error', eqeqeq: ['error', 'always', { null: 'ignore' }],
    },
  },
  { files: ['app/config.js', 'app/sw.js'], languageOptions: { sourceType: 'script', globals: { ...globals.browser, ...globals.serviceworker } } },
  { files: ['scripts/**/*.mjs', 'tests/**/*.mjs', 'eslint.config.js'], languageOptions: { ecmaVersion: 2023, sourceType: 'module', globals: { ...globals.node, ...globals.browser } } },
];
