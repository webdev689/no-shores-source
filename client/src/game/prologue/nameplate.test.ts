import assert from 'node:assert/strict';
import { test } from 'node:test';
import { EMBLEM_FACTIONS } from '../../plus/emblems.ts';
import { Stack } from '../../ui/stack.ts';
import { fakeInterface, laidOf, wordsOf } from '../../ui/uiForTests.ts';
import { Nameplate } from './nameplate.ts';

test('a nameplate strikes in with its emblem, name and faction, is told aloud, and fades when hidden', () => {
  const said: string[] = [];
  Object.assign(globalThis, { document: { ariaNotify: (words: string) => said.push(words) } });
  const clock = { now: 0 };
  const stack = new Stack();
  const { ui } = fakeInterface();
  const plate = new Nameplate(stack, () => clock.now);
  assert.deepEqual(wordsOf(laidOf(stack.node(ui))), []);
  plate.show('Captain Orrin Vale', EMBLEM_FACTIONS[0] ?? 0, 'The Iron Tide');
  clock.now = 2;
  const laid = laidOf(stack.node(ui));
  assert.ok(wordsOf(laid).includes('CAPTAIN ORRIN VALE'));
  assert.ok(wordsOf(laid).includes('THE IRON TIDE'));
  assert.ok(laid.some((each) => each.node.picture?.key.startsWith('data:') || each.node.picture?.source));
  assert.deepEqual(said, ['Captain Orrin Vale, The Iron Tide']);
  plate.hide();
  clock.now = 3;
  assert.deepEqual(wordsOf(laidOf(stack.node(ui))), []);
  plate.remove();
  Object.assign(globalThis, { document: undefined });
});
