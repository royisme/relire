import { defineConfig } from 'oxlint';
import reactHooks from 'eslint-plugin-react-hooks';

// Native Hooks rules handle dependency/control-flow checks; the official JS
// plugin supplies compiler diagnostics that do not have native equivalents.
const hookRules = Object.fromEntries(
  Object.entries(reactHooks.configs.flat.recommended.rules)
    .filter(([name]) => !['react-hooks/rules-of-hooks', 'react-hooks/exhaustive-deps'].includes(name))
    .map(([name, value]) => [name.replace('react-hooks/', 'react-hooks-js/'), value]),
);

export default defineConfig({
  plugins: ['typescript', 'react', 'oxc'],
  jsPlugins: [{ name: 'react-hooks-js', specifier: 'eslint-plugin-react-hooks' }],
  options: { typeAware: true, reportUnusedDisableDirectives: 'error' },
  env: { browser: true, node: true, es2022: true },
  ignorePatterns: [
    '**/node_modules/**',
    'worker/.wrangler/**',
    'dist/**',
    'dev-dist/**',
    'test-results/**',
    'playwright-report/**',
  ],
  categories: { correctness: 'error' },
  rules: {
    'typescript/no-explicit-any': 'error',
    'typescript/no-floating-promises': 'error',
    // React handlers own their async pending/error UI; other void callbacks must
    // still consume rejections explicitly.
    'typescript/no-misused-promises': ['error', { checksVoidReturn: { attributes: false } }],
    'react/rules-of-hooks': 'error',
    'react/exhaustive-deps': 'error',
    ...hookRules,
  },
  overrides: [
    {
      // Playwright fixtures call `use()`, which is not a React hook.
      files: ['e2e/**/*.ts'],
      rules: { 'react/rules-of-hooks': 'off', 'react-hooks-js/rules-of-hooks': 'off' },
    },
  ],
});
