import globals from 'globals';

export default [
  {
    ignores: ['src/assets/wasm/**'],
  },
  {
    files: ['src/**/*.js'],
    languageOptions: {
      ecmaVersion: 2022,
      sourceType: 'module',
      globals: {
        ...globals.browser,
        ...globals.webextensions,
        chrome: 'readonly',
      },
    },
    rules: {
      'no-unused-vars': 'error',
      'no-undef': 'error',
      'no-eval': 'error',
      'no-implied-eval': 'error',
    },
  },
];
