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
  { ignores: ['node_modules/**', 'dist/**', 'generated/**', 'target/**', 'bible/**'] },
  {
    files: ['**/*.ts', '**/*.js'],
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
