import assert from 'node:assert/strict';
import { test } from 'node:test';
import { KEEPER_KINDS } from '../keepers.ts';
import { isKeeperView, keyBeside } from './npcScreen.ts';

test('the focus left by a keeper’s ware goes to the one after it in its row, then before, then the next row’s first and the row before’s last', () => {
  const rows = [['art', 'rise'], ['a', 'b'], ['opened']];
  assert.equal(keyBeside(rows, 'a'), 'b');
  assert.equal(keyBeside(rows, 'b'), 'a');
  assert.equal(keyBeside([['art', 'rise'], ['last'], ['opened']], 'last'), 'opened');
  assert.equal(keyBeside([['art'], ['last']], 'last'), 'art');
  assert.equal(keyBeside([['alone']], 'alone'), null);
  assert.equal(keyBeside(rows, 'never shown'), null);
});

test('every counter opens a keeper’s screen, the vault’s among them; the menu’s tabs do not', () => {
  for (const kind of KEEPER_KINDS) assert.equal(isKeeperView(kind), true, kind);
  assert.equal(isKeeperView('inventory'), false);
});
