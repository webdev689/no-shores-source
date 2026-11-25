import assert from 'node:assert/strict';
import { existsSync } from 'node:fs';
import { test } from 'node:test';
import { REPO, codeOf, decided, importedFrom, underCode, workflowText } from '../deployReadyForTests.ts';

const rooms = workflowText('rooms.yml');
/** The paths the accounts are built from, as their own step in the rooms' workflow lists them. */
const accountsCode = codeOf(rooms, 'accounts');

test('every file the accounts’ Worker is built from lies under the accounts’ code', () => {
  const files = importedFrom(['server/accounts/worker.ts']);
  assert.ok(files.includes('server/keeping.ts'), 'the room files it imports are followed');
  for (const path of files) assert.ok(existsSync(new URL(path, REPO)) && underCode(accountsCode, path), path);
});

/** What the ready step decides for the accounts, as `decided` runs it. */
const accountsDecided = (changed: string, asked: Parameters<typeof decided>[3] = {}) =>
  decided('accounts', accountsCode, changed, asked);

test('the accounts deploy when their own code changed since their own last deploy, not the rooms’ or the bot’s', () => {
  assert.equal(accountsDecided('server/accounts/worker.ts'), 'deploy=yes');
  assert.equal(accountsDecided('server/keeping.ts'), 'deploy=yes', 'a room file the accounts import');
  assert.equal(accountsDecided('crates/room/src/lib.rs'), 'deploy=no', 'the rooms alone');
  assert.equal(accountsDecided('server/bot/worker.ts'), 'deploy=no', 'the bot alone');
  assert.equal(accountsDecided('bible/Hand-off.md'), 'deploy=no');
  assert.equal(accountsDecided('bible/Hand-off.md', { found: false }), 'deploy=yes', 'never deployed on their own');
});

test('a failed accounts deploy is tried again: the accounts keep their own record, and the rooms deploy without them', () => {
  const accounts = /\n {2}accounts:\n((?: {4}.*\n|\s*\n)*)/.exec(rooms)?.[1] ?? '';
  assert.match(accounts, /if: needs\.ready\.outputs\.accounts == 'yes'/);
  assert.match(accounts, /environment: accounts/, 'recorded apart from the rooms');
  const deploy = /\n {2}deploy:\n((?: {4}.*\n|\s*\n)*)/.exec(rooms)?.[1] ?? '';
  assert.match(deploy, /needs: \[ready, accounts\]/);
  assert.match(deploy, /!cancelled\(\) && needs\.ready\.outputs\.deploy == 'yes'/, 'the rooms deploy even so');
});
