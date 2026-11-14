// TypeScript checks shapes and Prettier owns layout; ESLint holds what neither does: readable names and a few traps.
import tseslint from 'typescript-eslint';

/** Short names everyone reads at a glance: loop counters, axes, and a few universal terms. */
const SHORT_NAMES = [
  'i',
  'j',
  'k',
  'x',
  'y',
  'z',
  'w',
  'h',
  'a',
  'b',
  't',
  'n',
  'dt',
  'id',
  'ok',
  'gl',
  'ui',
  'up',
  'to',
];

export default tseslint.config(
  // ESLint does not read .gitignore, so the toolkit's working folders and the helpers' worktrees are named here too.
  {
    ignores: [
      'node_modules/**',
      'dist/**',
      'generated/**',
      'target/**',
      'bible/**',
      '.claude/**',
      'graphify-out/**',
      '.serena/**',
    ],
  },
  {
    // Every extension a script may carry: the same list as the repo checks' SCRIPT_EXTENSIONS.
    files: ['**/*.{ts,mts,cts,tsx,js,mjs,cjs}'],
    extends: [tseslint.configs.base],
    linterOptions: { reportUnusedDisableDirectives: 'error' },
    rules: {
      'id-length': ['error', { min: 3, exceptions: SHORT_NAMES, properties: 'never' }],
      'eqeqeq': ['error', 'always'],
      'no-var': 'error',
      'prefer-const': 'error',
      'no-fallthrough': 'error',
      'no-self-compare': 'error',
      '@typescript-eslint/no-explicit-any': 'error',
      '@typescript-eslint/no-unused-vars': ['error', { argsIgnorePattern: '^_', caughtErrors: 'none' }],
      '@typescript-eslint/consistent-type-imports': 'error',
    },
  },
);
