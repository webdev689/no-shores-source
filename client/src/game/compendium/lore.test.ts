import assert from 'node:assert/strict';
import { test } from 'node:test';
import type { GearState } from '../../network/gearMessages.ts';
import { Lore, READ_KEY } from './lore.ts';
import { SAMPLE_LORE, storage } from './loreForTests.ts';

const gear = (lore: readonly number[], claimed = true) => ({ lore, quest: { claimed } }) as unknown as GearState;

function loreOf(account = 'arlo-fan') {
  let [now, who] = [0, account as string | null];
  const kept = storage();
  const lore = new Lore(
    kept,
    () => who,
    () => now,
    SAMPLE_LORE,
  );
  return { lore, kept, at: (millis: number) => (now = millis), as: (name: string | null) => (who = name) };
}

test('a chapter found is toasted as it comes, not what the first word on the account held, nor a room’s own character', () => {
  const { lore, at } = loreOf();
  lore.hear(gear([0, 4]));
  assert.deepEqual(lore.toasts, [], 'found before');
  lore.hear(gear([], false));
  assert.deepEqual(lore.toasts, [], "a room's starting character is not the player's");
  lore.hear(gear([0, 4, 1]));
  assert.deepEqual(lore.toasts, ['Lore found: The Drowned Bell, Under the Water']);
  lore.hear(gear([0, 4, 1]));
  assert.equal(lore.toasts.length, 1, 'once');
  at(7000);
  assert.deepEqual(lore.toasts, [], 'gone after a while');
});

test('another account’s first word toasts nothing, and each account keeps what it read in this browser', () => {
  const { lore, kept, as } = loreOf();
  lore.hear(gear([0]));
  assert.equal(lore.unread([0]), true);
  lore.markRead('bell/first');
  assert.equal(lore.isRead('bell/first'), true);
  assert.equal(lore.unread([0]), false);
  assert.deepEqual(JSON.parse(kept.kept.get(`${READ_KEY}.arlo-fan`) ?? '[]'), ['bell/first']);
  as('sable');
  lore.hear(gear([0, 1]));
  assert.deepEqual(lore.toasts, [], 'all found before, on this account');
  assert.equal(lore.isRead('bell/first'), false, 'read on another account');
  as('arlo-fan');
  assert.equal(lore.isRead('bell/first'), true, 'kept for its own');
  const again = new Lore(
    kept,
    () => 'arlo-fan',
    () => 0,
    SAMPLE_LORE,
  );
  assert.equal(again.isRead('bell/first'), true, 'kept across pages');
});

test('a browser that keeps nothing, or kept something else, still shows the lore', () => {
  const failing = {
    getItem: () => '{"not":"a list"}',
    setItem: () => {
      throw new Error('full');
    },
  };
  const lore = new Lore(
    failing,
    () => null,
    () => 0,
    SAMPLE_LORE,
  );
  assert.equal(lore.isRead('bell/first'), false);
  lore.markRead('bell/first');
  assert.equal(lore.isRead('bell/first'), true, 'read for this page');
  assert.equal(lore.shelf([0])[0]?.found, 1);
});
