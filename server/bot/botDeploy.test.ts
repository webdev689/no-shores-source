import assert from 'node:assert/strict';
import { existsSync, readFileSync } from 'node:fs';
import { dirname, join, normalize } from 'node:path';
import { test } from 'node:test';
import { REPO, codeOf, decided, refused, underCode, workflowText } from '../deployReadyForTests.ts';

/** The paths the bot is built from, as its workflow lists them. */
const botCode = codeOf(workflowText('bot.yml'));

/** Every file a module imports by a relative path, and what those import in turn, from the repository's root. */
function importedFrom(roots: readonly string[]): string[] {
  const found = new Set<string>();
  const visit = (path: string) => {
    if (found.has(path)) return;
    found.add(path);
    if (!path.endsWith('.ts')) return;
    const text = readFileSync(new URL(path, REPO), 'utf8');
    for (const [, file] of text.matchAll(/(?:from|import) '(\.[^']+)'/g))
      visit(normalize(join(dirname(path), file ?? '')));
  };
  roots.forEach(visit);
  return [...found].sort();
}

test('every file the bot’s Worker and its command writer are built from lies under the bot’s code', () => {
  const files = importedFrom(['server/bot/worker.ts', 'tools/botCommands.ts']);
  assert.ok(files.includes('server/accounts/linked.ts'), 'the reach into the accounts is followed');
  for (const path of files) assert.ok(existsSync(new URL(path, REPO)) && underCode(botCode, path), path);
});

/** What the ready step decides for the bot, as `decided` runs it. */
const botDecided = (changed: string, asked: Parameters<typeof decided>[3] = {}) =>
  decided('bot', botCode, changed, asked);

test('a merge deploys the bot when its code changed since its last deploy, and not for the rooms’ or notes', () => {
  assert.equal(botDecided('server/bot/worker.ts'), 'deploy=yes');
  assert.equal(botDecided('server/accounts/linked.ts'), 'deploy=yes', 'the accounts’ reader it imports');
  assert.equal(botDecided('.github/workflows/bot.yml'), 'deploy=yes', 'the workflow itself');
  assert.equal(botDecided('server/worker.ts'), 'deploy=no', 'the rooms alone');
  assert.equal(botDecided('bible/Hand-off.md'), 'deploy=no');
  assert.equal(botDecided('bible/Hand-off.md', { byHand: true }), 'deploy=yes', 'by hand, whatever changed');
  assert.throws(() => botDecided('server/bot/worker.ts', { byHand: true, checked: false }), refused);
  assert.equal(botDecided('server/bot/worker.ts', { token: false }), 'deploy=blocked');
});

test('on main, the bot deploys after the rooms’ workflow, which deploys the accounts its binding names', () => {
  const checks = readFileSync(new URL('.github/workflows/ci.yml', REPO), 'utf8');
  const bot = /\n  bot:\n((?: {4}.*\n|\s*\n)*)/.exec(checks)?.[1] ?? '';
  assert.match(bot, /needs: \[check, rooms\]/);
  assert.match(bot, /uses: \.\/\.github\/workflows\/bot\.yml/);
  assert.match(bot, /needs\.check\.result == 'success'/, 'only a commit that passed the check');
});
